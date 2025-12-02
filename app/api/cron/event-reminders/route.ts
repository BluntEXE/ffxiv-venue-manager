import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  sendDiscordWebhook,
  formatEventStartingSoonEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"

/**
 * Cron Job: Event Starting Soon Reminders
 * Sends Discord notifications for events starting in the next hour
 * Should be run every 15 minutes
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
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour ahead

    // Find events starting in the next hour that haven't been reminded yet
    const upcomingEvents = await prisma.event.findMany({
      where: {
        status: "PUBLISHED", // Only published events
        startTime: {
          gte: now,
          lte: oneHourFromNow,
        },
      },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            discordWebhookUrl: true,
            settings: true,
          },
        },
      },
    })

    const notifications: Array<{ success: boolean; eventId: string; venueName: string }> = []

    // Send notifications for each event
    for (const event of upcomingEvents) {
      const venue = event.venue

      const webhookConfig: VenueWebhookConfig = {
        discordWebhooks: (venue.settings as any)?.discordWebhooks,
        webhooks: (venue.settings as any)?.webhooks,
        discordWebhookUrl: venue.discordWebhookUrl,
      }

      const webhookUrl = getWebhookUrlForType(webhookConfig, "eventStartingSoon")
      if (!webhookUrl) {
        notifications.push({
          success: false,
          eventId: event.id,
          venueName: venue.name,
        })
        continue
      }

      // Format and send notification
      const embed = formatEventStartingSoonEmbed({
        title: event.title,
        startTime: event.startTime,
      })

      const success = await sendDiscordWebhook(webhookUrl, {
        embeds: [embed],
      })

      notifications.push({
        success,
        eventId: event.id,
        venueName: venue.name,
      })

      // Optional: Add a small delay between webhooks to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      eventsChecked: upcomingEvents.length,
      notifications,
    })
  } catch (error) {
    console.error("Error in event reminders cron job:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
