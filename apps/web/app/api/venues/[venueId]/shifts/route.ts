import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { queueShiftReminder } from "@/lib/shift-notifications"
import { generateOccurrences, occurrencesToFillWindow, type RecurrenceRule } from "@/lib/recurrence"
import { z } from "zod"

/**
 * GET /api/venues/[venueId]/shifts
 * List shifts for a venue. Any active member can view.
 * Query params: from (ISO date), to (ISO date) for date range filtering.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await params

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
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    // Date range filter (default: past 7 days to 30 days ahead)
    const url = request.nextUrl
    const from = url.searchParams.get("from")
      ? new Date(url.searchParams.get("from")!)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const to = url.searchParams.get("to")
      ? new Date(url.searchParams.get("to")!)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const shifts = await prisma.shift.findMany({
      where: {
        venueId: venue.id,
        scheduledStart: { gte: from, lte: to },
      },
      include: {
        membership: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
        },
        role: { select: { id: true, name: true, color: true } },
      },
      orderBy: { scheduledStart: "asc" },
    })

    return NextResponse.json({
      shifts: shifts.map((s) => ({
        id: s.id,
        membershipId: s.membershipId,
        staffName: s.membership?.user?.name ?? "Unknown",
        staffImage: s.membership?.user?.image ?? null,
        roleId: s.roleId,
        roleName: s.role?.name ?? null,
        scheduledStart: s.scheduledStart.toISOString(),
        scheduledEnd: s.scheduledEnd.toISOString(),
        actualStart: s.actualStart?.toISOString() ?? null,
        actualEnd: s.actualEnd?.toISOString() ?? null,
        status: s.status,
        notes: s.notes,
      })),
    })
  } catch (error) {
    console.error("Error fetching shifts:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/venues/[venueId]/shifts
 * Create a shift. OWNER/MANAGER only.
 */
const createShiftSchema = z
  .object({
    membershipId: z.string().min(1).optional(),
    roleId: z.string().min(1).optional(),
    scheduledStart: z.string().datetime(),
    scheduledEnd: z.string().datetime(),
    notes: z.string().optional(),
    recurrenceRule: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
    slotGroupId: z.string().optional(),
  })
  // Cross-field rule (spans membershipId and roleId), so the error is form-level: no single field is "wrong" on its own.
  .refine((data) => Boolean(data.membershipId) || Boolean(data.roleId), {
    message: "Provide a staff member (assign now), a role (leave open), or both (assign now with a role tagged for pay)",
  })

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await params

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
        { error: "Only managers can create shifts" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parsed = createShiftSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.issues },
        { status: 400 }
      )
    }

    let targetMembership: { userId: string | null } | null = null
    let verifiedRoleId: string | null = null

    if (parsed.data.membershipId) {
      // Assigning to a specific person: verify they belong to this venue
      const member = await prisma.membership.findFirst({
        where: { id: parsed.data.membershipId, venueId: venue.id, status: "active" },
        select: { userId: true },
      })
      if (!member) {
        return NextResponse.json(
          { error: "Staff member not found at this venue" },
          { status: 400 }
        )
      }
      targetMembership = member
    }

    // Verified independently of assign/open mode: an assigned shift can optionally
    // also carry a role (for pay resolution), and an open shift always requires one.
    if (parsed.data.roleId) {
      const role = await prisma.role.findFirst({
        where: { id: parsed.data.roleId, venueId: venue.id },
        select: { id: true },
      })
      if (!role) {
        return NextResponse.json(
          { error: "Role not found at this venue" },
          { status: 400 }
        )
      }
      verifiedRoleId = role.id
    }

    const scheduledStart = new Date(parsed.data.scheduledStart)
    const scheduledEnd = new Date(parsed.data.scheduledEnd)
    const recurrenceRule = parsed.data.recurrenceRule

    const shift = await prisma.shift.create({
      data: {
        venueId: venue.id,
        membershipId: parsed.data.membershipId ?? null,
        roleId: verifiedRoleId,
        status: parsed.data.membershipId ? "SCHEDULED" : "OPEN",
        scheduledStart,
        scheduledEnd,
        notes: parsed.data.notes ?? null,
        recurrenceRule: recurrenceRule ?? null,
        slotGroupId: parsed.data.slotGroupId ?? null,
      },
    })

    let childShifts: { id: string; scheduledStart: Date }[] = []
    if (recurrenceRule) {
      const count = occurrencesToFillWindow(recurrenceRule as RecurrenceRule, 6)
      const occurrences = generateOccurrences(scheduledStart, scheduledEnd, recurrenceRule as RecurrenceRule, count)
      await prisma.shift.createMany({
        data: occurrences.map((o) => ({
          venueId: venue.id,
          membershipId: parsed.data.membershipId ?? null,
          roleId: verifiedRoleId,
          status: parsed.data.membershipId ? "SCHEDULED" : "OPEN",
          scheduledStart: o.startTime,
          scheduledEnd: o.endTime,
          notes: parsed.data.notes ?? null,
          parentShiftId: shift.id,
        })),
      })
      childShifts = await prisma.shift.findMany({
        where: { parentShiftId: shift.id },
        select: { id: true, scheduledStart: true },
      })
    }

    // Queue shift reminders 1 hour before start for every assigned occurrence (parent + children)
    if (targetMembership?.userId) {
      queueShiftReminder(targetMembership.userId, venue.id, venue.name, shift.id, scheduledStart)
      for (const child of childShifts) {
        queueShiftReminder(targetMembership.userId, venue.id, venue.name, child.id, child.scheduledStart)
      }
    }

    return NextResponse.json({ shift }, { status: 201 })
  } catch (error) {
    console.error("Error creating shift:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
