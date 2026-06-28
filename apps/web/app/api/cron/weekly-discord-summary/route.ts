import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { postWeeklySummary } from "@/lib/discord-feed"
import { startOfWeek, endOfWeek } from "date-fns"

export async function GET(request: Request) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }) // Monday
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

  const [newVenues, eventsHosted, patronVisits, newStaff] = await Promise.all([
    prisma.venue.count({
      where: { createdAt: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.event.count({
      where: { status: "COMPLETED", endTime: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.patronLog.count({
      where: { timestamp: { gte: weekStart, lte: weekEnd }, action: "ENTER" },
    }),
    prisma.membership.count({
      where: {
        role: "STAFF",
        status: "active",
        createdAt: { gte: weekStart, lte: weekEnd },
      },
    }),
  ])

  const visits = patronVisits

  await postWeeklySummary({ newVenues, eventsHosted, patronVisits: visits, newStaff, weekStart })

  console.log(`[weekly-summary] venues=${newVenues} events=${eventsHosted} visits=${visits} staff=${newStaff}`)

  return NextResponse.json({ success: true, newVenues, eventsHosted, patronVisits: visits, newStaff })
}
