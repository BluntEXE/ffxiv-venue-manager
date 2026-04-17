import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  sendDiscordWebhook,
  formatTaskCompletedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  category: z.string().nullable().optional(),
  assignedRoleId: z.string().nullable().optional(), // Role-based assignment
  dueDate: z.string().nullable().optional(),
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
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
      const { venueId, taskId } = await params

    // Check permissions
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

    const task = await prisma.task.findUnique({
      where: { id: taskId, venueId },
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
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

      return NextResponse.json(task)
    } catch (error) {
      console.error("Error fetching task:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
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
      const { venueId, taskId } = await params

    // Check permissions
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

    const task = await prisma.task.findUnique({
      where: { id: taskId, venueId },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Check if user can update this task
    // OWNER/MANAGER can always update, OR users with the assigned role
    let canUpdate = ["OWNER", "MANAGER"].includes(membership.role)
    
    // If task is assigned to a role, check if user has that role
    if (!canUpdate && task.assignedRoleId) {
      const userHasRole = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          roleId: task.assignedRoleId,
        },
      })
      canUpdate = !!userHasRole
    }

    if (!canUpdate) {
      return NextResponse.json(
        { error: "You don't have permission to update this task" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = updateTaskSchema.parse(body)


    // Prepare update data
    const updateData: any = {}
    if (validatedData.title !== undefined) updateData.title = validatedData.title
    if (validatedData.description !== undefined) updateData.description = validatedData.description
    if (validatedData.status !== undefined) {
      updateData.status = validatedData.status
      // If marking as completed, set completion time and user
      if (validatedData.status === "COMPLETED" && task.status !== "COMPLETED") {
        updateData.completedAt = new Date()
        updateData.completedBy = session.user.id
      }
      // If changing from completed to something else, clear completion data
      if (validatedData.status !== "COMPLETED" && task.status === "COMPLETED") {
        updateData.completedAt = null
        updateData.completedBy = null
      }
    }
    if (validatedData.priority !== undefined) updateData.priority = validatedData.priority
    if (validatedData.category !== undefined) updateData.category = validatedData.category
    if (validatedData.assignedRoleId !== undefined) updateData.assignedRoleId = validatedData.assignedRoleId
    if (validatedData.dueDate !== undefined) {
      updateData.dueDate = validatedData.dueDate ? new Date(validatedData.dueDate) : null
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId, venueId },
      data: updateData,
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
    })

    // Send Discord webhook notification if task was marked as completed
    if (validatedData.status === "COMPLETED" && task.status !== "COMPLETED") {
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: {
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

        const webhookUrl = getWebhookUrlForType(webhookConfig, "taskCompleted")
        if (webhookUrl) {
          const embed = formatTaskCompletedEmbed({
            title: updatedTask.title,
            priority: updatedTask.priority,
            completer: updatedTask.completer,
          })

          // Send webhook asynchronously (don't wait for response)
          sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch(
            (error) => console.error("Failed to send Discord webhook:", error)
          )
        }
      }
    }

      return NextResponse.json(updatedTask)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error updating task:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
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
      const { venueId, taskId } = await params

    // Check permissions
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        status: "active",
      },
    })

    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners and managers can delete tasks" },
        { status: 403 }
      )
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId, venueId },
    })

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    await prisma.task.delete({
      where: { id: taskId, venueId },
    })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error("Error deleting task:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 5, window: "1 m" }
)
