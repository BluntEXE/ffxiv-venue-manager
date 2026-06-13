import { venueEventBus } from "@/lib/sse/venue-events"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { validators, sanitizeDiscordContent } from "@/lib/validation"
import {
  sendDiscordWebhook,
  formatSaleLoggedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
import { invalidateCache } from "@/lib/redis-cache"

/**
 * Shared validation schema for transaction creation. Used by both the
 * session-authed web route (/api/venues/[venueId]/transactions) and the
 * api-key-authed plugin route (/api/plugin/transactions). Keeping the
 * schema here means the two callers can't drift - adding a field in one
 * place adds it in both.
 */
export const createTransactionSchema = z.object({
  serviceId: z.string().optional(),
  eventId: z.string().optional(),
  type: z.enum(["SALE", "TIP", "COVER_CHARGE", "OTHER"]).optional().default("SALE"),
  amount: validators.amount,
  customerName: validators.customerName,
  notes: validators.transactionNotes,
})

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>

/**
 * Create a transaction row, fire the sale-logged Discord webhook, and
 * invalidate the services + transactions caches. Callers are responsible
 * for auth, venue access verification, and permission checks - this
 * helper only owns the domain write + side effects.
 */
export async function createTransaction(
  venueId: string,
  staffUserId: string,
  input: CreateTransactionInput
) {
  // If the caller didn't specify an event, attribute the sale to whatever
  // event is currently running at this venue (startTime <= now <= endTime,
  // status PUBLISHED or ACTIVE). Mirrors the lookup in
  // /api/plugin/events/active so sales logged during an event always count
  // toward its revenue, even if the client (plugin or web) doesn't pass
  // eventId explicitly.
  let eventId = input.eventId
  if (!eventId) {
    const now = new Date()
    const activeEvent = await prisma.event.findFirst({
      where: {
        venueId,
        startTime: { lte: now },
        endTime: { gte: now },
        status: { in: ["PUBLISHED", "ACTIVE"] },
      },
      orderBy: { startTime: "desc" },
      select: { id: true },
    })
    eventId = activeEvent?.id
  }

  const newTransaction = await prisma.transaction.create({
    data: {
      venueId,
      serviceId: input.serviceId,
      eventId,
      staffId: staffUserId,
      type: input.type ?? "SALE",
      amount: input.amount,
      customerName: input.customerName,
      notes: input.notes,
    },
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

  // Discord webhook (fire-and-forget - never block the response)
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      discordWebhookUrl: true,
      settings: true,
    },
  })

  if (venue) {
    const webhookConfig: VenueWebhookConfig = {
      discordWebhooks: (venue.settings as any)?.discordWebhooks,
      webhooks: (venue.settings as any)?.webhooks,
      discordWebhookUrl: venue.discordWebhookUrl,
    }

    const webhookUrl = getWebhookUrlForType(webhookConfig, "saleLogged")
    if (webhookUrl) {
      const embed = formatSaleLoggedEmbed({
        amount: Number(newTransaction.amount),
        service: newTransaction.service,
        customerName: sanitizeDiscordContent(newTransaction.customerName, {
          maxLength: 100,
          stripUrls: true,
        }),
        staff: newTransaction.staff,
      })

      sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch((error) =>
        console.error("Failed to send Discord webhook:", error)
      )
    }
  }

  // Invalidate caches (transactions affect service stats)
  await invalidateCache(`venue:${venueId}:services`)
  await invalidateCache(`venue:${venueId}:transactions:*`)

  venueEventBus.emit(venueId, {
    id: newTransaction.id,
    type: "sale",
    venueId,
    timestamp: newTransaction.createdAt.toISOString(),
    data: {
      amount: Number(newTransaction.amount),
      customerName: newTransaction.customerName,
      service: newTransaction.service,
      staff: newTransaction.staff,
      notes: newTransaction.notes,
    },
  })

  return newTransaction
}
