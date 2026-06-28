import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { postPartakeDigest } from "@/lib/discord-feed"
import { addDays } from "date-fns"

export async function GET(request: Request) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const now = new Date()
  const weekAhead = addDays(now, 7)

  const events = await prisma.event.findMany({
    where: {
      partakeEventId: { not: null },
      status: { in: ["PUBLISHED", "ACTIVE"] },
      startTime: { gte: now, lte: weekAhead },
    },
    select: {
      title: true,
      startTime: true,
      endTime: true,
      venue: { select: { name: true, slug: true } },
    },
    orderBy: { startTime: "asc" },
  })

  if (events.length === 0) {
    console.log("[partake-digest] No upcoming events this week, skipping post")
    return NextResponse.json({ success: true, posted: false, events: 0 })
  }

  await postPartakeDigest(events)

  console.log(`[partake-digest] Posted digest with ${events.length} events`)
  return NextResponse.json({ success: true, posted: true, events: events.length })
}
