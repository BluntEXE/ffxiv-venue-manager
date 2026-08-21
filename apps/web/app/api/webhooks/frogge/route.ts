import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"

const WEBHOOK_SECRET = process.env.FROGGE_WEBHOOK_SECRET

function verifyWebhookSignature(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null }
): boolean {
  if (!WEBHOOK_SECRET) return false
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) return false
  const toSign = `${id}.${timestamp}.${body}`
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(toSign).digest("base64")
  return signature.split(" ").some((s) => {
    const [version, sig] = s.split(",")
    if (version !== "v1" || !sig) return false
    const a = Buffer.from(expected)
    const b = Buffer.from(sig)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  })
}

function readSignatureHeaders(request: NextRequest) {
  return {
    id: request.headers.get("webhook-id") ?? request.headers.get("svix-id"),
    timestamp: request.headers.get("webhook-timestamp") ?? request.headers.get("svix-timestamp"),
    signature: request.headers.get("webhook-signature") ?? request.headers.get("svix-signature"),
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const isDev = process.env.NODE_ENV === "development"

    if (!isDev) {
      const isValid = verifyWebhookSignature(body, readSignatureHeaders(request))
      if (!isValid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const event = JSON.parse(body)
    const { type, data } = event
    const froggeVenueId = data?.froggeVenueId || data?.venue_id

    if (!froggeVenueId) {
      console.warn("[Frogge webhook] No froggeVenueId in payload")
      return NextResponse.json({ error: "Missing venue ID" }, { status: 400 })
    }

    const venue = await prisma.venue.findFirst({ where: { froggeVenueId }, select: { id: true } })
    if (!venue) {
      console.warn(`[Frogge webhook] Venue not found for ${froggeVenueId}`)
      return NextResponse.json({ error: "Venue not found" }, { status: 404 })
    }

    const roomData = data.room || data
    const roomId = roomData?.id
    if (!roomId) {
      return NextResponse.json({ error: "Missing room ID" }, { status: 400 })
    }

    if (type === "room.created" || type === "room.updated" || type === "room.reserved" || type === "room.released") {
      const froggeStatus = roomData.status as string | undefined
      const isOccupied = froggeStatus ? froggeStatus === "reserved" : false

      const existing = await prisma.room.findFirst({ where: { venueId: venue.id, froggeRoomId: roomId } })

      if (existing) {
        await prisma.room.update({
          where: { id: existing.id },
          data: {
            name: roomData.name ?? `Room ${roomData.room_number}`,
            roomNumber: roomData.room_number ?? null,
            locked: roomData.locked ?? false,
            disabled: roomData.disabled ?? false,
            ownerDiscordId: roomData.owner_discord_id ?? null,
            imageUrl: roomData.images?.[0]?.image_url ?? null,
            isOccupied,
            lastSyncedAt: new Date(),
          },
        })
      } else {
        await prisma.room.create({
          data: {
            venueId: venue.id,
            name: roomData.name ?? `Room ${roomData.room_number}`,
            froggeRoomId: roomId,
            roomNumber: roomData.room_number ?? null,
            locked: roomData.locked ?? false,
            disabled: roomData.disabled ?? false,
            ownerDiscordId: roomData.owner_discord_id ?? null,
            imageUrl: roomData.images?.[0]?.image_url ?? null,
            isOccupied,
            lastSyncedAt: new Date(),
          },
        })
      }
    } else if (type === "room.deleted") {
      await prisma.room.deleteMany({ where: { venueId: venue.id, froggeRoomId: roomId } })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[Frogge webhook] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
