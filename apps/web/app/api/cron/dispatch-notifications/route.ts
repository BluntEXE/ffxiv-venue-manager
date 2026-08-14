/**
 * POST /api/cron/dispatch-notifications
 *
 * Queues EVENT_REMINDER_30M reminders and marks all due pending_notifications
 * as sent. Push delivery (Expo, mobile-only) was removed with the mobile app
 * (2026-08-14) — there is currently no delivery channel for these
 * notifications. This cron still runs to prevent pending_notifications from
 * growing unbounded (rows are marked sent instead of endlessly re-selected).
 * QStash config: every 60 seconds, Bearer = CRON_SECRET
 */
import { NextResponse } from "next/server"
import { verifyCronAuth } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"

const BATCH_SIZE = 100

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  // Queue EVENT_REMINDER_30M for events starting in 28-32 min with no reminder yet
  await queueEventReminders(now).catch(() => {})

  const due = await prisma.pendingNotification.findMany({
    where: { scheduledFor: { lte: now }, sentAt: null },
    select: { id: true },
    take: BATCH_SIZE,
    orderBy: { scheduledFor: "asc" },
  })

  if (due.length === 0) return NextResponse.json({ sent: 0 })

  await prisma.pendingNotification.updateMany({
    where: { id: { in: due.map((n) => n.id) } },
    data: { sentAt: now },
  })

  return NextResponse.json({ sent: due.length })
}

async function queueEventReminders(now: Date) {
  const windowStart = new Date(now.getTime() + 28 * 60 * 1000)
  const windowEnd   = new Date(now.getTime() + 32 * 60 * 1000)

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["PUBLISHED", "ACTIVE"] },
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      title: true,
      venueId: true,
      startTime: true,
      venue: {
        select: {
          name: true,
          follows: { select: { userId: true } },
        },
      },
    },
  })

  for (const event of events) {
    if (event.venue.follows.length === 0) continue

    // Skip if reminders already queued for this event
    const existing = await prisma.pendingNotification.findFirst({
      where: {
        type: "EVENT_REMINDER_30M",
        data: { path: ["eventId"], equals: event.id },
      },
    })
    if (existing) continue

    await prisma.pendingNotification.createMany({
      data: event.venue.follows.map((f) => ({
        userId: f.userId,
        type: "EVENT_REMINDER_30M" as const,
        title: `${event.venue.name} — starting soon`,
        body: `${event.title} starts in 30 minutes.`,
        data: { venueId: event.venueId, eventId: event.id },
        scheduledFor: now,
      })),
    })
  }
}
