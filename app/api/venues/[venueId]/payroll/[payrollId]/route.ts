import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { Decimal } from "@prisma/client/runtime/library"

// PATCH /api/venues/[venueId]/payroll/[payrollId] - Update payroll entry (mark as paid, etc.)
export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; payrollId: string }> }>(
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

      const { venueId: slugOrId, payrollId } = await params

      // Look up venue by slug (since frontend passes slug, not venueId)
      const venue = await prisma.venue.findUnique({
        where: { slug: slugOrId },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Check if user has access to this venue
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
        },
      })

      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to this venue" },
          { status: 403 }
        )
      }

      // Only OWNER and MANAGER can update payroll entries
      if (membership.role !== "OWNER" && membership.role !== "MANAGER") {
        return NextResponse.json(
          { error: "Insufficient permissions. Only owners and managers can update payroll entries." },
          { status: 403 }
        )
      }

      // Verify payroll entry exists and belongs to this venue
      const existingEntry = await prisma.payrollEntry.findFirst({
        where: {
          id: payrollId,
          venueId: venue.id,
        },
      })

      if (!existingEntry) {
        return NextResponse.json(
          { error: "Payroll entry not found" },
          { status: 404 }
        )
      }

      const body = await request.json()
      const {
        isPaid,
        baseRate,
        hoursWorked,
        bonusAmount,
        periodStart,
        periodEnd,
        notes,
      } = body

      // Prepare update data
      const updateData: any = {}

      // Handle marking as paid/unpaid
      if (typeof isPaid === "boolean") {
        updateData.isPaid = isPaid
        if (isPaid) {
          updateData.paidAt = new Date()
          updateData.paidBy = session.user.id
        } else {
          updateData.paidAt = null
          updateData.paidBy = null
        }
      }

      // Update other fields if provided
      if (baseRate !== undefined) updateData.baseRate = new Decimal(baseRate)
      if (hoursWorked !== undefined) {
        updateData.hoursWorked = hoursWorked ? new Decimal(hoursWorked) : null
      }
      if (bonusAmount !== undefined) {
        updateData.bonusAmount = bonusAmount ? new Decimal(bonusAmount) : null
      }
      if (periodStart) updateData.periodStart = new Date(periodStart)
      if (periodEnd) updateData.periodEnd = new Date(periodEnd)
      if (notes !== undefined) updateData.notes = notes

      // Recalculate totalAmount if any payment fields changed
      if (baseRate !== undefined || hoursWorked !== undefined || bonusAmount !== undefined) {
        const newBaseRate = baseRate !== undefined ? new Decimal(baseRate) : existingEntry.baseRate
        const newHoursWorked = hoursWorked !== undefined
          ? (hoursWorked ? new Decimal(hoursWorked) : null)
          : existingEntry.hoursWorked
        const newBonusAmount = bonusAmount !== undefined
          ? (bonusAmount ? new Decimal(bonusAmount) : null)
          : existingEntry.bonusAmount

        let totalAmount = new Decimal(newBaseRate)

        if (existingEntry.paymentType === "HOURLY" && newHoursWorked) {
          totalAmount = new Decimal(newBaseRate).mul(new Decimal(newHoursWorked))
        }

        if (newBonusAmount) {
          totalAmount = totalAmount.add(new Decimal(newBonusAmount))
        }

        updateData.totalAmount = totalAmount
      }

      // Update the payroll entry
      const updatedEntry = await prisma.payrollEntry.update({
        where: { id: payrollId },
        data: updateData,
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
      })

      return NextResponse.json(updatedEntry)
    } catch (error) {
      console.error("Error updating payroll entry:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 20, window: "1 m" }
)

// DELETE /api/venues/[venueId]/payroll/[payrollId] - Delete payroll entry
export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; payrollId: string }> }>(
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

      const { venueId: slugOrId, payrollId } = await params

      // Look up venue by slug (since frontend passes slug, not venueId)
      const venue = await prisma.venue.findUnique({
        where: { slug: slugOrId },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Check if user has access to this venue
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
        },
      })

      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to this venue" },
          { status: 403 }
        )
      }

      // Only OWNER can delete payroll entries (more restrictive than update)
      if (membership.role !== "OWNER") {
        return NextResponse.json(
          { error: "Insufficient permissions. Only owners can delete payroll entries." },
          { status: 403 }
        )
      }

      // Verify payroll entry exists and belongs to this venue
      const existingEntry = await prisma.payrollEntry.findFirst({
        where: {
          id: payrollId,
          venueId: venue.id,
        },
      })

      if (!existingEntry) {
        return NextResponse.json(
          { error: "Payroll entry not found" },
          { status: 404 }
        )
      }

      // Delete the payroll entry
      await prisma.payrollEntry.delete({
        where: { id: payrollId },
      })

      return NextResponse.json({ success: true, message: "Payroll entry deleted" })
    } catch (error) {
      console.error("Error deleting payroll entry:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 5, window: "1 m" }
)
