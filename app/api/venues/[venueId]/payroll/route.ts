import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { Decimal } from "@prisma/client/runtime/library"

// GET /api/venues/[venueId]/payroll - List payroll entries
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

      // Check if user has access to this venue
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
        status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to this venue" },
          { status: 403 }
        )
      }

      // Only OWNER and MANAGER can view payroll
      if (membership.role !== "OWNER" && membership.role !== "MANAGER") {
        return NextResponse.json(
          { error: "Insufficient permissions. Only owners and managers can view payroll." },
          { status: 403 }
        )
      }

      // Get query parameters for filtering
      const searchParams = request.nextUrl.searchParams
      const isPaidFilter = searchParams.get("isPaid")
      const staffId = searchParams.get("membershipId")

      const payrollEntries = await prisma.payrollEntry.findMany({
        where: {
          venueId: venue.id,
          ...(isPaidFilter !== null && { isPaid: isPaidFilter === "true" }),
          ...(staffId && { membershipId: staffId }),
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
          paidByUser: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
        orderBy: {
          periodEnd: "desc",
        },
      })

      return NextResponse.json(payrollEntries)
    } catch (error) {
      console.error("Error fetching payroll entries:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 60, window: "1 m" }
)

// POST /api/venues/[venueId]/payroll - Create payroll entry
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

      // Check if user has access to this venue
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
        status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to this venue" },
          { status: 403 }
        )
      }

      // Only OWNER and MANAGER can create payroll entries
      if (membership.role !== "OWNER" && membership.role !== "MANAGER") {
        return NextResponse.json(
          { error: "Insufficient permissions. Only owners and managers can create payroll entries." },
          { status: 403 }
        )
      }

      const body = await request.json()
      const {
        membershipId,
        isManualEntry,
        manualEntryName,
        paymentType,
        baseRate,
        hoursWorked,
        bonusAmount,
        periodStart,
        periodEnd,
        notes,
      } = body

      // Validate required fields
      if (!paymentType || !baseRate || !periodStart || !periodEnd) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        )
      }

      // Validate manual entry fields
      if (isManualEntry) {
        if (!manualEntryName || manualEntryName.trim() === "") {
          return NextResponse.json(
            { error: "Name is required for manual entries" },
            { status: 400 }
          )
        }
        // Validate length
        if (manualEntryName.trim().length > 255) {
          return NextResponse.json(
            { error: "Name must be 255 characters or less" },
            { status: 400 }
          )
        }
      } else {
        // Regular entry - membershipId is required
        if (!membershipId) {
          return NextResponse.json(
            { error: "Staff member is required for non-manual entries" },
            { status: 400 }
          )
        }
      }

      // Validate payment type
      if (paymentType !== "FIXED_SALARY" && paymentType !== "HOURLY") {
        return NextResponse.json(
          { error: "Invalid payment type. Must be FIXED_SALARY or HOURLY" },
          { status: 400 }
        )
      }

      // Validate numeric fields
      const baseRateNum = parseFloat(baseRate)
      if (isNaN(baseRateNum) || baseRateNum < 0 || baseRateNum > 999999999) {
        return NextResponse.json(
          { error: "Invalid base rate. Must be a positive number" },
          { status: 400 }
        )
      }

      // Validate hoursWorked for hourly payments
      if (paymentType === "HOURLY") {
        if (!hoursWorked) {
          return NextResponse.json(
            { error: "Hours worked is required for hourly payments" },
            { status: 400 }
          )
        }
        const hoursNum = parseFloat(hoursWorked)
        if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 9999) {
          return NextResponse.json(
            { error: "Invalid hours worked. Must be a positive number" },
            { status: 400 }
          )
        }
      }

      // Validate bonus amount if provided
      if (bonusAmount) {
        const bonusNum = parseFloat(bonusAmount)
        if (isNaN(bonusNum) || bonusNum < 0 || bonusNum > 999999999) {
          return NextResponse.json(
            { error: "Invalid bonus amount. Must be a positive number" },
            { status: 400 }
          )
        }
      }

      // Validate dates
      const startDate = new Date(periodStart)
      const endDate = new Date(periodEnd)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format" },
          { status: 400 }
        )
      }
      if (endDate < startDate) {
        return NextResponse.json(
          { error: "Period end must be after period start" },
          { status: 400 }
        )
      }

      // Validate notes length if provided
      if (notes && notes.length > 10000) {
        return NextResponse.json(
          { error: "Notes must be 10,000 characters or less" },
          { status: 400 }
        )
      }

      // Verify the staff member exists in this venue (skip for manual entries)
      if (!isManualEntry) {
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
      }

      // Calculate total amount
      let totalAmount = new Decimal(baseRate)

      if (paymentType === "HOURLY" && hoursWorked) {
        totalAmount = new Decimal(baseRate).mul(new Decimal(hoursWorked))
      }

      if (bonusAmount) {
        totalAmount = totalAmount.add(new Decimal(bonusAmount))
      }

      // Create payroll entry
      const payrollEntry = await prisma.payrollEntry.create({
        data: {
          venueId: venue.id,
          membershipId: isManualEntry ? null : membershipId,
          isManualEntry: isManualEntry || false,
          manualEntryName: isManualEntry ? manualEntryName.trim() : null,
          paymentType,
          baseRate: new Decimal(baseRate),
          hoursWorked: hoursWorked ? new Decimal(hoursWorked) : null,
          bonusAmount: bonusAmount ? new Decimal(bonusAmount) : null,
          totalAmount,
          periodStart: new Date(periodStart),
          periodEnd: new Date(periodEnd),
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

      return NextResponse.json(payrollEntry, { status: 201 })
    } catch (error) {
      console.error("Error creating payroll entry:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 10, window: "1 m" }
)
