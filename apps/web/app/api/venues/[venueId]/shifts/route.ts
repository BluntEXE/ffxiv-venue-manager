import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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
      },
      orderBy: { scheduledStart: "asc" },
    })

    return NextResponse.json({
      shifts: shifts.map((s) => ({
        id: s.id,
        membershipId: s.membershipId,
        staffName: s.membership.user?.name ?? "Unknown",
        staffImage: s.membership.user?.image ?? null,
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
const createShiftSchema = z.object({
  membershipId: z.string().min(1),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  notes: z.string().optional(),
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

    // Verify the target membership belongs to this venue
    const targetMembership = await prisma.membership.findFirst({
      where: {
        id: parsed.data.membershipId,
        venueId: venue.id,
        status: "active",
      },
    })
    if (!targetMembership) {
      return NextResponse.json(
        { error: "Staff member not found at this venue" },
        { status: 400 }
      )
    }

    const shift = await prisma.shift.create({
      data: {
        venueId: venue.id,
        membershipId: parsed.data.membershipId,
        scheduledStart: new Date(parsed.data.scheduledStart),
        scheduledEnd: new Date(parsed.data.scheduledEnd),
        notes: parsed.data.notes ?? null,
      },
    })

    return NextResponse.json({ shift }, { status: 201 })
  } catch (error) {
    console.error("Error creating shift:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
