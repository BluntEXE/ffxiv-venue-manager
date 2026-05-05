import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * DELETE /api/venues/[venueId]/shifts/[shiftId]
 * Hard-deletes a shift and its linked payroll entry (if any).
 * OWNER/MANAGER only. Runs in a transaction so either both rows go or neither does.
 */
export async function DELETE(
  request: NextRequest,
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
      return NextResponse.json(
        { error: "Only managers can delete shifts" },
        { status: 403 }
      )
    }

    const shift = await prisma.shift.findFirst({
      where: { id: shiftId, venueId: venue.id },
      select: { id: true, payrollEntryId: true },
    })
    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.shift.delete({ where: { id: shift.id } })
      if (shift.payrollEntryId) {
        // Cascade the payroll entry too. Without this, analytics keeps
        // counting the old payroll against the venue even after the shift
        // that generated it is gone.
        await tx.payrollEntry.delete({ where: { id: shift.payrollEntryId } })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting shift:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
