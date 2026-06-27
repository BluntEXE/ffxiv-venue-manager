import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; eventId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { venueId, eventId } = await params

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, venueId, status: "active" },
  })

  if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Accept either the parent event or a child — resolve to parent
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event || event.venueId !== venueId) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 })
  }

  const parentId = event.parentEventId ?? event.id

  const now = new Date()
  const { count } = await prisma.event.updateMany({
    where: {
      parentEventId: parentId,
      startTime: { gt: now },
      status: { in: ["DRAFT", "PUBLISHED"] },
    },
    data: { status: "CANCELLED" },
  })

  return NextResponse.json({ cancelled: count })
}
