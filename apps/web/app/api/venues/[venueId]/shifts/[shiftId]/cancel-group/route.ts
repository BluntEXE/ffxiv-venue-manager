import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logShiftAudit } from "@/lib/shift-audit"

/**
 * POST /api/venues/[venueId]/shifts/[shiftId]/cancel-group
 * Cancels every future, non-terminal occurrence across every recurring series that
 * shares this shift's slotGroupId (e.g. all 4 Greeter slots created together, not just
 * the one that was clicked). Falls back to single-series behavior — identical to
 * cancel-series — when the shift has no slotGroupId. Accepts either a parent shift ID
 * or any child's ID. OWNER/MANAGER only.
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
    const parent = await prisma.shift.findUnique({
      where: { id: parentId },
      select: { slotGroupId: true },
    })

    // Every parent sharing the group tag, or just this one if there's no group.
    const groupParentIds = parent?.slotGroupId
      ? (
          await prisma.shift.findMany({
            where: { venueId: venue.id, slotGroupId: parent.slotGroupId, parentShiftId: null },
            select: { id: true },
          })
        ).map((p) => p.id)
      : [parentId]

    const now = new Date()
    const { count } = await prisma.shift.updateMany({
      where: {
        OR: [{ id: { in: groupParentIds } }, { parentShiftId: { in: groupParentIds } }],
        scheduledStart: { gt: now },
        status: { in: ["OPEN", "CLAIMED", "SCHEDULED"] },
      },
      data: { status: "CANCELLED" },
    })

    for (const id of groupParentIds) {
      await logShiftAudit(id, "CANCEL_SERIES", session.user.id, "web")
    }

    return NextResponse.json({ cancelled: count, seriesCancelled: groupParentIds.length })
  } catch (error) {
    console.error("Error cancelling shift group:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
