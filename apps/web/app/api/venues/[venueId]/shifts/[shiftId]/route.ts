import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const patchSchema = z.object({
  action: z.enum(["clock-in", "clock-out", "claim", "approve", "reject"]),
})

/**
 * PATCH /api/venues/[venueId]/shifts/[shiftId]
 * Clock a shift in or out.
 * - OWNER/MANAGER: any shift, no time window
 * - STAFF: own shifts only, 30-min-before/60-min-after window for clock-in
 */
export async function PATCH(
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
    if (!membership) {
      return NextResponse.json({ error: "Not a member of this venue" }, { status: 403 })
    }

    const isManager = ["OWNER", "MANAGER"].includes(membership.role)

    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "action must be clock-in or clock-out" }, { status: 400 })
    }

    const shift = await prisma.shift.findFirst({
      where: { id: shiftId, venueId: venue.id },
    })
    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 })
    }

    // --- CLAIM ---
    if (parsed.data.action === "claim") {
      if (shift.status !== "OPEN") {
        return NextResponse.json(
          { error: `Shift is already ${shift.status.toLowerCase()}` },
          { status: 400 }
        )
      }
      const result = await prisma.shift.updateMany({
        where: { id: shift.id, status: "OPEN" },
        data: { membershipId: membership.id, status: "CLAIMED" },
      })
      if (result.count === 0) {
        return NextResponse.json(
          { error: "This shift was just claimed by someone else" },
          { status: 409 }
        )
      }
      return NextResponse.json({ success: true, shift: { id: shift.id, status: "CLAIMED" } })
    }

    // --- APPROVE ---
    if (parsed.data.action === "approve") {
      if (!isManager) {
        return NextResponse.json({ error: "Only managers can approve claims" }, { status: 403 })
      }
      if (shift.status !== "CLAIMED") {
        return NextResponse.json(
          { error: `Shift is ${shift.status.toLowerCase()}, not claimed` },
          { status: 400 }
        )
      }
      const result = await prisma.shift.updateMany({
        where: { id: shift.id, status: "CLAIMED" },
        data: { status: "SCHEDULED" },
      })
      if (result.count === 0) {
        return NextResponse.json({ error: "Shift status changed concurrently" }, { status: 409 })
      }
      if (shift.membershipId) {
        const claimant = await prisma.membership.findUnique({
          where: { id: shift.membershipId },
          select: { userId: true },
        })
        if (claimant?.userId) {
          const now = new Date()
          const shiftDate = shift.scheduledStart.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
          // Immediate approval notification
          prisma.pendingNotification.create({
            data: {
              userId: claimant.userId,
              type: "SHIFT_CLAIM_APPROVED",
              title: "Shift claim approved",
              body: `Your claim for the ${shiftDate} shift at ${venue.name} was approved. You're on the schedule!`,
              data: { venueId: venue.id, shiftId: shift.id },
              scheduledFor: now,
            },
          }).catch(() => {})
          // Shift reminder 1 hour before start
          const reminderAt = new Date(shift.scheduledStart.getTime() - 60 * 60 * 1000)
          if (reminderAt > now) {
            prisma.pendingNotification.create({
              data: {
                userId: claimant.userId,
                type: "SHIFT_REMINDER",
                title: "Shift starting soon",
                body: `Your shift at ${venue.name} starts in 1 hour.`,
                data: { venueId: venue.id, shiftId: shift.id },
                scheduledFor: reminderAt,
              },
            }).catch(() => {})
          }
        }
      }
      return NextResponse.json({ success: true, shift: { id: shift.id, status: "SCHEDULED" } })
    }

    // --- REJECT ---
    if (parsed.data.action === "reject") {
      if (!isManager) {
        return NextResponse.json({ error: "Only managers can reject claims" }, { status: 403 })
      }
      if (shift.status !== "CLAIMED") {
        return NextResponse.json(
          { error: `Shift is ${shift.status.toLowerCase()}, not claimed` },
          { status: 400 }
        )
      }
      const result = await prisma.shift.updateMany({
        where: { id: shift.id, status: "CLAIMED" },
        data: { membershipId: null, status: "OPEN" },
      })
      if (result.count === 0) {
        return NextResponse.json({ error: "Shift status changed concurrently" }, { status: 409 })
      }
      // Notify the claimant — shift.membershipId captured before the update cleared it
      if (shift.membershipId) {
        const claimant = await prisma.membership.findUnique({
          where: { id: shift.membershipId },
          select: { userId: true },
        })
        if (claimant?.userId) {
          const shiftDate = shift.scheduledStart.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
          prisma.pendingNotification.create({
            data: {
              userId: claimant.userId,
              type: "SHIFT_CLAIM_REJECTED",
              title: "Shift claim not approved",
              body: `Your claim for the ${shiftDate} shift at ${venue.name} wasn't approved. The slot is still open.`,
              data: { venueId: venue.id, shiftId: shift.id },
              scheduledFor: new Date(),
            },
          }).catch(() => {})
        }
      }
      return NextResponse.json({ success: true, shift: { id: shift.id, status: "OPEN" } })
    }

    // Clock-in / clock-out — only the assigned member or a manager
    if (!isManager && shift.membershipId !== membership.id) {
      return NextResponse.json({ error: "This shift is not assigned to you" }, { status: 403 })
    }

    const now = new Date()

    if (parsed.data.action === "clock-in") {
      if (shift.status !== "SCHEDULED") {
        return NextResponse.json(
          { error: `Cannot clock in — shift is already ${shift.status.toLowerCase()}` },
          { status: 400 }
        )
      }

      if (!isManager) {
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
      }

      const writeResult = await prisma.shift.updateMany({
        where: { id: shift.id, status: "SCHEDULED" },
        data: { actualStart: now, status: "ACTIVE" },
      })

      if (writeResult.count === 0) {
        return NextResponse.json({ error: "Shift status changed concurrently" }, { status: 409 })
      }

      queueOpenedNowNotifications(venue.id, venue.name, now).catch(() => {})

      return NextResponse.json({
        success: true,
        shift: { id: shift.id, status: "ACTIVE", actualStart: now.toISOString() },
      })
    }

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
  } catch (error) {
    console.error("Error updating shift:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
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
        await tx.payrollEntry.delete({ where: { id: shift.payrollEntryId } })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting shift:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
