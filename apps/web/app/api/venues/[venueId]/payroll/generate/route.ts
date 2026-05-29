import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>

/**
 * POST /api/venues/[venueId]/payroll/generate
 *
 * Generate a payroll entry from completed, unpaid shifts.
 * Aggregates shifts for a staff member within a date range,
 * calculates total hours, and creates a linked PayrollEntry.
 *
 * Body: { membershipId, periodStart, periodEnd, baseRate?, bonusAmount?, notes? }
 * - baseRate defaults to the membership's hourlyRate if not provided
 */
export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (
    request: NextRequest,
    context
  ) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { venueId } = await params

      // Look up venue by slug or ID
      const venue = await prisma.venue.findFirst({
        where: {
          OR: [
            { id: venueId },
            { slug: venueId }
          ]
        },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Check permissions - OWNER or MANAGER only
      const callerMembership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
        },
      })

      if (!callerMembership) {
        return NextResponse.json(
          { error: "You don't have access to this venue" },
          { status: 403 }
        )
      }

      if (callerMembership.role !== "OWNER" && callerMembership.role !== "MANAGER") {
        return NextResponse.json(
          { error: "Only owners and managers can generate payroll" },
          { status: 403 }
        )
      }

      const body = await request.json()
      const { membershipId, periodStart, periodEnd, baseRate, bonusAmount, notes } = body

      // Validate required fields
      if (!membershipId || !periodStart || !periodEnd) {
        return NextResponse.json(
          { error: "membershipId, periodStart, and periodEnd are required" },
          { status: 400 }
        )
      }

      const startDate = new Date(periodStart)
      const endDate = new Date(periodEnd)

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
      }
      if (endDate < startDate) {
        return NextResponse.json(
          { error: "Period end must be after period start" },
          { status: 400 }
        )
      }

      // Fetch the staff member's membership (includes hourlyRate)
      const staffMembership = await prisma.membership.findFirst({
        where: {
          id: membershipId,
          venueId: venue.id,
        },
      })

      if (!staffMembership) {
        return NextResponse.json(
          { error: "Staff member not found in this venue" },
          { status: 404 }
        )
      }

      // Determine the rate: explicit override > membership default
      const effectiveRate = baseRate !== undefined && baseRate !== null
        ? new Decimal(baseRate)
        : staffMembership.hourlyRate

      if (!effectiveRate) {
        return NextResponse.json(
          { error: "No hourly rate provided and staff member has no default rate set" },
          { status: 400 }
        )
      }

      // Find completed shifts with no payroll entry in the date range
      const eligibleShifts = await prisma.shift.findMany({
        where: {
          membershipId,
          venueId: venue.id,
          status: "COMPLETED",
          payrollEntryId: null,
          actualEnd: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { actualStart: "asc" },
      })

      if (eligibleShifts.length === 0) {
        return NextResponse.json(
          { error: "No unpaid completed shifts found in this period" },
          { status: 400 }
        )
      }

      // Recalculate hours from timestamps (authoritative for payroll)
      let totalHours = new Decimal(0)
      for (const shift of eligibleShifts) {
        if (shift.actualStart && shift.actualEnd) {
          const hours = (shift.actualEnd.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)
          totalHours = totalHours.add(new Decimal(Math.round(hours * 100) / 100))
        }
      }

      // Calculate total amount
      let totalAmount = new Decimal(effectiveRate).mul(totalHours)
      if (bonusAmount) {
        totalAmount = totalAmount.add(new Decimal(bonusAmount))
      }

      // Create payroll entry and link shifts in a single transaction
      const result = await prisma.$transaction(async (tx) => {
        const payrollEntry = await tx.payrollEntry.create({
          data: {
            venueId: venue.id,
            membershipId,
            paymentType: "HOURLY",
            baseRate: new Decimal(effectiveRate),
            hoursWorked: totalHours,
            bonusAmount: bonusAmount ? new Decimal(bonusAmount) : null,
            totalAmount,
            periodStart: startDate,
            periodEnd: endDate,
            notes: notes || null,
          },
          include: {
            membership: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                    displayName: true,
                  },
                },
                customRole: true,
              },
            },
          },
        })

        // Link all eligible shifts to this payroll entry
        await tx.shift.updateMany({
          where: {
            id: { in: eligibleShifts.map((s) => s.id) },
          },
          data: {
            payrollEntryId: payrollEntry.id,
          },
        })

        return payrollEntry
      })

      return NextResponse.json(
        {
          ...result,
          shiftsLinked: eligibleShifts.length,
        },
        { status: 201 }
      )
    } catch (error) {
      console.error("Error generating payroll from shifts:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 10, window: "1 m" }
)

/**
 * GET /api/venues/[venueId]/payroll/generate?membershipId=X&periodStart=Y&periodEnd=Z
 *
 * Preview: returns eligible shifts and calculated totals without creating anything.
 * Used by the UI to show what will be generated before confirming.
 */
export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (
    request: NextRequest,
    context
  ) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { venueId } = await params

      const venue = await prisma.venue.findFirst({
        where: {
          OR: [
            { id: venueId },
            { slug: venueId }
          ]
        },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      const callerMembership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
        },
      })

      if (!callerMembership) {
        return NextResponse.json(
          { error: "You don't have access to this venue" },
          { status: 403 }
        )
      }

      if (callerMembership.role !== "OWNER" && callerMembership.role !== "MANAGER") {
        return NextResponse.json(
          { error: "Only owners and managers can generate payroll" },
          { status: 403 }
        )
      }

      const searchParams = request.nextUrl.searchParams
      const membershipId = searchParams.get("membershipId")
      const periodStart = searchParams.get("periodStart")
      const periodEnd = searchParams.get("periodEnd")

      if (!membershipId || !periodStart || !periodEnd) {
        return NextResponse.json(
          { error: "membershipId, periodStart, and periodEnd are required" },
          { status: 400 }
        )
      }

      const startDate = new Date(periodStart)
      const endDate = new Date(periodEnd)

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
      }

      // Fetch staff membership for default rate
      const staffMembership = await prisma.membership.findFirst({
        where: {
          id: membershipId,
          venueId: venue.id,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              image: true,
            },
          },
        },
      })

      if (!staffMembership) {
        return NextResponse.json(
          { error: "Staff member not found in this venue" },
          { status: 404 }
        )
      }

      // Find eligible shifts
      const eligibleShifts = await prisma.shift.findMany({
        where: {
          membershipId,
          venueId: venue.id,
          status: "COMPLETED",
          payrollEntryId: null,
          actualEnd: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { actualStart: "asc" },
      })

      // Calculate totals from timestamps
      let totalHours = 0
      const shiftDetails = eligibleShifts.map((shift) => {
        let hours = 0
        if (shift.actualStart && shift.actualEnd) {
          hours = Math.round(
            ((shift.actualEnd.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)) * 100
          ) / 100
          totalHours += hours
        }
        return {
          id: shift.id,
          scheduledStart: shift.scheduledStart.toISOString(),
          scheduledEnd: shift.scheduledEnd.toISOString(),
          actualStart: shift.actualStart?.toISOString() ?? null,
          actualEnd: shift.actualEnd?.toISOString() ?? null,
          hoursWorked: hours,
          storedHoursWorked: shift.hoursWorked ? Number(shift.hoursWorked) : null,
        }
      })

      totalHours = Math.round(totalHours * 100) / 100

      const defaultRate = staffMembership.hourlyRate
        ? Number(staffMembership.hourlyRate)
        : null

      return NextResponse.json({
        staff: {
          membershipId: staffMembership.id,
          name: staffMembership.user?.displayName || staffMembership.user?.name || "Unknown",
          image: staffMembership.user?.image,
          defaultHourlyRate: defaultRate,
        },
        shifts: shiftDetails,
        summary: {
          shiftCount: eligibleShifts.length,
          totalHours,
          estimatedTotal: defaultRate ? Math.round(defaultRate * totalHours * 100) / 100 : null,
        },
      })
    } catch (error) {
      console.error("Error previewing payroll generation:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 30, window: "1 m" }
)
