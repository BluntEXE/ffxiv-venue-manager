import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import {
  listTasks,
  createTask,
  listPositions,
  listTaskCategories,
  XvmApiError,
  xvmErrorMessage,
  type TaskRow,
  type PositionRow,
} from "@/lib/api/xvm-api"
import { priorityToInt, intToPriority, resolveCategoryId } from "@/lib/api/task-convert"
import { validators } from "@/lib/validation"
import {
  sendDiscordWebhook,
  formatTaskCreatedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"

const createTaskSchema = z.object({
  title: validators.taskTitle,
  description: validators.taskDescription,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  category: z.string().optional(),
  assignedRoleId: z.number().optional(), // Position id (xvm-api Positions, formerly Prisma Role)
  dueDate: z.string().optional(),
})

// Derived status label - xvm-api has no stored status enum, only timestamps.
// Order matters: a cancelled/completed task is never "in progress" even if
// it happens to have a started_at from before it closed.
function deriveStatus(task: TaskRow): "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" {
  if (task.cancelled_at) return "CANCELLED"
  if (task.completed_at) return "COMPLETED"
  if (task.started_at) return "IN_PROGRESS"
  return "PENDING"
}

function toTaskShape(task: TaskRow, positionsById: Map<number, PositionRow>) {
  const position = task.assigned_position_id ? positionsById.get(task.assigned_position_id) : null
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: deriveStatus(task),
    priority: intToPriority(task.priority),
    category: null as string | null, // resolved by the caller once categories are fetched - see GET/POST handlers
    categoryId: task.category_id,
    dueDate: task.due_at,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    assignee: null, // direct membership-based assignment isn't wired in the UI (see plan notes) - always null for now
    assignedRole: position ? { id: position.id, name: position.name, color: position.color } : null,
  }
}

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params
    const { searchParams } = new URL(request.url)
    // Cancelled tasks are hidden by default, matching xvm-api's own list_tasks
    // default - see the delete-maps-to-cancel decision. Completed tasks stay
    // visible by default since today's board always showed them.
    const includeCancelled = searchParams.get("includeCancelled") === "true"

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const [tasks, positions, categories] = await Promise.all([
        listTasks(token, gate.xvmApiVenueId!, { includeCompleted: true, includeCancelled }),
        listPositions(token, gate.xvmApiVenueId!),
        listTaskCategories(token, gate.xvmApiVenueId!),
      ])
      const positionsById = new Map(positions.map((p) => [p.id, p]))
      const categoriesById = new Map(categories.map((c) => [c.id, c.name]))
      const shaped = tasks.map((t) => {
        const shape = toTaskShape(t, positionsById)
        return { ...shape, category: t.category_id !== null ? (categoriesById.get(t.category_id) ?? null) : null }
      })
      return NextResponse.json(shaped)
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[tasks] GET error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof createTaskSchema>
    try {
      data = createTaskSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      let categoryId: number | null = null
      if (data.category) {
        categoryId = await resolveCategoryId(token, gate.xvmApiVenueId!, data.category)
      }

      const task = await createTask(token, gate.xvmApiVenueId!, {
        title: data.title,
        description: data.description ?? null,
        priority: priorityToInt(data.priority),
        due_at: data.dueDate ?? null,
        category_id: categoryId,
        assigned_position_id: data.assignedRoleId ?? null,
      })

      const positions = data.assignedRoleId ? await listPositions(token, gate.xvmApiVenueId!) : []
      const positionsById = new Map(positions.map((p) => [p.id, p]))
      const shape = toTaskShape(task, positionsById)

      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: { discordWebhookUrl: true, settings: true },
      })
      if (venue) {
        const venueSettings = venue.settings as Record<string, unknown> | null
        const webhookConfig: VenueWebhookConfig = {
          discordWebhooks: venueSettings?.discordWebhooks as VenueWebhookConfig["discordWebhooks"],
          webhooks: venueSettings?.webhooks as VenueWebhookConfig["webhooks"],
          discordWebhookUrl: venue.discordWebhookUrl,
        }
        const webhookUrl = getWebhookUrlForType(webhookConfig, "taskCreated")
        if (webhookUrl) {
          const embed = formatTaskCreatedEmbed({
            title: task.title,
            description: task.description,
            priority: data.priority,
            dueDate: task.due_at ? new Date(task.due_at) : null,
            assignee: null,
          })
          sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch((error) =>
            console.error("[Task Created] webhook error:", error)
          )
        }
      }

      return NextResponse.json({ ...shape, category: data.category ?? null }, { status: 201 })
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[tasks] POST error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 10, window: "1 m" }
)
