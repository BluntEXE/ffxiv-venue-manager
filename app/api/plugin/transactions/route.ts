import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { validateApiKey, checkPermission } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit } from "@/lib/api/plugin-rate-limit"
import {
  createTransaction,
  createTransactionSchema,
} from "@/lib/api/transactions"

/**
 * POST /api/plugin/transactions
 *
 * Log a sale from the Dalamud plugin. Authenticated via x-api-key header.
 * Body shape:
 *   { venueId, serviceId?, eventId?, amount, customerName?, notes? }
 *
 * Returns a minimal success payload — the plugin only needs to know the
 * row was accepted and get a short confirmation. Full transaction detail
 * lives on the website.
 *
 * Permission: delegates to checkPermission('log_transaction'), which
 * permits OWNER/MANAGER unconditionally and STAFF as well (aligned with
 * the web route's behavior — any active member can log a sale).
 */
const pluginTransactionSchema = createTransactionSchema.extend({
  venueId: z.string().min(1, "venueId is required"),
})

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key")
    if (!apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, "write")
    if (limited) return limited

    const body = await request.json()
    const parsed = pluginTransactionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { venueId, ...input } = parsed.data

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    const canLog = await checkPermission(
      auth.userId,
      venueId,
      "log_transaction"
    )
    if (!canLog) {
      return NextResponse.json(
        { error: "You do not have permission to log sales at this venue" },
        { status: 403 }
      )
    }

    const transaction = await createTransaction(venueId, auth.userId, input)

    // Minimal confirmation payload for the plugin. Amount is serialized as
    // a string to match the plugin's decimal-as-string convention
    // (XIVAppApiClient.Service.Price is string to avoid System.Text.Json
    // deserialization failures on Prisma Decimal).
    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        amount: transaction.amount.toString(),
        customerName: transaction.customerName,
        serviceId: transaction.serviceId,
        serviceName: transaction.service?.name ?? null,
        createdAt: transaction.createdAt,
      },
    })
  } catch (error) {
    console.error("[Plugin API] Error logging transaction:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
