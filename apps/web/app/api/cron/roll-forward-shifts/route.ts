import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { generateOccurrences, occurrencesToFillWindow, type RecurrenceRule } from "@/lib/recurrence"
import { differenceInCalendarWeeks } from "date-fns"
import { queueShiftReminder } from "@/lib/shift-notifications"

const WINDOW_WEEKS = 6

/**
 * Cron Job: Roll Forward Recurring Shifts
 * Keeps 6 weeks of future instances live for every active recurring shift series.
 * Should be run daily (recurrence intervals are weeks-to-months, unlike event status
 * transitions which need 5-minute granularity).
 *
 * QStash Configuration:
 * - URL: https://xivvenuemanager.com/api/cron/roll-forward-shifts
 * - Schedule: Daily (cron: 0 6 * * *)
 * - Method: GET
 * - Headers: { "authorization": "Bearer YOUR_CRON_SECRET" }
 */
export async function GET(request: Request) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const now = new Date()
    console.log(`[Cron] Shift roll-forward starting at ${now.toISOString()}`)

    const recurringParents = await prisma.shift.findMany({
      where: { recurrenceRule: { not: null }, parentShiftId: null, status: { not: "CANCELLED" } },
      select: {
        id: true,
        venueId: true,
        membershipId: true,
        roleId: true,
        notes: true,
        recurrenceRule: true,
        venue: { select: { name: true } },
        membership: { select: { userId: true } },
      },
    })

    let generated = 0

    for (const parent of recurringParents) {
      const latestChild = await prisma.shift.findFirst({
        where: { parentShiftId: parent.id, status: { not: "CANCELLED" } },
        orderBy: { scheduledStart: "desc" },
        select: { scheduledStart: true, scheduledEnd: true },
      })
      if (!latestChild) continue // series was fully cancelled or never generated — skip

      const weeksRemaining = differenceInCalendarWeeks(latestChild.scheduledStart, now)
      if (weeksRemaining >= WINDOW_WEEKS) continue

      const rule = parent.recurrenceRule as RecurrenceRule
      const count = occurrencesToFillWindow(rule, WINDOW_WEEKS - weeksRemaining)
      if (count <= 0) continue

      const occurrences = generateOccurrences(
        latestChild.scheduledStart,
        latestChild.scheduledEnd,
        rule,
        count
      )

      const created = await prisma.$transaction(
        occurrences.map((o) =>
          prisma.shift.create({
            data: {
              venueId: parent.venueId,
              membershipId: parent.membershipId,
              roleId: parent.roleId,
              status: parent.membershipId ? "SCHEDULED" : "OPEN",
              scheduledStart: o.startTime,
              scheduledEnd: o.endTime,
              notes: parent.notes,
              parentShiftId: parent.id,
            },
          })
        )
      )

      if (parent.membership?.userId) {
        for (const child of created) {
          queueShiftReminder(
            parent.membership.userId,
            parent.venueId,
            parent.venue.name,
            child.id,
            child.scheduledStart
          )
        }
      }

      generated += created.length
    }

    return NextResponse.json({ success: true, seriesChecked: recurringParents.length, generated })
  } catch (error) {
    console.error("Error in roll-forward-shifts cron job:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
