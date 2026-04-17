import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { VenueSettings, parseVenueSettings } from "@/lib/types/venue-settings"

const webhookSettingsSchema = z.object({
  taskCreated: z.boolean().optional(),
  taskCompleted: z.boolean().optional(),
  eventCreated: z.boolean().optional(),
  eventStartingSoon: z.boolean().optional(),
  saleLogged: z.boolean().optional(),
  dailySalesSummary: z.boolean().optional(),
  staffJoined: z.boolean().optional(),
})

const discordWebhooksSchema = z.object({
  staff: z.string().optional().or(z.literal("")),
  events: z.string().optional().or(z.literal("")),
  revenue: z.string().optional().or(z.literal("")),
})

const updateSettingsSchema = z.object({
  taskVisibility: z.enum(["all", "assigned", "assigned_unassigned"]).optional(),
  salesVisibility: z.enum(["all", "own", "none"]).optional(),
  revenueVisibility: z.enum(["all", "hide", "own"]).optional(),
  eventVisibility: z.enum(["all", "published"]).optional(),
  webhooks: webhookSettingsSchema.optional(),
  discordWebhooks: discordWebhooksSchema.optional(),
  // Keep for backward compatibility
  discordWebhookUrl: z.string().url().optional().or(z.literal("")),
  // Partake integration
  partakeTeamId: z.number().int().positive().nullable().optional(),
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
      select: {
        settings: true,
        discordWebhookUrl: true,
        partakeTeamId: true,
      },
    })

    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 })
    }

      return NextResponse.json({
        ...parseVenueSettings(venue.settings),
        discordWebhookUrl: venue.discordWebhookUrl,
        partakeTeamId: venue.partakeTeamId,
      })
    } catch (error) {
      console.error("Error fetching venue settings:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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

    // Check if user has permission to update settings (OWNER only)
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        status: "active",
      },
    })

    if (!membership || membership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only venue owners can update settings" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = updateSettingsSchema.parse(body)

    // Get current settings
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { settings: true },
    })

    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 })
    }

    // Extract top-level venue columns from validated data
    const { discordWebhookUrl, partakeTeamId, ...settingsData } = validatedData

    // Merge new settings with existing settings (type-safe)
    const currentSettings = parseVenueSettings(venue.settings)
    const newSettings: VenueSettings = {
      ...currentSettings,
      ...settingsData,
    }

    // Update venue settings, webhook URL, and Partake team ID
    const updatedVenue = await prisma.venue.update({
      where: { id: venueId },
      data: {
        settings: newSettings as Prisma.InputJsonValue,
        ...(discordWebhookUrl !== undefined && {
          discordWebhookUrl: discordWebhookUrl || null,
        }),
        ...(partakeTeamId !== undefined && {
          partakeTeamId: partakeTeamId,
        }),
      },
      select: {
        settings: true,
        discordWebhookUrl: true,
        partakeTeamId: true,
      },
    })

      return NextResponse.json({
        ...parseVenueSettings(updatedVenue.settings),
        discordWebhookUrl: updatedVenue.discordWebhookUrl,
        partakeTeamId: updatedVenue.partakeTeamId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error updating venue settings:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 20, window: "1 m" }
)
