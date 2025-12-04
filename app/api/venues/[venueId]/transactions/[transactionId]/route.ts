import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { invalidateCache } from "@/lib/redis-cache"

const updateTransactionSchema = z.object({
  serviceId: z.string().optional().nullable(),
  eventId: z.string().optional().nullable(),
  amount: validators.amount.optional(),
  customerName: validators.customerName.optional(),
  notes: validators.transactionNotes.optional(),
})

// PATCH - Update a transaction
export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; transactionId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { params } = context
      const { venueId: slugOrId, transactionId } = await params

      // Look up venue by slug
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

      // Verify transaction belongs to this venue
      const existingTransaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      })

      if (!existingTransaction || existingTransaction.venueId !== venue.id) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
      }

      const body = await request.json()
      const validatedData = updateTransactionSchema.parse(body)

      const transaction = await prisma.transaction.update({
        where: { id: transactionId },
        data: validatedData,
        include: {
          service: {
            select: {
              id: true,
              name: true,
              price: true,
            },
          },
          event: {
            select: {
              id: true,
              title: true,
            },
          },
          staff: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      // Invalidate cache for analytics
      await invalidateCache(`venue:${venue.id}:analytics`)

      return NextResponse.json(transaction)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error updating transaction:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 20, window: "1 m" }
)

// DELETE - Delete a transaction
export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; transactionId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { params } = context
      const { venueId: slugOrId, transactionId } = await params

      // Look up venue by slug
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

      // Verify transaction belongs to this venue
      const existingTransaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
      })

      if (!existingTransaction || existingTransaction.venueId !== venue.id) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
      }

      await prisma.transaction.delete({
        where: { id: transactionId },
      })

      // Invalidate cache for analytics
      await invalidateCache(`venue:${venue.id}:analytics`)

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error("Error deleting transaction:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 5, window: "1 m" }
)
