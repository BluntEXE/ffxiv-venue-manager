import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { pluginAuthGate, checkPermission, logPatronVisit, getPatronVisits } from "@/lib/api/plugin-auth"
import { venueEventBus } from "@/lib/sse/venue-events"
import { nanoid } from "nanoid"
import { prisma } from "@/lib/prisma"
import { postVenueGraduation, postPatronVisitXp } from "@/lib/discord-feed"
import { validators } from "@/lib/validation"

const GRADUATION_MILESTONES = [100, 500, 1000]

const patronVisitSchema = z.object({
  venueId: z.string().min(1, "venueId is required"),
  characterName: validators.characterName,
  world: validators.world,
  action: z.enum(["enter", "leave", "present"], { message: "action must be one of: 'enter', 'leave', 'present'" }),
  timestamp: validators.datetime,
})

/**
 * POST /api/plugin/patron-visits
 *
 * Log a patron visit (from the Dalamud plugin)
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "write")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const body = await request.json()
    let venueId: string, characterName: string, world: string, action: "enter" | "leave" | "present", timestamp: string
    try {
      const parsed = patronVisitSchema.parse(body)
      venueId = parsed.venueId
      characterName = parsed.characterName
      world = parsed.world
      action = parsed.action
      timestamp = parsed.timestamp
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      throw error
    }

    // Check permission
    const canLog = await checkPermission(auth.userId, venueId, "log_patron")
    if (!canLog) {
      return NextResponse.json({ error: "Permission denied to log at this venue" }, { status: 403 })
    }

    const result = await logPatronVisit({
      venueId,
      characterName,
      world,
      action,
      timestamp: new Date(timestamp),
      loggedBy: auth.userId,
    })

    if (!result.deduped && !result.wasWorking) {
      venueEventBus.emit(venueId, {
        id: result.id,
        type: action === "enter" ? "patron_enter" : "patron_exit",
        venueId,
        timestamp: new Date(timestamp).toISOString(),
        data: { characterName, world },
      })
    }

    if (!result.deduped && action === "enter") {
      const totalEnters = await prisma.patronLog.count({
        where: { venueId, action: "ENTER" },
      })
      if (GRADUATION_MILESTONES.includes(totalEnters)) {
        const venue = await prisma.venue.findUnique({
          where: { id: venueId },
          select: { name: true, slug: true },
        })
        if (venue) postVenueGraduation(venue, totalEnters)
      }
      postPatronVisitXp(venueId, characterName, world)
    }

    return NextResponse.json({
      success: true,
      message: result.deduped ? "Duplicate suppressed (state already matches)" : "Patron visit logged",
      data: {
        id: result.id,
        characterName,
        world,
        action,
        deduped: result.deduped,
        wasWorking: result.wasWorking,
        eventId: result.eventId,
      },
    })
  } catch (error) {
    console.error("[Plugin API] Error logging patron visit:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * GET /api/plugin/patron-visits?venueId=xxx
 *
 * Retrieve patron visit history
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get("venueId")
    const limit = parseInt(searchParams.get("limit") || "50")

    if (!venueId) {
      return NextResponse.json({ error: "venueId is required" }, { status: 400 })
    }

    // Check if user has access to this venue
    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Access denied to this venue" }, { status: 403 })
    }

    const visits = await getPatronVisits(venueId, limit)

    return NextResponse.json({
      visits: visits.map((v) => ({
        id: v.id,
        characterName: v.characterName,
        world: v.world,
        action: v.action,
        countChange: v.countChange,
        timestamp: v.timestamp,
        loggedAt: v.loggedAt,
      })),
    })
  } catch (error) {
    console.error("[Plugin API] Error fetching patron visits:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
