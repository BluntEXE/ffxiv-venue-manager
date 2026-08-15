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
import { resolveDisplayName } from "@/lib/display-name"

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
 * Thrown by createTransaction when the target service has stockCount <= 0.
 * Callers translate this into a 409 response - it is a hard block, not a
 * warning, matching the approved bar-inventory-mapping design.
 */
export class InsufficientStockError extends Error {
  constructor(serviceName: string) {
    super(`${serviceName} is out of stock`)
    this.name = "InsufficientStockError"
  }
}

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

  // Stock enforcement only applies to actual sales - a TIP or COVER_CHARGE
  // logged against a serviceId must not consume inventory. resolvedType is
  // the same value that ends up in `type: ...` on the create() below, so
  // this condition can never diverge from what's actually inserted.
  const resolvedType = input.type ?? "SALE"

  // Stock check + create + decrement happen in one DB transaction so a
  // concurrent sale can't oversell the last unit. updateMany's gt:0 filter
  // is the atomic guard: if two requests race, only one's updateMany
  // affects a row, and the loser gets a hard 409 rather than a negative
  // stockCount.
  if (input.serviceId && resolvedType === "SALE") {
    const service = await prisma.service.findUnique({
      where: { id: input.serviceId },
      select: { name: true, stockCount: true },
    })
    if (service && service.stockCount !== null && service.stockCount <= 0) {
      throw new InsufficientStockError(service.name)
    }
  }

  const newTransaction = await prisma.$transaction(async (tx) => {
    if (input.serviceId && resolvedType === "SALE") {
      const decremented = await tx.service.updateMany({
        where: { id: input.serviceId, stockCount: { gt: 0 } },
        data: { stockCount: { decrement: 1 } },
      })
      // decremented.count === 0 means either the service isn't
      // stock-tracked (stockCount is null, filtered out by gt:0 - fine,
      // not an error) or it hit zero between our findUnique check and
      // here (a real race - re-check to distinguish the two).
      if (decremented.count === 0) {
        const current = await tx.service.findUnique({
          where: { id: input.serviceId },
          select: { name: true, stockCount: true },
        })
        if (current && current.stockCount !== null && current.stockCount <= 0) {
          throw new InsufficientStockError(current.name)
        }
      }
    }

    return tx.transaction.create({
      data: {
        venueId,
        serviceId: input.serviceId,
        eventId,
        staffId: staffUserId,
        type: resolvedType,
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
            stockCount: true,
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
            displayName: true,
            characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
          },
        },
      },
    })
  })

  // The nickname is venue-specific and Transaction has no direct Membership
  // relation (only staffId -> User), so look it up separately.
  const staffMembership = newTransaction.staff
    ? await prisma.membership.findFirst({
        where: { userId: newTransaction.staff.id, venueId },
        select: { nickname: true },
      })
    : null

  const resolvedStaffName = newTransaction.staff
    ? resolveDisplayName({
        characterName: newTransaction.staff.characters[0]?.characterName,
        nickname: staffMembership?.nickname,
        displayName: newTransaction.staff.displayName,
        discordName: newTransaction.staff.name,
      })
    : null

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
        customerName: sanitizeDiscordContent(newTransaction.customerName),
        staff: resolvedStaffName ? { name: resolvedStaffName } : null,
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
      staff: resolvedStaffName ? { id: newTransaction.staff?.id, name: resolvedStaffName } : null,
      notes: newTransaction.notes,
    },
  })

  return newTransaction
}
