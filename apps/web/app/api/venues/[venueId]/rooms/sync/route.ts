import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getRoomsWithFallback } from "@/lib/frogge-api"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { venueId } = await params

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, venueId, status: "active" },
  })
  if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const rooms = await getRoomsWithFallback(venueId)
    return NextResponse.json({ synced: rooms.length })
  } catch (error) {
    console.error("[Rooms sync] Error:", error)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}
