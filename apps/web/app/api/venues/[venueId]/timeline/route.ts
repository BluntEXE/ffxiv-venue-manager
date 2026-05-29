import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { venueId } = await params
  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get("cursor")
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
  const type = searchParams.get("type")
  const eventId = searchParams.get("eventId")

  // Verify membership
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, venueId, status: "active" },
  })
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const items: Array<{
    id: string
    type: "sale" | "patron_enter" | "patron_exit"
    timestamp: Date
    data: Record<string, unknown>
  }> = []

  // Fetch transactions
  if (!type || type === "sales") {
    const where: Record<string, unknown> = { venueId }
    if (cursor) where.createdAt = { lt: new Date(cursor) }
    if (eventId) where.eventId = eventId

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        service: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } },
        staff: {
          select: {
            id: true,
            name: true,
            image: true,
            memberships: {
              where: { venueId },
              select: {
                role: true,
                customRole: { select: { name: true, color: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    for (const t of transactions) {
      items.push({
        id: `sale_${t.id}`,
        type: "sale",
        timestamp: t.createdAt,
        data: {
          amount: Number(t.amount),
          customerName: t.customerName,
          notes: t.notes,
          service: t.service,
          event: t.event,
          staff: t.staff,
        },
      })
    }
  }

  // Fetch patron logs
  if (!type || type === "patrons") {
    const where: Record<string, unknown> = { venueId }
    if (cursor) where.timestamp = { lt: new Date(cursor) }
    if (eventId) where.eventId = eventId

    const patronLogs = await prisma.patronLog.findMany({
      where,
      include: {
        event: { select: { id: true, title: true } },
        staff: { select: { id: true, name: true } },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    })

    for (const p of patronLogs) {
      items.push({
        id: `patron_${p.id}`,
        type: p.action === "ENTER" ? "patron_enter" : "patron_exit",
        timestamp: p.timestamp,
        data: {
          characterName: p.characterName,
          world: p.world,
          action: p.action,
          countChange: p.countChange,
          event: p.event,
          loggedBy: p.staff,
        },
      })
    }
  }

  // Sort merged results by timestamp desc
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  // Trim to limit
  const trimmed = items.slice(0, limit)
  const nextCursor =
    trimmed.length === limit
      ? trimmed[trimmed.length - 1].timestamp.toISOString()
      : null

  return NextResponse.json({
    items: trimmed,
    nextCursor,
    hasMore: trimmed.length === limit,
  })
}
