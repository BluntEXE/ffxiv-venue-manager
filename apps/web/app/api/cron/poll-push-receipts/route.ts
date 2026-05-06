/**
 * POST /api/cron/poll-push-receipts
 *
 * Polls Expo push receipt endpoint to check delivery status.
 * Logs errors but takes no corrective action in v1.
 * QStash config: every 30 minutes, Bearer = CRON_SECRET
 */
import { NextResponse } from "next/server"
import { verifyCronAuth } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000) // last 48h only

  const sent = await prisma.pendingNotification.findMany({
    where: {
      sentAt: { not: null, gte: since },
      receiptId: { not: null },
    },
    select: { receiptId: true },
    take: 300,
  })

  const ids = sent.map((n) => n.receiptId).filter(Boolean) as string[]
  if (ids.length === 0) return NextResponse.json({ checked: 0 })

  try {
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids }),
    })
    const json = await res.json()
    const errors = Object.entries(json.data ?? {})
      .filter(([, v]: [string, any]) => v.status === "error")
      .map(([id, v]: [string, any]) => ({ id, details: v.details }))

    if (errors.length > 0) {
      console.error("[push-receipts] delivery errors:", errors)
    }

    return NextResponse.json({ checked: ids.length, errors: errors.length })
  } catch (e) {
    console.error("[push-receipts] fetch failed", e)
    return NextResponse.json({ checked: 0, error: "fetch failed" })
  }
}
