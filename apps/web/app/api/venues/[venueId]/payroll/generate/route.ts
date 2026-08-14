import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { fetchRoleRates, resolveShiftRates } from "@/lib/payroll-rates"
import { resolveDisplayName } from "@/lib/display-name"
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>

const payrollGenerateOptionalsSchema = z.object({
  baseRate: z.union([
    z.coerce.number().min(0, "Invalid base rate. Must be a positive number").max(999999999, "Invalid base rate. Must be a positive number"),
    z.null(),
  ]).optional(),
  bonusAmount: z.union([
    z.coerce.number().min(0, "Invalid bonus amount. Must be a positive number").max(999999999, "Invalid bonus amount. Must be a positive number"),
    z.null(),
  ]).optional(),
  notes: z.string().max(10000, "Notes must be 10,000 characters or less").optional().nullable(),
})

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
      const { membershipId, periodStart, periodEnd } = body

      let baseRate: number | null | undefined, bonusAmount: number | null | undefined, notes: string | null | undefined
      try {
        const parsedOptionals = payrollGenerateOptionalsSchema.parse(body)
        baseRate = parsedOptionals.baseRate
        bonusAmount = parsedOptionals.bonusAmount
        notes = parsedOptionals.notes
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
        }
        throw error
      }

      // Validate required fields
      if (!membershipId || !periodStart || !periodEnd) {
        return NextResponse.json(
          { error: "membershipId, periodStart, and periodEnd are required" },
          { status: 400 }
        )
      }

      const startDate = new Date(periodStart)
      const endDate = new Date(periodEnd)
      endDate.setUTCHours(23, 59, 59, 999)

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

      let totalHours: Decimal
      let totalAmount: Decimal
      let linkedShiftIds: string[]

      if (baseRate !== undefined && baseRate !== null) {
        // Explicit manual override: applies flat to every eligible shift, same as before —
        // this is the one path that intentionally bypasses per-shift role resolution.
        const overrideRate = new Decimal(baseRate)
        totalHours = new Decimal(0)
        for (const shift of eligibleShifts) {
          if (shift.actualStart && shift.actualEnd) {
            const hours = (shift.actualEnd.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)
            totalHours = totalHours.add(new Decimal(Math.round(hours * 100) / 100))
          }
        }
        totalAmount = overrideRate.mul(totalHours)
        linkedShiftIds = eligibleShifts.map((s) => s.id)
      } else {
        const roleIds = [
          ...eligibleShifts.map((s) => s.roleId),
          staffMembership.roleId,
        ]
        const roleRates = await fetchRoleRates(roleIds)
        const resolution = resolveShiftRates(eligibleShifts, staffMembership, roleRates)

        if (resolution.includedShiftIds.length === 0) {
          return NextResponse.json(
            { error: "No hourly rate could be resolved for any shift in this period (no personal rate, no role rate on the shifts, and no primary role rate set)" },
            { status: 400 }
          )
        }

        totalHours = resolution.totalHours
        totalAmount = resolution.totalAmount
        linkedShiftIds = resolution.includedShiftIds
      }

      // Informational effective rate for display — computed before any bonus is folded
      // in, same as the original flat-rate behavior (bonus is a separate line item, not
      // part of the hourly rate). The real math happened per-shift above (unless the
      // manual override path ran, in which case it's just that flat rate).
      const effectiveRate = totalHours.gt(0) ? totalAmount.div(totalHours) : new Decimal(0)

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
                    characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
                  },
                },
                customRole: true,
              },
            },
          },
        })

        // Link only the shifts that actually resolved to a rate — see the rate
        // resolution above for why this can be fewer than eligibleShifts.length.
        await tx.shift.updateMany({
          where: {
            id: { in: linkedShiftIds },
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
          shiftsLinked: linkedShiftIds.length,
          shiftsExcluded: eligibleShifts.length - linkedShiftIds.length,
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
      endDate.setUTCHours(23, 59, 59, 999)

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
              characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
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

      const roleIds = [
        ...eligibleShifts.map((s) => s.roleId),
        staffMembership.roleId,
      ]
      const roleRates = await fetchRoleRates(roleIds)
      const resolution = resolveShiftRates(eligibleShifts, staffMembership, roleRates)
      const resolvedById = new Map(resolution.resolved.map((r) => [r.id, r]))

      const shiftDetails = eligibleShifts.map((shift) => {
        const r = resolvedById.get(shift.id)
        return {
          id: shift.id,
          scheduledStart: shift.scheduledStart.toISOString(),
          scheduledEnd: shift.scheduledEnd.toISOString(),
          actualStart: shift.actualStart?.toISOString() ?? null,
          actualEnd: shift.actualEnd?.toISOString() ?? null,
          hoursWorked: r ? Number(r.hours) : 0,
          resolvedRate: r?.rate ? Number(r.rate) : null,
          storedHoursWorked: shift.hoursWorked ? Number(shift.hoursWorked) : null,
        }
      })

      const defaultRate = staffMembership.hourlyRate
        ? Number(staffMembership.hourlyRate)
        : null

      return NextResponse.json({
        staff: {
          membershipId: staffMembership.id,
          name: resolveDisplayName({
            characterName: staffMembership.user?.characters?.[0]?.characterName,
            nickname: staffMembership.nickname,
            displayName: staffMembership.user?.displayName,
            discordName: staffMembership.user?.name,
          }),
          image: staffMembership.user?.image,
          defaultHourlyRate: defaultRate,
        },
        shifts: shiftDetails,
        summary: {
          shiftCount: eligibleShifts.length,
          totalHours: Number(resolution.totalHours),
          estimatedTotal: resolution.totalHours.gt(0) ? Number(resolution.totalAmount) : null,
          unresolvedShiftCount: resolution.excludedShiftIds.length,
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
