import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireOperator, isOperatorContext } from "@/lib/mobile-operator-auth"

const patchSchema = z.object({
  action: z.enum(["clock-in", "clock-out"]),
})

/**
 * PATCH /api/mobile/operator/venues/[venueId]/shifts/[shiftId]
 * Owner/manager clock any staff member in or out.
 * No time-window restriction — managers can override at any time.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ venueId: string; shiftId: string }> }
) {
  const { venueId, shiftId } = await params
  const ctx = await requireOperator(req, venueId)
  if (!isOperatorContext(ctx)) return ctx

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "action must be clock-in or clock-out" }, { status: 400 })
  }

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, venueId },
    include: {
      venue: { select: { id: true, name: true } },
      membership: { select: { user: { select: { name: true } } } },
    },
  })

  if (!shift) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 })
  }

  const now = new Date()

  if (parsed.data.action === "clock-in") {
    if (shift.status !== "SCHEDULED") {
      return NextResponse.json(
        { error: `Cannot clock in — shift is already ${shift.status.toLowerCase()}` },
        { status: 400 }
      )
    }

    const writeResult = await prisma.shift.updateMany({
      where: { id: shift.id, status: "SCHEDULED" },
      data: { actualStart: now, status: "ACTIVE" },
    })
    if (writeResult.count === 0) {
      return NextResponse.json({ error: "Shift status changed concurrently" }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      shift: { id: shift.id, status: "ACTIVE", actualStart: now.toISOString() },
    })
  }

  // clock-out
  if (shift.status !== "ACTIVE") {
    return NextResponse.json(
      { error: `Cannot clock out — shift is already ${shift.status.toLowerCase()}` },
      { status: 400 }
    )
  }

  const calculatedHours = shift.actualStart
    ? Math.round(((now.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)) * 100) / 100
    : null

  const writeResult = await prisma.shift.updateMany({
    where: { id: shift.id, status: "ACTIVE" },
    data: { actualEnd: now, status: "COMPLETED", hoursWorked: calculatedHours },
  })
  if (writeResult.count === 0) {
    return NextResponse.json({ error: "Shift status changed concurrently" }, { status: 409 })
  }

  return NextResponse.json({
    success: true,
    shift: { id: shift.id, status: "COMPLETED", actualEnd: now.toISOString(), hoursWorked: calculatedHours },
  })
}
