import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logShiftAudit } from "@/lib/shift-audit"

/**
 * POST /api/venues/[venueId]/shifts/[shiftId]/cancel-series
 * Cancels every future, non-terminal occurrence in this shift's recurring series.
 * Accepts either the parent shift ID or any child's ID. OWNER/MANAGER only.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; shiftId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, shiftId } = await params

    const venue = await prisma.venue.findFirst({
      where: { OR: [{ id: venueId }, { slug: venueId }] },
    })
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 })
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, venueId: venue.id, status: "active" },
    })
    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "Only managers can cancel a series" }, { status: 403 })
    }

    const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
    if (!shift || shift.venueId !== venue.id) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 })
    }

    const parentId = shift.parentShiftId ?? shift.id

    const now = new Date()
    const { count } = await prisma.shift.updateMany({
      where: {
        OR: [{ id: parentId }, { parentShiftId: parentId }],
        scheduledStart: { gt: now },
        status: { in: ["OPEN", "CLAIMED", "SCHEDULED"] },
      },
      data: { status: "CANCELLED" },
    })

    await logShiftAudit(parentId, "CANCEL_SERIES", session.user.id, "web")

    return NextResponse.json({ cancelled: count })
  } catch (error) {
    console.error("Error cancelling shift series:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
