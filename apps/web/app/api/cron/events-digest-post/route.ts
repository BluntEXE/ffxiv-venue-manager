import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { postEventsDigestDay } from "@/lib/discord-feed"

const MAX_EVENTS_PER_DAY = 20

/**
 * Cron Job: Rebuild the 7 day-messages in the Events channel — one message
 * per calendar day (today through +6), listing every event (manually created
 * or Partake-synced) starting that day. Edited in place, not reposted.
 *
 * Should run every 15 minutes.
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const now = new Date()

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const dayStart = new Date(now)
    dayStart.setUTCDate(dayStart.getUTCDate() + dayOffset)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setUTCHours(23, 59, 59, 999)

    const events = await prisma.event.findMany({
      where: {
        startTime: { gte: dayStart, lte: dayEnd },
        status: { in: ["PUBLISHED", "ACTIVE"] },
      },
      select: {
        title: true,
        startTime: true,
        venue: { select: { name: true, slug: true } },
      },
      orderBy: { startTime: "asc" },
    })

    const dayLabel = dayStart.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    })

    const shown = events.slice(0, MAX_EVENTS_PER_DAY)
    const truncatedCount = events.length - shown.length

    postEventsDigestDay(dayOffset, dayLabel, shown, truncatedCount)
  }

  return NextResponse.json({ success: true, timestamp: now.toISOString() })
}
