import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { generateOccurrences, type RecurrenceRule } from "@/lib/recurrence"
import { addWeeks } from "date-fns"
import { postEventLive } from "@/lib/discord-feed"

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
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const now = new Date()
    console.log(`[Cron] Event status update starting at ${now.toISOString()}`)

    // 1. Find PUBLISHED events that should be ACTIVE (startTime has passed)
    console.log(`[Cron] Looking for PUBLISHED events with startTime <= ${now.toISOString()} and endTime >= ${now.toISOString()}`)
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
            slug: true,
          },
        },
      },
    })
    console.log(`[Cron] Found ${eventsToActivate.length} events to activate`)

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
    console.log(`[Cron] Looking for ACTIVE events with endTime <= ${now.toISOString()}`)
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
    console.log(`[Cron] Found ${eventsToComplete.length} events to complete`)

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
        const finalPatronCount = patronLogs.reduce((sum, log) => sum + (log.countChange ?? 0), 0)

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

    // 3. Roll recurring event series forward — keep 8 weeks of future instances
    const recurringParents = await prisma.event.findMany({
      where: { recurrenceRule: { not: null }, parentEventId: null },
      select: {
        id: true,
        title: true,
        description: true,
        eventType: true,
        status: true,
        timezone: true,
        venueId: true,
        createdById: true,
        recurrenceRule: true,
        childEvents: {
          where: { status: { not: "CANCELLED" } },
          select: { startTime: true, endTime: true },
          orderBy: { startTime: "desc" },
          take: 1,
        },
      },
    })

    let recurringGenerated = 0
    const windowEnd = addWeeks(now, 8)

    for (const parent of recurringParents) {
      const lastChild = parent.childEvents[0]
      const lastTime = lastChild ? new Date(lastChild.startTime) : new Date(parent.status === "CANCELLED" ? 0 : now)
      if (lastTime >= windowEnd) continue

      // Find the latest child to extend from
      const latestChild = await prisma.event.findFirst({
        where: { parentEventId: parent.id, status: { not: "CANCELLED" } },
        orderBy: { startTime: "desc" },
        select: { startTime: true, endTime: true },
      })
      if (!latestChild) continue

      const newOccurrences = generateOccurrences(
        new Date(latestChild.startTime),
        new Date(latestChild.endTime),
        parent.recurrenceRule as RecurrenceRule,
        4
      )

      await prisma.event.createMany({
        data: newOccurrences.map((o) => ({
          title: parent.title,
          description: parent.description,
          eventType: parent.eventType,
          status: "PUBLISHED",
          timezone: parent.timezone,
          venueId: parent.venueId,
          createdById: parent.createdById,
          parentEventId: parent.id,
          startTime: o.startTime,
          endTime: o.endTime,
        })),
        skipDuplicates: true,
      })
      recurringGenerated += newOccurrences.length
    }

    // Post activated events to Discord activity feed
    for (const e of eventsToActivate) {
      postEventLive({
        title: e.title,
        startTime: new Date(e.startTime),
        endTime: new Date(e.endTime),
        venue: e.venue,
      })
    }

    // Log the results for monitoring
    console.log(`[Event Status Update] ${now.toISOString()}`)
    console.log(`  Activated: ${activatedCount} events`)
    console.log(`  Completed: ${completedCount} events`)
    console.log(`  Recurring generated: ${recurringGenerated} instances`)

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
        recurringGenerated,
      },
    })
  } catch (error) {
    console.error("Error in update-event-statuses cron job:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
