import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import {
  createTransaction,
  createTransactionSchema,
} from "@/lib/api/transactions"

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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
      const { venueId } = await params
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get("eventId")
    const serviceId = searchParams.get("serviceId")
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")
    const cursor = searchParams.get("cursor") // For pagination
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100) // Max 100 items per page

    // Validate dates if provided
    let startDate: Date | undefined
    let endDate: Date | undefined

    if (startDateParam) {
      const parsed = Date.parse(startDateParam)
      if (isNaN(parsed)) {
        return NextResponse.json({ error: "Invalid start date format" }, { status: 400 })
      }
      startDate = new Date(parsed)
    }

    if (endDateParam) {
      const parsed = Date.parse(endDateParam)
      if (isNaN(parsed)) {
        return NextResponse.json({ error: "Invalid end date format" }, { status: 400 })
      }
      endDate = new Date(parsed)
    }

    // Ensure start date is before end date
    if (startDate && endDate && startDate >= endDate) {
      return NextResponse.json(
        { error: "Start date must be before end date" },
        { status: 400 }
      )
    }

    // Check if user has access to this venue
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        status: "active",
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this venue" },
        { status: 403 }
      )
    }

    // Get venue settings
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { settings: true },
    })

    const venueSettings = venue?.settings as any

    // Check sales visibility for STAFF members
    if (membership.role === "STAFF" && venueSettings?.salesVisibility) {
      const salesVisibility = venueSettings.salesVisibility

      if (salesVisibility === "none") {
        // Staff have no access to sales page at all
        return NextResponse.json(
          { error: "You don't have permission to view sales data" },
          { status: 403 }
        )
      }
    }

    // Build where clause
    const where: any = { venueId }
    if (eventId) where.eventId = eventId
    if (serviceId) where.serviceId = serviceId
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = startDate
      if (endDate) where.createdAt.lte = endDate
    }

    // Apply sales visibility settings for STAFF members
    if (membership.role === "STAFF" && venueSettings?.salesVisibility === "own") {
      // Staff only see transactions they created
      where.staffId = session.user.id
    }

    // Get transactions with pagination
    const transactions = await prisma.transaction.findMany({
      where,
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
      orderBy: {
        createdAt: "desc",
      },
      take: limit + 1, // Fetch one extra to determine if there are more results
      ...(cursor && {
        cursor: {
          id: cursor,
        },
        skip: 1, // Skip the cursor item itself
      }),
    })

    // Check if there are more results
    const hasMore = transactions.length > limit
    const paginatedTransactions = hasMore ? transactions.slice(0, limit) : transactions
    const nextCursor = hasMore ? paginatedTransactions[paginatedTransactions.length - 1]?.id : null

      return NextResponse.json({
        transactions: paginatedTransactions,
        nextCursor,
        hasMore,
      })
    } catch (error) {
      console.error("Error fetching transactions:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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
      const { venueId } = await params

    // Check if user has access to this venue
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        status: "active",
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this venue" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createTransactionSchema.parse(body)

    // Delegate row creation, webhook dispatch, and cache invalidation to
    // the shared helper. The plugin route (/api/plugin/transactions) uses
    // the exact same helper with an api-key-derived userId, so the two
    // surfaces are guaranteed to produce identical side effects.
    const newTransaction = await createTransaction(
      venueId,
      session.user.id,
      validatedData
    )

      return NextResponse.json(newTransaction, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error creating transaction:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 10, window: "1 m" }
)
