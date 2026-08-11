import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { postEventsDigestDay } from "@/lib/discord-feed"
import { formatServerTime } from "@/lib/server-time"

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

    const dayLabel = formatServerTime(dayStart, "weekdate")

    const shown = events.slice(0, MAX_EVENTS_PER_DAY)
    const truncatedCount = events.length - shown.length

    // Awaited sequentially (not fire-and-forget) so the bot sends/edits each
    // day's message in order — 7 concurrent posts land in whatever order the
    // bot's async handler finishes them, not day order.
    await postEventsDigestDay(dayOffset, dayLabel, shown, truncatedCount)
  }

  return NextResponse.json({ success: true, timestamp: now.toISOString() })
}
