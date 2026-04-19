import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
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
    const authError = verifyCronAuth(request)
    if (authError) return authError

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
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
