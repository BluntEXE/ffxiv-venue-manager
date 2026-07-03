import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyBotAuth } from "@/lib/bot-auth"
import { checkPermission } from "@/lib/api/plugin-auth"
import { logShiftAudit } from "@/lib/shift-audit"
import { syncVenueOpenStatus } from "@/lib/venue-status"

const CLOCK_IN_EARLY_MS = 30 * 60 * 1000
const CLOCK_IN_LATE_MS = 60 * 60 * 1000

/**
 * POST /api/bot/shifts/clock-in
 *
 * Called by Aetherlink's /clockin command. Body: { discordId: string }.
 * Finds the caller's one SCHEDULED shift within the clock-in window
 * (30 min before scheduledStart through 60 min after) and starts it —
 * same window and side effects as every other clock-in path.
 */
export async function POST(request: Request) {
  const authError = verifyBotAuth(request)
  if (authError) return authError

  const body = await request.json().catch(() => ({}))
  const discordId = typeof body.discordId === "string" ? body.discordId : null
  if (!discordId) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { discordId } })
  if (!user) {
    return NextResponse.json({ ok: false, code: "NOT_LINKED" })
  }

  const now = new Date()
  const windowStart = new Date(now.getTime() - CLOCK_IN_LATE_MS)
  const windowEnd = new Date(now.getTime() + CLOCK_IN_EARLY_MS)

  const candidates = await prisma.shift.findMany({
    where: {
      membership: { userId: user.id },
      status: "SCHEDULED",
      scheduledStart: { gte: windowStart, lte: windowEnd },
    },
    include: { venue: { select: { id: true, name: true } } },
    orderBy: { scheduledStart: "asc" },
  })

  const shift = candidates.find((s) => {
    const earliest = new Date(s.scheduledStart.getTime() - CLOCK_IN_EARLY_MS)
    const latest = new Date(s.scheduledStart.getTime() + CLOCK_IN_LATE_MS)
    return now >= earliest && now <= latest
  })

  if (!shift) {
    // Already-active check: distinguish "nothing scheduled" from
    // "you're already clocked in" so the bot can give the friendly
    // no-op message instead of a generic error.
    const active = await prisma.shift.findFirst({
      where: { membership: { userId: user.id }, status: "ACTIVE" },
      include: { venue: { select: { name: true } } },
    })
    if (active) {
      return NextResponse.json({
        ok: true,
        alreadyActive: true,
        venueName: active.venue.name,
        actualStart: active.actualStart?.toISOString() ?? null,
      })
    }
    return NextResponse.json({ ok: false, code: "NO_SHIFT" })
  }

  const canClock = await checkPermission(user.id, shift.venueId, "clock_shift")
  if (!canClock) {
    return NextResponse.json({ ok: false, code: "FORBIDDEN" })
  }

  const writeResult = await prisma.shift.updateMany({
    where: { id: shift.id, status: "SCHEDULED" },
    data: { actualStart: now, status: "ACTIVE" },
  })
  if (writeResult.count === 0) {
    return NextResponse.json({ ok: false, code: "CONFLICT" }, { status: 409 })
  }

  queueOpenedNowNotifications(shift.venue.id, shift.venue.name, now).catch(() => {})
  await logShiftAudit(shift.id, "CLOCK_IN", user.id, "discord")
  syncVenueOpenStatus(shift.venue.id).catch(() => {})

  return NextResponse.json({
    ok: true,
    alreadyActive: false,
    venueName: shift.venue.name,
    actualStart: now.toISOString(),
  })
}

async function queueOpenedNowNotifications(venueId: string, venueName: string, now: Date) {
  const recentlySent = await prisma.pendingNotification.findFirst({
    where: {
      type: "VENUE_OPENED_NOW",
      data: { path: ["venueId"], equals: venueId },
      createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
    },
  })
  if (recentlySent) return

  const follows = await prisma.venueFollow.findMany({
    where: { venueId },
    select: { userId: true },
  })
  if (follows.length === 0) return

  await prisma.pendingNotification.createMany({
    data: follows.map((f) => ({
      userId: f.userId,
      type: "VENUE_OPENED_NOW" as const,
      title: `${venueName} is open!`,
      body: "A venue you follow just opened.",
      data: { venueId },
      scheduledFor: now,
    })),
  })
}
