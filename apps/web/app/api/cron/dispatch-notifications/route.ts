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
