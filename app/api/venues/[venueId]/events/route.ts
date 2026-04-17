import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import {
  sendDiscordWebhook,
  formatEventCreatedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"

const eventSchema = z.object({
  title: z.string().min(1, "Event title is required"),
  description: z.string().optional(),
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]),
  status: z.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "CANCELLED"]).default("DRAFT"),
  startTime: z.string().transform((str) => new Date(str)),
  endTime: z.string().transform((str) => new Date(str)),
  timezone: z.string().default("UTC"),
})

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (
    request: NextRequest,
    context
  ) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await params

    // Check if user has permission to create events in this venue
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        status: "active",
      },
    })

    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json(
        { error: "You don't have permission to create events" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = eventSchema.parse(body)

    const event = await prisma.event.create({
      data: {
        ...validatedData,
        venueId,
        createdById: session.user.id,
      },
    })

    // Send Discord webhook notification if enabled
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

      const webhookUrl = getWebhookUrlForType(webhookConfig, "eventCreated")
      if (webhookUrl) {
        const embed = formatEventCreatedEmbed({
          title: event.title,
          description: event.description,
          eventType: event.eventType,
          startTime: event.startTime,
          endTime: event.endTime,
        })

        // Send webhook asynchronously (don't wait for response)
        sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch(
          (error) => console.error("Failed to send Discord webhook:", error)
        )
      }
    }

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      )
    }

    console.error("Error creating event:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
  },
  { requests: 10, window: "1 m" }
)

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (
    request: NextRequest,
    context
  ) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await params

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

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const where: any = { venueId }

    // Apply event visibility settings for STAFF members
    if (membership.role === "STAFF" && venueSettings?.eventVisibility === "published") {
      // Staff only see published events, hide drafts
      where.status = "PUBLISHED"
    }

    if (status) {
      where.status = status
    }

    if (startDate && endDate) {
      where.startTime = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        createdBy: {
          select: {
            name: true,
            image: true,
          },
        },
      },
      orderBy: {
        startTime: "asc",
      },
    })

    return NextResponse.json(events)
  } catch (error) {
    console.error("Error fetching events:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
  },
  { requests: 60, window: "1 m" }
)
