import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"
import { logShiftAudit } from "@/lib/shift-audit"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shiftId: string }> }
) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const { shiftId } = await params
  const body = await req.json().catch(() => ({}))
  const { venueId } = body

  if (!venueId || typeof venueId !== "string") {
    return NextResponse.json({ error: "venueId required" }, { status: 400 })
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, venueId, status: "active" },
  })
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this venue" }, { status: 403 })
  }

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, venueId, status: "OPEN" },
  })
  if (!shift) {
    return NextResponse.json({ error: "Shift not found or already claimed" }, { status: 404 })
  }

  // Optimistic concurrency — only update if still OPEN
  const writeResult = await prisma.shift.updateMany({
    where: { id: shiftId, status: "OPEN" },
    data: { status: "CLAIMED", membershipId: membership.id },
  })
  if (writeResult.count === 0) {
    return NextResponse.json({ error: "Shift was just claimed by someone else" }, { status: 409 })
  }

  await logShiftAudit(shiftId, "CLAIM", userId, "mobile_self")

  return NextResponse.json({ success: true })
}
