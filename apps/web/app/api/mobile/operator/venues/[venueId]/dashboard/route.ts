// GET /api/mobile/operator/venues/:venueId/dashboard
// Today's snapshot: events, shifts, quick stats
import { NextResponse } from "next/server"
import { requireOperator, isOperatorContext } from "@/lib/mobile-operator-auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params
  const ctx = await requireOperator(req, venueId)
  if (!isOperatorContext(ctx)) return ctx

  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const [events, shifts] = await Promise.all([
    prisma.event.findMany({
      where: {
        venueId,
        startTime: { gte: startOfDay, lte: endOfDay },
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        title: true,
        eventType: true,
        status: true,
        startTime: true,
        endTime: true,
        attendanceCount: true,
        partakeAttendeeCount: true,
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.shift.findMany({
      where: {
        venueId,
        scheduledStart: { lte: endOfDay },
        scheduledEnd: { gte: startOfDay },
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        actualStart: true,
        membership: {
          select: {
            user: { select: { name: true, image: true } },
            role: true,
          },
        },
      },
      orderBy: { scheduledStart: "asc" },
    }),
  ])

  const activeShifts = shifts.filter((s) => s.status === "ACTIVE").length
  const scheduledShifts = shifts.filter((s) => s.status === "SCHEDULED").length

  return NextResponse.json({
    events,
    shifts,
    summary: {
      totalEvents: events.length,
      activeShifts,
      scheduledShifts,
      totalStaff: shifts.length,
    },
  })
}
