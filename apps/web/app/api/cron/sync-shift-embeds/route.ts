import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { postShiftEmbedsForEvent } from "@/lib/shift-bot"
import { parseVenueSettings } from "@xiv-venue-manager/types"

export async function GET(request: Request) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const now = new Date()
  const stats = { posted: 0, skipped: 0, errors: 0 }

  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      settings: true,
      events: {
        where: {
          status: "PUBLISHED",
          startTime: { gt: now },
        },
        select: { id: true, title: true, startTime: true, endTime: true },
      },
    },
  })

  for (const venue of venues) {
    const settings = parseVenueSettings(venue.settings)
    const shiftBot = settings.shiftBot
    if (!shiftBot?.enabled || !shiftBot.channelId || !shiftBot.templates?.length) {
      stats.skipped++
      continue
    }

    const daysBeforeEvent = shiftBot.daysBeforeEvent ?? 3
    const cutoff = new Date(now.getTime() + daysBeforeEvent * 86_400_000)

    for (const event of venue.events) {
      if (event.startTime > cutoff) continue

      const templates = shiftBot.templates.length > 0
        ? shiftBot.templates
        : [{
            name: "Event Shift",
            startOffsetHours: 0,
            durationHours: Math.round((event.endTime.getTime() - event.startTime.getTime()) / 3_600_000),
            slots: 10,
          }]

      try {
        await postShiftEmbedsForEvent(
          event.id,
          venue.id,
          event.title,
          event.startTime,
          event.endTime,
          shiftBot.channelId,
          templates
        )
        stats.posted++
      } catch (err) {
        console.error(`[ShiftBot] Failed to post embed for ${venue.name} / ${event.title}:`, err)
        stats.errors++
      }
    }
  }

  return NextResponse.json({ success: true, timestamp: now.toISOString(), stats })
}
