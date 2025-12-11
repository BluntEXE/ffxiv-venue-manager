import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { subDays } from "date-fns"

/**
 * Consolidated Analytics API
 * Returns all analytics data in a single request to avoid N+1 client-side fetches
 */
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

      // Look up venue by ID
      let venue = await prisma.venue.findUnique({
        where: { id: venueId },
      })

      // If not found by ID, try by slug
      if (!venue) {
        venue = await prisma.venue.findUnique({
          where: { slug: venueId },
        })
      }

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

      const now = new Date()
      const past30Days = subDays(now, 30)

      // Fetch all data in parallel for better performance
      const [allEvents, allTransactions, allPatronLogs] = await Promise.all([
        // Get all events with basic info
        prisma.event.findMany({
          where: { venueId: venue.id },
          select: {
            id: true,
            title: true,
            status: true,
            startTime: true,
            endTime: true,
          },
          orderBy: { startTime: "desc" },
        }),

        // Get all transactions with service info
        prisma.transaction.findMany({
          where: { venueId: venue.id },
          select: {
            id: true,
            amount: true,
            eventId: true,
            createdAt: true,
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),

        // Get all patron logs
        prisma.patronLog.findMany({
          where: { venueId: venue.id },
          select: {
            id: true,
            eventId: true,
            countChange: true,
            timestamp: true,
          },
          orderBy: { timestamp: "asc" },
        }),
      ])

      // Process events for different views
      const completedOrActiveEvents = allEvents.filter(
        (e) => e.status === "COMPLETED" || e.status === "ACTIVE"
      )

      // Last 10 events for revenue chart
      const last10Events = completedOrActiveEvents.slice(0, 10).reverse()

      // Last 7 events for patron chart
      const last7Events = completedOrActiveEvents.slice(0, 7).reverse()

      // Calculate revenue per event
      const revenueByEvent = last10Events.map((event) => {
        const eventTransactions = allTransactions.filter(
          (t) => t.eventId === event.id
        )
        const total = eventTransactions.reduce(
          (sum, t) => sum + Number(t.amount),
          0
        )

        return {
          eventId: event.id,
          eventTitle: event.title,
          startTime: event.startTime,
          revenue: total,
        }
      })

      // Calculate service revenue breakdown
      const serviceMap = new Map<string, { name: string; revenue: number }>()
      allTransactions.forEach((t) => {
        if (t.service) {
          const existing = serviceMap.get(t.service.id)
          if (existing) {
            existing.revenue += Number(t.amount)
          } else {
            serviceMap.set(t.service.id, {
              name: t.service.name,
              revenue: Number(t.amount),
            })
          }
        }
      })

      const serviceRevenue = Array.from(serviceMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5) // Top 5 services

      // Calculate patron data per event
      const patronByEvent = last7Events.map((event) => {
        const eventLogs = allPatronLogs.filter((log) => log.eventId === event.id)

        // Calculate peak patron count
        let currentCount = 0
        let maxCount = 0
        eventLogs.forEach((log) => {
          currentCount += log.countChange
          maxCount = Math.max(maxCount, currentCount)
        })

        return {
          eventId: event.id,
          eventTitle: event.title,
          startTime: event.startTime,
          peakPatrons: Math.max(maxCount, 0),
        }
      })

      // Calculate event statistics
      const recentEvents = allEvents.filter(
        (e) => new Date(e.startTime) >= past30Days
      )

      const eventStats = {
        total: allEvents.length,
        upcoming: allEvents.filter((e) => new Date(e.startTime) > now).length,
        completed: allEvents.filter((e) => e.status === "COMPLETED").length,
        recentCount: recentEvents.length,
      }

      // Calculate totals
      const totalRevenue = revenueByEvent.reduce((sum, e) => sum + e.revenue, 0)
      const totalPatrons = patronByEvent.reduce((sum, e) => sum + e.peakPatrons, 0)

      return NextResponse.json({
        venueId: venue.id,
        venueName: venue.name,

        // Summary stats
        summary: {
          totalRevenue,
          avgRevenuePerEvent: revenueByEvent.length > 0
            ? Math.round(totalRevenue / revenueByEvent.length)
            : 0,
          totalPatrons,
          ...eventStats,
        },

        // Chart data
        revenueByEvent,
        serviceRevenue,
        patronByEvent,

        // Metadata
        fetchedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error("Error fetching analytics:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 30, window: "1 m" }
)
