import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { logShiftAudit } from "@/lib/shift-audit"

const patchSchema = z.object({
  action: z.enum(["clock-in", "clock-out"]),
})

/**
 * PATCH /api/mobile/my/shifts/[shiftId]
 * Staff self-service clock in/out via mobile JWT.
 * Own shifts only. 30-min-before/60-min-after window for clock-in.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ shiftId: string }> }
) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const { shiftId } = await params

  const body = await req.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "action must be clock-in or clock-out" }, { status: 400 })
  }

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, membership: { userId } },
    include: { venue: { select: { id: true, name: true } } },
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

    const earliest = new Date(shift.scheduledStart.getTime() - 30 * 60 * 1000)
    const latest = new Date(shift.scheduledStart.getTime() + 60 * 60 * 1000)
    if (now < earliest) {
      return NextResponse.json(
        { error: "Too early to clock in (earliest 30 min before start)" },
        { status: 400 }
      )
    }
    if (now > latest) {
      return NextResponse.json(
        { error: "Clock-in window has passed (60 min after start)" },
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

    queueOpenedNowNotifications(shift.venue.id, shift.venue.name, now).catch(() => {})
    await logShiftAudit(shift.id, "CLOCK_IN", userId, "mobile_self")

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

  await logShiftAudit(shift.id, "CLOCK_OUT", userId, "mobile_self")

  return NextResponse.json({
    success: true,
    shift: { id: shift.id, status: "COMPLETED", actualEnd: now.toISOString(), hoursWorked: calculatedHours },
  })
}

async function queueOpenedNowNotifications(venueId: string, venueName: string, now: Date) {
  const recentlySent = await prisma.pendingNotification.findFirst({
    where: {
      type: "VENUE_OPENED_NOW",
      data: { path: ["venueId"], equals: venueId },
      createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
    },
  })
  if (recentlySent) return

  const follows = await prisma.venueFollow.findMany({
    where: { venueId },
    select: { userId: true },
  })
  if (follows.length === 0) return

  await prisma.pendingNotification.createMany({
    data: follows.map((f) => ({
      userId: f.userId,
      type: "VENUE_OPENED_NOW" as const,
      title: `${venueName} is open!`,
      body: "A venue you follow just opened.",
      data: { venueId },
      scheduledFor: now,
    })),
  })
}
