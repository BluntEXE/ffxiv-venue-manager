import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { VenueSettings, parseVenueSettings } from "@/lib/types/venue-settings"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import { getVenue, updateVenue, XvmApiError, xvmErrorMessage, type VenueUpdate } from "@/lib/api/xvm-api"

const webhookSettingsSchema = z.object({
  taskCreated: z.boolean().optional(),
  taskCompleted: z.boolean().optional(),
  partakeEvent: z.boolean().optional(),
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
  // ffxivvenues.com integration
  ffxivVenueId: z.string().nullable().optional(),
  // Venue type
  venueType: z
    .enum([
      "BAR_TAVERN",
      "NIGHTCLUB",
      "LOUNGE",
      "HOST_CLUB",
      "CABARET",
      "BATHHOUSE",
      "CASINO",
      "STUDIO",
      "OTHER",
      "TEST_VENUE",
    ])
    .nullable()
    .optional(),
  // Venue profile extras stored in settings JSON
  tagline: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  defaultHours: z.string().max(100).optional(),
  openNights: z.string().max(100).optional(),
  isAdult: z.boolean().optional(),
  // Discord Shift Bot
  shiftBot: z
    .object({
      enabled: z.boolean(),
      channelId: z.string().max(20),
      daysBeforeEvent: z.number().int().min(1).max(14).optional(),
      templates: z
        .array(
          z.object({
            name: z.string().max(100),
            startOffsetHours: z.number().min(0).max(23),
            durationHours: z.number().min(1).max(24),
            slots: z.number().int().min(1).max(100),
          })
        )
        .max(10),
      thumbnailUrl: z.string().url().optional().or(z.literal("")),
      cachedGuildIconUrl: z.string().optional(),
    })
    .optional(),
  // Room manager roles
  roomManagerRoleIds: z.array(z.string()).optional(),
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
        return NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 })
      }

      // Get venue settings
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: {
          settings: true,
          discordWebhookUrl: true,
          partakeTeamId: true,
          venueType: true,
          ffxivVenueId: true,
          ffxivVenueLinkedAt: true,
          froggeToken: true,
          xvmApiVenueId: true,
          venueSchedule: { select: { syncedAt: true } },
        },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      const responseBody: Record<string, unknown> = {
        ...parseVenueSettings(venue.settings),
        discordWebhookUrl: venue.discordWebhookUrl,
        partakeTeamId: venue.partakeTeamId,
        venueType: venue.venueType,
        ffxivVenueId: venue.ffxivVenueId,
        ffxivVenueLinkedAt: venue.ffxivVenueLinkedAt,
        froggeToken: venue.froggeToken,
        ffxivVenueSyncedAt: venue.venueSchedule?.syncedAt ?? null,
      }

      // Visibility settings are being migrated to xvm-api - it's the source of truth
      // for connected venues, Prisma's copy is a stale leftover for unconnected ones.
      if (venue.xvmApiVenueId) {
        const token = await getValidXvmApiToken(session.user.id)
        if (token) {
          try {
            const detail = await getVenue(token, venue.xvmApiVenueId)
            responseBody.taskVisibility = detail.task_visibility
            responseBody.salesVisibility = detail.sales_visibility
            responseBody.revenueVisibility = detail.revenue_visibility
            responseBody.eventVisibility = detail.event_visibility
          } catch (err) {
            console.error("[settings] getVenue error:", err)
          }
        }
      }

      return NextResponse.json(responseBody)
    } catch (error) {
      console.error("Error fetching venue settings:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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

      // Check if user has permission to update settings
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json({ error: "Not a member of this venue" }, { status: 403 })
      }

      const body = await request.json()
      const validatedData = updateSettingsSchema.parse(body)

      // Only OWNER can update most settings; MANAGER can update roomManagerRoleIds and the
      // operational staff-visibility fields. Revenue visibility stays owner-only - it's a
      // financial-disclosure policy call, not day-to-day staff coordination like the other three.
      const isOwner = membership.role === "OWNER"
      const isManager = membership.role === "MANAGER"
      const managerAllowedKeys = new Set(["roomManagerRoleIds", "taskVisibility", "salesVisibility", "eventVisibility"])
      const onlyManagerAllowedFields = Object.keys(validatedData).every((k) => managerAllowedKeys.has(k))

      if (!isOwner && !(isManager && onlyManagerAllowedFields)) {
        return NextResponse.json({ error: "Only venue owners can update settings" }, { status: 403 })
      }

      // Get current settings
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: { settings: true, xvmApiVenueId: true },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Extract top-level venue columns and xvm-api-owned visibility fields from validated data
      const {
        discordWebhookUrl,
        partakeTeamId,
        venueType,
        ffxivVenueId,
        taskVisibility,
        salesVisibility,
        revenueVisibility,
        eventVisibility,
        ...settingsData
      } = validatedData

      // Visibility settings are being migrated to xvm-api - it owns these now, Prisma's
      // settings JSON stops receiving updates to them for connected venues.
      const visibilityUpdate: VenueUpdate = {}
      if (taskVisibility !== undefined) visibilityUpdate.task_visibility = taskVisibility
      if (salesVisibility !== undefined) visibilityUpdate.sales_visibility = salesVisibility
      if (revenueVisibility !== undefined) visibilityUpdate.revenue_visibility = revenueVisibility
      if (eventVisibility !== undefined) visibilityUpdate.event_visibility = eventVisibility

      let xvmVenueDetail = null
      if (Object.keys(visibilityUpdate).length > 0) {
        if (!venue.xvmApiVenueId) {
          return NextResponse.json(
            { error: "not_connected", message: "Connect this venue to xvm-api before changing visibility settings." },
            { status: 409 }
          )
        }
        const token = await getValidXvmApiToken(session.user.id)
        if (!token) {
          return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
        }
        try {
          xvmVenueDetail = await updateVenue(token, venue.xvmApiVenueId, visibilityUpdate)
        } catch (err) {
          if (err instanceof XvmApiError && err.status !== 401) {
            return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
          }
          console.error("[settings] updateVenue error:", err)
          await invalidateXvmApiCredential(session.user.id)
          return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
        }
      }

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
          settings: newSettings as unknown as Prisma.InputJsonValue,
          ...(discordWebhookUrl !== undefined && {
            discordWebhookUrl: discordWebhookUrl || null,
          }),
          ...(partakeTeamId !== undefined && {
            partakeTeamId: partakeTeamId,
          }),
          ...(venueType !== undefined && {
            venueType: venueType,
          }),
          ...(ffxivVenueId !== undefined && {
            ffxivVenueId: ffxivVenueId,
            ffxivVenueLinkedAt: ffxivVenueId ? new Date() : null,
            ffxivVenueLinkedBy: ffxivVenueId ? session.user.id : null,
          }),
        },
        select: {
          settings: true,
          discordWebhookUrl: true,
          partakeTeamId: true,
          venueType: true,
          ffxivVenueId: true,
        },
      })

      // If unlinking, remove synced schedule data
      if (ffxivVenueId === null) {
        await prisma.venueSchedule.deleteMany({ where: { venueId } })
      }

      return NextResponse.json({
        ...parseVenueSettings(updatedVenue.settings),
        discordWebhookUrl: updatedVenue.discordWebhookUrl,
        partakeTeamId: updatedVenue.partakeTeamId,
        venueType: updatedVenue.venueType,
        ffxivVenueId: updatedVenue.ffxivVenueId,
        ...(xvmVenueDetail && {
          taskVisibility: xvmVenueDetail.task_visibility,
          salesVisibility: xvmVenueDetail.sales_visibility,
          revenueVisibility: xvmVenueDetail.revenue_visibility,
          eventVisibility: xvmVenueDetail.event_visibility,
        }),
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }

      console.error("Error updating venue settings:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)
