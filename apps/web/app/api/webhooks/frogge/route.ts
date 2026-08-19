import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"

// Frogge webhook secret from environment
const WEBHOOK_SECRET = process.env.FROGGE_WEBHOOK_SECRET

/**
 * Verify HMAC-SHA256 signature from Standard Webhooks format.
 * Header: svix-id | svix-timestamp | svix-signature
 */
function verifyWebhookSignature(
  body: string,
  headers: {
    "svix-id": string | null
    "svix-timestamp": string | null
    "svix-signature": string | null
  }
): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn("[Frogge webhook] No FROGGE_WEBHOOK_SECRET configured - skipping verification")
    return true
  }

  const { "svix-id": svixId, "svix-timestamp": svixTimestamp, "svix-signature": svixSignature } = headers

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error("[Frogge webhook] Missing svix headers")
    return false
  }

  const toSign = `${svixId}.${svixTimestamp}.${body}`
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(toSign).digest("base64")

  // svix-signature can contain multiple signatures separated by spaces
  const signatures = svixSignature.split(" ")
  return signatures.some((s) => {
    const [version, sig] = s.split(",")
    return version === "v1" && sig === signature
  })
}

/**
 * Find the local venue by froggeVenueId.
 */
async function findVenueByFroggeId(froggeVenueId: string) {
  return prisma.venue.findFirst({
    where: { froggeVenueId },
    select: { id: true, name: true },
  })
}

/**
 * Find the local room by froggeRoomId.
 */
async function findRoomByFroggeId(froggeRoomId: number) {
  return prisma.room.findFirst({
    where: { froggeRoomId },
    select: { id: true, venueId: true, name: true },
  })
}

/**
 * POST /api/webhooks/frogge
 *
 * Receives outbound webhooks from Frogge's webhook system.
 * Events: room.created, room.updated, room.deleted,
 *         room.reserved, room.released, room.posted
 *
 * Currently logs events only. Full sync will be implemented
 * when Frogge's v2 API ships.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()

    // Verify signature
    const isValid = verifyWebhookSignature(body, {
      "svix-id": request.headers.get("svix-id"),
      "svix-timestamp": request.headers.get("svix-timestamp"),
      "svix-signature": request.headers.get("svix-signature"),
    })

    if (!isValid) {
      console.error("[Frogge webhook] Invalid signature")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const event = JSON.parse(body)
    const { type, data } = event

    console.log(`[Frogge webhook] Received: ${type}`, data)

    // Handle different event types
    switch (type) {
      case "room.created":
      case "room.updated":
      case "room.deleted":
      case "room.reserved":
      case "room.released":
      case "room.posted":
        // TODO: Implement full sync when Frogge v2 API ships
        // For now, just log the event
        console.log(`[Frogge webhook] Event ${type} received - sync pending`)
        break

      default:
        console.warn(`[Frogge webhook] Unknown event type: ${type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[Frogge webhook] Error processing webhook:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
