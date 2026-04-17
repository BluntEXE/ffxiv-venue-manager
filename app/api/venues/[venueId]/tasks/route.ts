import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  sendDiscordWebhook,
  formatTaskCreatedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const createTaskSchema = z.object({
  title: z.string().min(1, "Task title is required").max(200),
  description: z.string().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).default("PENDING"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  category: z.string().optional(),
  assignedRoleId: z.string().optional(), // Role-based assignment
  dueDate: z.string().optional(), // ISO date string
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { params } = context
      const { venueId } = await params
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const assignedTo = searchParams.get("assignedTo")
    const priority = searchParams.get("priority")

    // Check if user has access to this venue
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        status: "active",
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this venue" },
        { status: 403 }
      )
    }

    // Get venue settings
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { settings: true },
    })

    const venueSettings = venue?.settings as any

    // Build where clause
    const where: any = { venueId }
    if (status) where.status = status
    if (assignedTo) where.assignedTo = assignedTo
    if (priority) where.priority = priority

    // Apply task visibility settings for STAFF members
    if (membership.role === "STAFF" && venueSettings?.taskVisibility) {
      const taskVisibility = venueSettings.taskVisibility

      if (taskVisibility === "assigned") {
        // Staff only see tasks assigned to them
        where.assignedTo = session.user.id
      } else if (taskVisibility === "assigned_unassigned") {
        // Staff see their tasks + unassigned tasks
        where.OR = [
          { assignedTo: session.user.id },
          { assignedTo: null },
        ]
      }
      // If "all", no additional filtering needed
    }

    // Get all tasks
    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        assignedRole: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        completer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { status: "asc" }, // Pending/In Progress first
        { priority: "desc" }, // Urgent first
        { dueDate: "asc" }, // Closest due date first
      ],
    })

      return NextResponse.json(tasks)
    } catch (error) {
      console.error("Error fetching tasks:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { params } = context
      const { venueId } = await params

    // Check if user has permission to create tasks
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        status: "active",
      },
    })

    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json(
        { error: "You don't have permission to create tasks" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createTaskSchema.parse(body)

    const newTask = await prisma.task.create({
      data: {
        venueId,
        title: validatedData.title,
        description: validatedData.description,
        status: validatedData.status,
        priority: validatedData.priority,
        category: validatedData.category,
        assignedRoleId: validatedData.assignedRoleId,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        assignedRole: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    })
    // Send Discord webhook notification if enabled
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        name: true,
        discordWebhookUrl: true,
        settings: true,
      },
    })

    if (venue) {
      const webhookConfig: VenueWebhookConfig = {
        discordWebhooks: (venue.settings as any)?.discordWebhooks,
        webhooks: (venue.settings as any)?.webhooks,
        discordWebhookUrl: venue.discordWebhookUrl,
      }

      console.log(`[Task Created] Venue: ${venue.name}`)
      console.log(`[Task Created] Webhook Config:`, JSON.stringify({
        hasDiscordWebhooks: !!webhookConfig.discordWebhooks,
        staffWebhookUrl: webhookConfig.discordWebhooks?.staff?.substring(0, 50) + "...",
        hasWebhooksSettings: !!webhookConfig.webhooks,
        taskCreatedEnabled: webhookConfig.webhooks?.taskCreated,
        legacyWebhookUrl: webhookConfig.discordWebhookUrl?.substring(0, 50) + "...",
      }, null, 2))

      const webhookUrl = getWebhookUrlForType(webhookConfig, "taskCreated")
      console.log(`[Task Created] Resolved webhook URL: ${webhookUrl ? webhookUrl.substring(0, 50) + "..." : "null"}`)

      if (webhookUrl) {
        const embed = formatTaskCreatedEmbed({
          title: newTask.title,
          description: newTask.description,
          priority: newTask.priority,
          dueDate: newTask.dueDate,
          assignee: newTask.assignee,
        })

        console.log(`[Task Created] Sending webhook for task: "${newTask.title}"`)
        // Send webhook asynchronously (don't wait for response)
        sendDiscordWebhook(webhookUrl, { embeds: [embed] })
          .then((success) => {
            if (success) {
              console.log(`[Task Created] ✅ Webhook sent successfully`)
            } else {
              console.error(`[Task Created] ❌ Webhook failed (returned false)`)
            }
          })
          .catch((error) => {
            console.error(`[Task Created] ❌ Webhook error:`, error)
          })
      } else {
        console.log(`[Task Created] ⚠️  No webhook URL found - webhook not sent`)
      }
    }

      return NextResponse.json(newTask, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error creating task:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 10, window: "1 m" }
)
