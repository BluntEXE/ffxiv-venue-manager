import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { validateApiKey, checkPermission } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"

/**
 * POST /api/plugin/shifts/clock-in
 *
 * Clock into a shift. Sets actualStart to now and status to ACTIVE.
 * Only the assigned staff member can clock in, and only if the shift is
 * SCHEDULED and within a reasonable window (30 min before scheduledStart
 * to 60 min after - prevents accidental clock-ins on distant shifts).
 */
const bodySchema = z.object({
  shiftId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get("x-api-key")
    if (!apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, "write")
    if (limited) return limited

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "shiftId is required" },
        { status: 400 }
      )
    }

    const shift = await prisma.shift.findUnique({
      where: { id: parsed.data.shiftId },
      include: { membership: true },
    })

    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 })
    }

    if (!auth.venues.includes(shift.venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    // Verify the authenticated user owns this shift
    if (shift.membership.userId !== auth.userId) {
      return NextResponse.json(
        { error: "This shift is not assigned to you" },
        { status: 403 }
      )
    }

    const canClock = await checkPermission(
      auth.userId,
      shift.venueId,
      "clock_shift"
    )
    if (!canClock) {
      return NextResponse.json(
        { error: "You do not have permission to clock shifts" },
        { status: 403 }
      )
    }

    if (shift.status !== "SCHEDULED") {
      return NextResponse.json(
        { error: `Cannot clock into a ${shift.status.toLowerCase()} shift` },
        { status: 400 }
      )
    }

    // Window check: 30 min before to 60 min after scheduled start
    const now = new Date()
    const earliestClockIn = new Date(
      shift.scheduledStart.getTime() - 30 * 60 * 1000
    )
    const latestClockIn = new Date(
      shift.scheduledStart.getTime() + 60 * 60 * 1000
    )

    if (now < earliestClockIn) {
      return NextResponse.json(
        { error: "Too early to clock in (earliest 30 min before start)" },
        { status: 400 }
      )
    }
    if (now > latestClockIn) {
      return NextResponse.json(
        { error: "Clock-in window has passed (60 min after start)" },
        { status: 400 }
      )
    }

    const updated = await prisma.shift.update({
      where: { id: shift.id },
      data: {
        actualStart: now,
        status: "ACTIVE",
      },
    })

    return NextResponse.json({
      success: true,
      shift: {
        id: updated.id,
        actualStart: updated.actualStart?.toISOString() ?? null,
        status: updated.status,
      },
    })
  } catch (error) {
    console.error("[Plugin API] Error clocking in:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
