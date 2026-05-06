/**
 * POST /api/cron/dispatch-notifications
 *
 * Sends all due pending_notifications via Expo Push API.
 * QStash config: every 60 seconds, Bearer = CRON_SECRET
 */
import { NextResponse } from "next/server"
import { verifyCronAuth } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
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
    include: { user: { include: { deviceTokens: true } } },
    take: BATCH_SIZE,
    orderBy: { scheduledFor: "asc" },
  })

  if (due.length === 0) return NextResponse.json({ sent: 0 })

  const messages: object[] = []
  const ids: string[] = []

  for (const notif of due) {
    for (const device of notif.user.deviceTokens) {
      messages.push({
        to: device.token,
        title: notif.title,
        body: notif.body,
        data: notif.data ?? {},
        sound: "default",
      })
    }
    ids.push(notif.id)
  }

  let receipts: { id?: string }[] = []
  if (messages.length > 0) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      })
      const json = await res.json()
      receipts = json.data ?? []
    } catch {
      // Push failed but still mark sent to avoid retry storm
    }
  }

  // Mark all as sent; store first receipt ID per notification for later polling
  await Promise.all(
    ids.map((id, i) =>
      prisma.pendingNotification.update({
        where: { id },
        data: { sentAt: now, receiptId: receipts[i]?.id ?? null },
      })
    )
  )

  return NextResponse.json({ sent: ids.length, pushed: messages.length })
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
