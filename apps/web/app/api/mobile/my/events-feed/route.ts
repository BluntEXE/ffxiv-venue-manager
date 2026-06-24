import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Get all followed venue IDs
  const follows = await prisma.venueFollow.findMany({
    where: { userId },
    select: { venueId: true },
  })
  if (follows.length === 0) return NextResponse.json([])

  const venueIds = follows.map((f) => f.venueId)

  // Get all qualifying events in the window
  const events = await prisma.event.findMany({
    where: {
      venueId: { in: venueIds },
      status: { in: ["PUBLISHED", "ACTIVE"] },
      startTime: { gte: now, lte: in7Days },
    },
    select: {
      id: true,
      venueId: true,
      title: true,
      startTime: true,
      endTime: true,
      eventType: true,
      partakeAttendeeCount: true,
      attendanceCount: true,
      venue: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  })

  // One per venue: keep only the first (soonest) event per venueId
  const seen = new Set<string>()
  const feed = events
    .filter((e) => {
      if (seen.has(e.venueId)) return false
      seen.add(e.venueId)
      return true
    })
    .slice(0, 15)

  return NextResponse.json(
    feed.map((e) => ({
      id: e.id,
      venueId: e.venueId,
      venueName: e.venue.name,
      title: e.title,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      eventType: e.eventType,
      partakeAttendeeCount: e.partakeAttendeeCount ?? null,
      attendanceCount: e.attendanceCount ?? null,
    }))
  )
}
