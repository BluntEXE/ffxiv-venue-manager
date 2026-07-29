import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { fetchRoleRates, resolveShiftRates } from "@/lib/payroll-rates"
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal

/**
 * GET /api/venues/[venueId]/payroll/generate-all?periodStart=Y&periodEnd=Z
 * Preview: returns per-member shift counts and estimated totals.
 *
 * POST /api/venues/[venueId]/payroll/generate-all
 * Body: { periodStart, periodEnd }
 * Generates a payroll entry for every active member who has completed,
 * unpaid shifts in the period. Reuses the same logic as generate (single member).
 * Members with no eligible shifts or no hourly rate are skipped.
 */

async function resolveVenueAndCheckPerms(venueId: string, userId: string) {
  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
  })
  if (!venue) return { error: "Venue not found", status: 404 }

  const membership = await prisma.membership.findFirst({
    where: { userId, venueId: venue.id, status: "active" },
  })
  if (!membership) return { error: "No access to this venue", status: 403 }
  if (membership.role !== "OWNER" && membership.role !== "MANAGER")
    return { error: "Only owners and managers can generate payroll", status: 403 }

  return { venue }
}

async function getEligibleShiftsPerMember(venueId: string, startDate: Date, endDate: Date) {
  const activeMembers = await prisma.membership.findMany({
    where: { venueId, status: "active" },
    include: {
      user: { select: { id: true, name: true, displayName: true, image: true } },
    },
  })

  const perMember = await Promise.all(
    activeMembers.map(async (member) => {
      const shifts = await prisma.shift.findMany({
        where: {
          membershipId: member.id,
          venueId,
          status: "COMPLETED",
          payrollEntryId: null,
          actualEnd: { gte: startDate, lte: endDate },
        },
        orderBy: { actualStart: "asc" },
      })
      return { member, shifts }
    })
  )

  // Gather every role ID this venue's members/shifts might need in one pass, so
  // role rates are fetched once for the whole venue instead of once per member.
  const allRoleIds = perMember.flatMap(({ member, shifts }) => [
    member.roleId,
    ...shifts.map((s) => s.roleId),
  ])
  const roleRates = await fetchRoleRates(allRoleIds)

  return perMember.map(({ member, shifts }) => {
    const resolution = resolveShiftRates(shifts, member, roleRates)
    const totalHours = Number(resolution.totalHours)

    return {
      member,
      shifts,
      resolution,
      totalHours,
      estimatedTotal: resolution.includedShiftIds.length > 0 ? Math.round(Number(resolution.totalAmount)) : null,
      skipped: shifts.length === 0 || resolution.includedShiftIds.length === 0,
      skipReason:
        shifts.length === 0
          ? "no_shifts"
          : resolution.includedShiftIds.length === 0
            ? "no_rate"
            : null,
    }
  })
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

      const { venueId } = await context.params
      const check = await resolveVenueAndCheckPerms(venueId, session.user.id)
      if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status })
      const venue = check.venue!

      const sp = request.nextUrl.searchParams
      const periodStart = sp.get("periodStart")
      const periodEnd = sp.get("periodEnd")
      if (!periodStart || !periodEnd)
        return NextResponse.json({ error: "periodStart and periodEnd are required" }, { status: 400 })

      const startDate = new Date(periodStart)
      const endDate = new Date(periodEnd)
      endDate.setUTCHours(23, 59, 59, 999)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()))
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })

      const results = await getEligibleShiftsPerMember(venue.id, startDate, endDate)

      return NextResponse.json({
        members: results.map((r) => ({
          membershipId: r.member.id,
          name: r.member.user?.displayName || r.member.user?.name || "Unknown",
          image: r.member.user?.image ?? null,
          shiftCount: r.shifts.length,
          totalHours: r.totalHours,
          estimatedTotal: r.estimatedTotal,
          skipped: r.skipped,
          skipReason: r.skipReason,
          unresolvedShiftCount: r.resolution.excludedShiftIds.length,
        })),
      })
    } catch (e) {
      console.error("Error previewing generate-all:", e)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

      const { venueId } = await context.params
      const check = await resolveVenueAndCheckPerms(venueId, session.user.id)
      if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status })
      const venue = check.venue!

      const { periodStart, periodEnd } = await request.json()
      if (!periodStart || !periodEnd)
        return NextResponse.json({ error: "periodStart and periodEnd are required" }, { status: 400 })

      const startDate = new Date(periodStart)
      const endDate = new Date(periodEnd)
      endDate.setUTCHours(23, 59, 59, 999)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()))
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })

      const results = await getEligibleShiftsPerMember(venue.id, startDate, endDate)
      const eligible = results.filter((r) => !r.skipped)

      if (eligible.length === 0)
        return NextResponse.json({ error: "No eligible members with shifts and rates in this period" }, { status: 400 })

      const created = await prisma.$transaction(async (tx) => {
        const entries = []
        for (const r of eligible) {
          const totalHours = r.resolution.totalHours
          const totalAmount = r.resolution.totalAmount
          // Informational effective rate — the real math happened per-shift.
          const baseRate = totalHours.gt(0) ? totalAmount.div(totalHours) : new Decimal(0)

          const entry = await tx.payrollEntry.create({
            data: {
              venueId: venue.id,
              membershipId: r.member.id,
              paymentType: "HOURLY",
              baseRate,
              hoursWorked: totalHours,
              totalAmount,
              periodStart: startDate,
              periodEnd: endDate,
            },
          })

          // Link only the shifts that resolved to a rate — see resolveShiftRates.
          await tx.shift.updateMany({
            where: { id: { in: r.resolution.includedShiftIds } },
            data: { payrollEntryId: entry.id },
          })

          entries.push({
            membershipId: r.member.id,
            name: r.member.user?.displayName || r.member.user?.name || "Unknown",
            shiftCount: r.resolution.includedShiftIds.length,
            totalHours: r.totalHours,
            totalAmount: Math.round(Number(totalAmount)),
          })
        }
        return entries
      })

      return NextResponse.json({
        generated: created.length,
        skipped: results.filter((r) => r.skipped).length,
        entries: created,
      }, { status: 201 })
    } catch (e) {
      console.error("Error in generate-all:", e)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 5, window: "1 m" }
)
