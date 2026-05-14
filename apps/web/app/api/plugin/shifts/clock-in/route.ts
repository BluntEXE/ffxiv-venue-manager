import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { validateApiKey, checkPermission } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"

async function queueOpenedNowNotifications(venueId: string, now: Date) {
  // Only queue if no VENUE_OPENED_NOW notification was sent for this venue in the last 30 min
  // (prevents duplicate pushes if multiple staff clock in)
  const recentlySent = await prisma.pendingNotification.findFirst({
    where: {
      type: "VENUE_OPENED_NOW",
      data: { path: ["venueId"], equals: venueId },
      createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
    },
  })
  if (recentlySent) return

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { name: true, follows: { select: { userId: true } } },
  })
  if (!venue || venue.follows.length === 0) return

  await prisma.pendingNotification.createMany({
    data: venue.follows.map((f) => ({
      userId: f.userId,
      type: "VENUE_OPENED_NOW" as const,
      title: `${venue.name} is open!`,
      body: "A venue you follow just opened.",
      data: { venueId },
      scheduledFor: now,
    })),
  })
}

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
        { error: `Cannot clock in — shift is already ${shift.status.toLowerCase()}` },
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

    const writeResult = await prisma.shift.updateMany({
      where: { id: shift.id, status: "SCHEDULED" },
      data: { actualStart: now, status: "ACTIVE" },
    })

    if (writeResult.count === 0) {
      const current = await prisma.shift.findUnique({ where: { id: shift.id } })
      return NextResponse.json(
        { error: `Cannot clock in — shift is already ${current?.status.toLowerCase() ?? "unknown"}` },
        { status: 400 }
      )
    }

    // Queue VENUE_OPENED_NOW notifications for all followers (best-effort)
    queueOpenedNowNotifications(shift.venueId, now).catch(() => {})

    return NextResponse.json({
      success: true,
      shift: {
        id: shift.id,
        actualStart: now.toISOString(),
        status: "ACTIVE",
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
