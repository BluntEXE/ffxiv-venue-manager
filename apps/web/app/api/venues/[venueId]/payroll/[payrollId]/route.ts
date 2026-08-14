import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>

const payrollPatchSchema = z.object({
  baseRate: z.coerce.number()
    .min(0, "Invalid base rate. Must be a positive number")
    .max(999999999, "Invalid base rate. Must be a positive number")
    .optional(),
  hoursWorked: z.union([
    z.coerce.number()
      .min(0, "Invalid hours worked. Must be a positive number")
      .max(9999, "Invalid hours worked. Must be a positive number"),
    z.null(),
  ]).optional(),
  bonusAmount: z.union([
    z.coerce.number()
      .min(0, "Invalid bonus amount. Must be a positive number")
      .max(999999999, "Invalid bonus amount. Must be a positive number"),
    z.null(),
  ]).optional(),
  periodStart: z.string()
    .refine((v) => !isNaN(new Date(v).getTime()), "Invalid date format")
    .optional(),
  periodEnd: z.string()
    .refine((v) => !isNaN(new Date(v).getTime()), "Invalid date format")
    .optional(),
  notes: z.string().max(10000, "Notes must be 10,000 characters or less").optional().nullable(),
})

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

      const { venueId, payrollId } = await params

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
      const { isPaid, manualEntryName } = body

      let baseRate: number | undefined,
        hoursWorked: number | null | undefined,
        bonusAmount: number | null | undefined,
        periodStart: string | undefined,
        periodEnd: string | undefined,
        notes: string | null | undefined
      try {
        const parsed = payrollPatchSchema.parse(body)
        baseRate = parsed.baseRate
        hoursWorked = parsed.hoursWorked
        bonusAmount = parsed.bonusAmount
        periodStart = parsed.periodStart
        periodEnd = parsed.periodEnd
        notes = parsed.notes
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
        }
        throw error
      }

      // Prepare update data
      const updateData: {
        isPaid?: boolean
        paidAt?: Date | null
        paidBy?: string | null
        manualEntryName?: string | null
        baseRate?: Decimal
        hoursWorked?: Decimal | null
        bonusAmount?: Decimal | null
        totalAmount?: Decimal
        periodStart?: Date
        periodEnd?: Date
        notes?: string | null
      } = {}

      // Update manual entry name if provided (only for manual entries)
      if (manualEntryName !== undefined && existingEntry.isManualEntry) {
        if (manualEntryName && manualEntryName.trim().length > 255) {
          return NextResponse.json(
            { error: "Name must be 255 characters or less" },
            { status: 400 }
          )
        }
        updateData.manualEntryName = manualEntryName ? manualEntryName.trim() : null
      }

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
                  characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
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

      const { venueId, payrollId } = await params

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

      // OWNER and MANAGER can delete payroll entries.
      if (membership.role !== "OWNER" && membership.role !== "MANAGER") {
        return NextResponse.json(
          { error: "Insufficient permissions. Only owners and managers can delete payroll entries." },
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
