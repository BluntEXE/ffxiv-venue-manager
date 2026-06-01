import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { subDays } from "date-fns"
import { getRecentEventsFinancialSummary } from "@/lib/financial-calculations"

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

      // Look up venue by slug or ID
      let venue = await prisma.venue.findFirst({
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

      const now = new Date()
      const past30Days = subDays(now, 30)

      // Fetch all data in parallel for better performance
      const [allEvents, allTransactions, allPatronLogs, allPayrollEntries, followerCount, followersByMonth, patronVisits] = await Promise.all([
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

        // Get all paid payroll entries
        prisma.payrollEntry.findMany({
          where: {
            venueId: venue.id,
            isPaid: true // Only paid payroll counts as actual expense
          },
          select: {
            id: true,
            totalAmount: true,
            periodStart: true,
            periodEnd: true,
          },
          orderBy: { periodEnd: "desc" },
        }),

        // Follower count
        prisma.venueFollow.count({ where: { venueId: venue.id } }),

        // Followers gained by month (last 6 months)
        prisma.venueFollow.findMany({
          where: {
            venueId: venue.id,
            createdAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
          },
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
        }),

        // Patron visit counts per character (for New/Regular/VIP mix)
        prisma.patronLog.groupBy({
          by: ["characterName"],
          where: {
            venueId: venue.id,
            characterName: { not: null },
            wasWorking: false,
            action: "ENTER",
          },
          _count: { _all: true },
          orderBy: { characterName: "asc" },
          take: 2000,
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

      // Calculate revenue and payroll per event
      const revenueByEvent = last10Events.map((event) => {
        const eventTransactions = allTransactions.filter(
          (t) => t.eventId === event.id
        )
        const revenue = eventTransactions.reduce(
          (sum, t) => sum + Number(t.amount),
          0
        )

        // Calculate payroll for this event.
        // TODO(payroll-alloc): payroll entries are period-scoped, not event-scoped.
        // When a payroll period covers multiple events (e.g. weekly payroll with
        // several event-days, or any multi-day period), the full payroll amount
        // is charged against each event in the period and the summary totals
        // double/triple-count. Safe today because typical usage is 1 event per
        // payroll period, but revisit (pro-rate, first-event-only, or separate
        // period-level card) if multi-event periods become common.
        const eventDate = new Date(event.startTime)
        const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate())

        const eventPayroll = allPayrollEntries.filter((entry) => {
          const periodStart = new Date(entry.periodStart)
          const periodEnd = new Date(entry.periodEnd)

          // Set to start of day for comparison
          const periodStartDay = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate())
          const periodEndDay = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate())

          // Check if event day falls within period (inclusive)
          return eventDayStart >= periodStartDay && eventDayStart <= periodEndDay
        })

        const payroll = eventPayroll.reduce(
          (sum, entry) => sum + Number(entry.totalAmount),
          0
        )

        const netProfit = revenue - payroll

        return {
          eventId: event.id,
          eventTitle: event.title,
          startTime: event.startTime,
          revenue,
          payroll,
          netProfit,
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
          currentCount += (log.countChange ?? 0)
          maxCount = Math.max(maxCount, currentCount)
        })

        return {
          eventId: event.id,
          eventTitle: event.title,
          startTime: event.startTime,
          peakPatrons: Math.max(maxCount, 0),
        }
      })

      // Calculate average hourly attendance across recent events (for trends)
      const attendanceTrends: Record<string, { total: number; count: number }> = {}

      completedOrActiveEvents.slice(0, 20).forEach((event) => {
        const eventLogs = allPatronLogs.filter((log) => log.eventId === event.id)
        if (eventLogs.length === 0) return

        // Build time series for this event
        const eventStart = new Date(event.startTime)
        const eventEnd = new Date(event.endTime)

        let currentTime = new Date(eventStart)
        let currentCount = 0
        let logIndex = 0

        // Determine actual end time (event end or last log, whichever is later)
        const lastLog = eventLogs[eventLogs.length - 1]
        const actualEnd = lastLog && new Date(lastLog.timestamp) > eventEnd
          ? new Date(lastLog.timestamp)
          : eventEnd

        // Process in 15-minute intervals
        while (currentTime <= actualEnd) {
          // Apply all logs up to current time
          while (logIndex < eventLogs.length) {
            const logTime = new Date(eventLogs[logIndex].timestamp)
            if (logTime > currentTime) break
            currentCount += (eventLogs[logIndex].countChange ?? 0)
            logIndex++
          }

          if (currentCount < 0) currentCount = 0

          // Record by HH:mm time slot
          const timeKey = currentTime.toTimeString().substring(0, 5) // "HH:mm"
          if (!attendanceTrends[timeKey]) {
            attendanceTrends[timeKey] = { total: 0, count: 0 }
          }
          attendanceTrends[timeKey].total += currentCount
          attendanceTrends[timeKey].count += 1

          // Advance 15 minutes
          currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000)

          // Safety: don't process forever (max 48 hours)
          if (currentTime.getTime() - eventStart.getTime() > 48 * 60 * 60 * 1000) break
        }
      })

      // Convert to sorted array
      const attendanceByHour = Object.entries(attendanceTrends)
        .map(([time, data]) => ({
          time,
          avgCount: Math.round(data.total / data.count),
        }))
        .sort((a, b) => a.time.localeCompare(b.time))

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

      // Patron mix — categorise by visit count
      const mixNew     = patronVisits.filter(p => p._count._all <= 2).length
      const mixRegular = patronVisits.filter(p => p._count._all >= 3 && p._count._all <= 9).length
      const mixVip     = patronVisits.filter(p => p._count._all >= 10).length
      const mixTotal   = patronVisits.length || 1 // avoid /0

      // Busiest nights — day-of-week distribution from patron ENTER logs
      const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      const dayTotals = new Array(7).fill(0)
      for (const log of allPatronLogs) {
        if (log.countChange && log.countChange > 0) {
          dayTotals[new Date(log.timestamp).getUTCDay()]++
        }
      }
      const maxDay = Math.max(...dayTotals, 1)
      const busiestNights = DAY_NAMES.map((name, i) => ({
        day: name,
        count: dayTotals[i],
        pct: Math.round((dayTotals[i] / maxDay) * 100),
      }))

      // Calculate totals
      const totalRevenue = revenueByEvent.reduce((sum, e) => sum + e.revenue, 0)
      const totalPatrons = patronByEvent.reduce((sum, e) => sum + e.peakPatrons, 0)

      // Calculate financial summary (revenue vs payroll for last 10 events)
      const financialSummary = await getRecentEventsFinancialSummary(venue.id, 10)

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

        // Financial summary (profit/loss analysis)
        financial: {
          totalRevenue: financialSummary.totalRevenue,
          totalPayroll: financialSummary.totalPayroll,
          netProfit: financialSummary.netProfit,
          profitMargin: financialSummary.profitMargin,
          payrollAsPercentOfRevenue: financialSummary.payrollAsPercentOfRevenue,
        },

        // Mobile followers
        followers: {
          total: followerCount,
          byMonth: followersByMonth.reduce<Record<string, number>>((acc, f) => {
            const key = f.createdAt.toISOString().slice(0, 7) // YYYY-MM
            acc[key] = (acc[key] ?? 0) + 1
            return acc
          }, {}),
        },

        // Chart data
        revenueByEvent,
        serviceRevenue,
        patronByEvent,
        attendanceByHour,

        // Patron mix & engagement
        patronMix: {
          new:     mixNew,
          regular: mixRegular,
          vip:     mixVip,
          total:   mixTotal,
          newPct:     Math.round((mixNew     / mixTotal) * 100),
          regularPct: Math.round((mixRegular / mixTotal) * 100),
          vipPct:     Math.round((mixVip     / mixTotal) * 100),
        },
        busiestNights,

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
