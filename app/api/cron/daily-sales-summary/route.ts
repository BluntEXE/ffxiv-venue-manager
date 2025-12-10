import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  sendDiscordWebhook,
  formatDailySalesSummaryEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
import { parseVenueSettings } from "@/lib/types/venue-settings"

/**
 * Cron Job: Daily Sales Summary
 * Sends Discord notifications with daily sales reports for each venue
 * Should be run once per day (e.g., midnight)
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

    // Get yesterday's date range
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Get all active venues
    const venues = await prisma.venue.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        discordWebhookUrl: true,
        settings: true,
      },
    })

    const summaries: Array<{
      success: boolean
      venueId: string
      venueName: string
      totalSales?: number
      totalRevenue?: number
    }> = []

    // Process each venue
    for (const venue of venues) {
      const settings = parseVenueSettings(venue.settings)
      const webhookConfig: VenueWebhookConfig = {
        discordWebhooks: settings.discordWebhooks,
        webhooks: settings.webhooks,
        discordWebhookUrl: venue.discordWebhookUrl,
      }

      const webhookUrl = getWebhookUrlForType(webhookConfig, "dailySalesSummary")
      if (!webhookUrl) {
        summaries.push({
          success: false,
          venueId: venue.id,
          venueName: venue.name,
        })
        continue
      }

      // Get all transactions for yesterday
      const transactions = await prisma.transaction.findMany({
        where: {
          venueId: venue.id,
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
        include: {
          service: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      // Calculate summary statistics
      const totalSales = transactions.length
      const totalRevenue = transactions.reduce(
        (sum: number, t: typeof transactions[number]) => sum + Number(t.amount),
        0
      )

      // Find top service
      const serviceSales = new Map<string, { name: string; count: number }>()
      transactions.forEach((t: typeof transactions[number]) => {
        if (t.service) {
          const existing = serviceSales.get(t.service.id)
          if (existing) {
            existing.count++
          } else {
            serviceSales.set(t.service.id, {
              name: t.service.name,
              count: 1,
            })
          }
        }
      })

      let topService: { name: string; sales: number } | null = null
      if (serviceSales.size > 0) {
        const sorted = Array.from(serviceSales.values()).sort(
          (a, b) => b.count - a.count
        )
        topService = {
          name: sorted[0].name,
          sales: sorted[0].count,
        }
      }

      // Format date string
      const dateString = yesterday.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })

      // Format and send notification
      const embed = formatDailySalesSummaryEmbed({
        date: dateString,
        totalSales,
        totalRevenue,
        topService,
      })

      const success = await sendDiscordWebhook(webhookUrl, {
        embeds: [embed],
      })

      summaries.push({
        success,
        venueId: venue.id,
        venueName: venue.name,
        totalSales,
        totalRevenue,
      })

      // Add delay between webhooks to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    return NextResponse.json({
      success: true,
      timestamp: today.toISOString(),
      dateRange: {
        from: yesterday.toISOString(),
        to: today.toISOString(),
      },
      venuesProcessed: venues.length,
      summaries,
    })
  } catch (error) {
    console.error("Error in daily sales summary cron job:", error)
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    )
  }
}
