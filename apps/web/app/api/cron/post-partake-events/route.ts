import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { fetchPartakeEvents } from "@/lib/partake"
import { cancelShiftEmbedsForEvent } from "@/lib/shift-bot"
import {
  formatPartakeEventPayload,
  formatPartakeEventReminderPayload,
  hashPartakeEventContent,
  sendDiscordWebhook,
  sendDiscordWebhookWithMessageId,
  editDiscordMessage,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000

/**
 * Cron Job: Post Partake-synced events to Discord within a 7-day window.
 * - Posts new events when they enter the 7-day window (or are created already inside it)
 * - Patches existing Discord messages when title / time / description change
 * - Marks events as cancelled (strikethrough title, red embed) when they disappear from Partake
 *
 * Should be run every 15 minutes.
 */
export async function GET(request: Request) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const now = new Date()
    const windowEnd = new Date(now.getTime() + WINDOW_MS)

    const venues = await prisma.venue.findMany({
      where: { partakeTeamId: { not: null }, isActive: true },
      select: {
        id: true,
        name: true,
        partakeTeamId: true,
        discordWebhookUrl: true,
        settings: true,
      },
    })

    const stats = { posted: 0, patched: 0, cancelled: 0, reminded: 0, skipped: 0, errors: 0 }
    const perVenue: Array<{ venue: string; posted: number; patched: number; cancelled: number; reminded: number }> = []

    for (const venue of venues) {
      const settings = (venue.settings as any) || {}
      const webhookConfig: VenueWebhookConfig = {
        discordWebhooks: settings.discordWebhooks,
        webhooks: settings.webhooks,
        discordWebhookUrl: venue.discordWebhookUrl,
      }
      const webhookUrl = getWebhookUrlForType(webhookConfig, "partakeEvent")
      if (!webhookUrl) {
        stats.skipped++
        continue
      }

      const venueStats = { venue: venue.name, posted: 0, patched: 0, cancelled: 0, reminded: 0 }

      let livePartakeIds = new Set<number>()
      try {
        const live = await fetchPartakeEvents(venue.partakeTeamId!)
        livePartakeIds = new Set(live.map((e) => e.id))
      } catch (err) {
        console.error(`[Partake Post] Failed to fetch live events for ${venue.name}:`, err)
        stats.errors++
        continue
      }

      const events = await prisma.event.findMany({
        where: {
          venueId: venue.id,
          partakeEventId: { not: null },
          status: "PUBLISHED",
          OR: [
            { startTime: { gt: now, lte: windowEnd }, discordCancelledAt: null },
            { discordMessageId: { not: null }, startTime: { gt: now } },
          ],
        },
      })

      for (const ev of events) {
        if (!ev.partakeEventId) continue

        const stillOnPartake = livePartakeIds.has(ev.partakeEventId)

        if (!stillOnPartake && ev.discordMessageId && !ev.discordCancelledAt) {
          const payload = formatPartakeEventPayload({
            partakeEventId: ev.partakeEventId,
            title: ev.title,
            description: ev.description,
            location: ev.location,
            startTime: ev.startTime,
            endTime: ev.endTime,
            partakeAttendeeCount: ev.partakeAttendeeCount,
            cancelled: true,
          })
          const ok = await editDiscordMessage(webhookUrl, ev.discordMessageId, payload)
          if (ok) {
            await prisma.event.update({
              where: { id: ev.id },
              data: { discordCancelledAt: now, status: "CANCELLED" },
            })
            try {
              await cancelShiftEmbedsForEvent(ev.id)
            } catch (err) {
              console.error(`[Partake Post] Failed to cancel shift embeds for event ${ev.id}:`, err)
              stats.errors++
            }
            stats.cancelled++
            venueStats.cancelled++
          } else {
            stats.errors++
          }
          continue
        }

        if (!stillOnPartake) continue

        const inWindow = ev.startTime.getTime() - now.getTime() <= WINDOW_MS
        if (!inWindow) continue

        const hash = hashPartakeEventContent({
          title: ev.title,
          description: ev.description,
          location: ev.location,
          startTime: ev.startTime,
          endTime: ev.endTime,
          partakeAttendeeCount: ev.partakeAttendeeCount,
        })

        const payload = formatPartakeEventPayload({
          partakeEventId: ev.partakeEventId,
          title: ev.title,
          description: ev.description,
          location: ev.location,
          startTime: ev.startTime,
          endTime: ev.endTime,
          partakeAttendeeCount: ev.partakeAttendeeCount,
        })

        if (!ev.discordMessageId) {
          const messageId = await sendDiscordWebhookWithMessageId(webhookUrl, payload)
          if (messageId) {
            await prisma.event.update({
              where: { id: ev.id },
              data: {
                discordMessageId: messageId,
                discordWebhookGroup: "events",
                discordContentHash: hash,
              },
            })
            stats.posted++
            venueStats.posted++
          } else {
            stats.errors++
          }
        } else if (ev.discordContentHash !== hash) {
          const ok = await editDiscordMessage(webhookUrl, ev.discordMessageId, payload)
          if (ok) {
            await prisma.event.update({
              where: { id: ev.id },
              data: { discordContentHash: hash },
            })
            stats.patched++
            venueStats.patched++
          } else {
            stats.errors++
          }
        } else {
          stats.skipped++
        }

        const msUntilStart = ev.startTime.getTime() - now.getTime()
        if (
          msUntilStart > 0 &&
          msUntilStart <= REMINDER_LEAD_MS &&
          !ev.discordReminderSentAt &&
          !ev.discordCancelledAt
        ) {
          const reminderPayload = formatPartakeEventReminderPayload({
            partakeEventId: ev.partakeEventId,
            title: ev.title,
            description: ev.description,
            location: ev.location,
            startTime: ev.startTime,
            endTime: ev.endTime,
          })
          const ok = await sendDiscordWebhook(webhookUrl, reminderPayload)
          if (ok) {
            await prisma.event.update({
              where: { id: ev.id },
              data: { discordReminderSentAt: now },
            })
            stats.reminded++
            venueStats.reminded++
          } else {
            stats.errors++
          }
        }

        await new Promise((r) => setTimeout(r, 200))
      }

      perVenue.push(venueStats)
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      stats,
      perVenue,
    })
  } catch (error) {
    console.error("[Partake Post] Fatal error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
