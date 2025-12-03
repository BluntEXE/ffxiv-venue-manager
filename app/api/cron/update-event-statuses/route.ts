import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Cron Job: Automatic Event Status Updates
 * Automatically updates event statuses based on start/end times:
 * - PUBLISHED → ACTIVE when event starts
 * - ACTIVE → COMPLETED when event ends
 *
 * Should be run every 5 minutes for accurate status updates
 *
 * QStash Configuration:
 * - URL: https://xivvenuemanager.com/api/cron/update-event-statuses
 * - Schedule: Every 5 minutes (cron: star-slash-5 star star star star)
 * - Method: GET
 * - Headers: { "authorization": "Bearer YOUR_CRON_SECRET" }
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret for security (REQUIRED)
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error("CRON_SECRET not configured - cron jobs cannot run securely")
      return NextResponse.json(
        { error: "Server misconfiguration" },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()

    // 1. Find PUBLISHED events that should be ACTIVE (startTime has passed)
    const eventsToActivate = await prisma.event.findMany({
      where: {
        status: "PUBLISHED",
        startTime: {
          lte: now, // Start time is in the past or now
        },
        endTime: {
          gte: now, // End time is still in the future
        },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        venue: {
          select: {
            name: true,
          },
        },
      },
    })

    // Update events to ACTIVE
    const activatedCount = eventsToActivate.length
    if (activatedCount > 0) {
      await prisma.event.updateMany({
        where: {
          id: {
            in: eventsToActivate.map((e) => e.id),
          },
        },
        data: {
          status: "ACTIVE",
        },
      })
    }

    // 2. Find ACTIVE events that should be COMPLETED (endTime has passed)
    const eventsToComplete = await prisma.event.findMany({
      where: {
        status: "ACTIVE",
        endTime: {
          lte: now, // End time has passed
        },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        venue: {
          select: {
            name: true,
          },
        },
      },
    })

    // Update events to COMPLETED with auto-aggregated metrics
    const completedCount = eventsToComplete.length
    if (completedCount > 0) {
      // Process each event individually to calculate metrics
      for (const event of eventsToComplete) {
        // Calculate final patron count from logs
        const patronLogs = await prisma.patronLog.findMany({
          where: { eventId: event.id },
          select: { countChange: true },
        })
        const finalPatronCount = patronLogs.reduce((sum, log) => sum + log.countChange, 0)

        // Calculate total revenue from transactions
        const transactions = await prisma.transaction.findMany({
          where: { eventId: event.id },
          select: { amount: true },
        })
        const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.amount), 0)

        // Update event with status and metrics
        await prisma.event.update({
          where: { id: event.id },
          data: {
            status: "COMPLETED",
            attendanceCount: finalPatronCount > 0 ? Math.max(0, finalPatronCount) : undefined,
            revenue: totalRevenue > 0 ? totalRevenue : undefined,
          },
        })
      }
    }

    // Log the results for monitoring
    console.log(`[Event Status Update] ${now.toISOString()}`)
    console.log(`  Activated: ${activatedCount} events`)
    console.log(`  Completed: ${completedCount} events`)

    if (activatedCount > 0) {
      console.log("  Activated events:")
      eventsToActivate.forEach((e) => {
        console.log(`    - "${e.title}" at ${e.venue.name}`)
      })
    }

    if (completedCount > 0) {
      console.log("  Completed events:")
      eventsToComplete.forEach((e) => {
        console.log(`    - "${e.title}" at ${e.venue.name}`)
      })
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results: {
        activated: {
          count: activatedCount,
          events: eventsToActivate.map((e) => ({
            id: e.id,
            title: e.title,
            venue: e.venue.name,
            startTime: e.startTime,
          })),
        },
        completed: {
          count: completedCount,
          events: eventsToComplete.map((e) => ({
            id: e.id,
            title: e.title,
            venue: e.venue.name,
            endTime: e.endTime,
          })),
        },
      },
    })
  } catch (error) {
    console.error("Error in update-event-statuses cron job:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
