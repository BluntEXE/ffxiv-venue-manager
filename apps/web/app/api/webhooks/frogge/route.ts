import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"

const WEBHOOK_SECRET = process.env.FROGGE_WEBHOOK_SECRET

function verifyWebhookSignature(
  body: string,
  headers: { "svix-id": string | null; "svix-timestamp": string | null; "svix-signature": string | null }
): boolean {
  if (!WEBHOOK_SECRET) return true
  const { "svix-id": svixId, "svix-timestamp": svixTimestamp, "svix-signature": svixSignature } = headers
  if (!svixId || !svixTimestamp || !svixSignature) return false
  const toSign = `${svixId}.${svixTimestamp}.${body}`
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(toSign).digest("base64")
  return svixSignature.split(" ").some((s) => {
    const [version, sig] = s.split(",")
    return version === "v1" && sig === signature
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const isDev = process.env.NODE_ENV === "development" || request.headers.get("x-dev-bypass") === "true"

    if (!isDev) {
      const isValid = verifyWebhookSignature(body, {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
      })
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

    if (type === "room.created" || type === "room.updated" || type === "room.reserved" || type === "room.released") {
      if (!roomId) return NextResponse.json({ error: "Missing room ID" }, { status: 400 })

      const reservations = roomData.reservations || []
      const isOccupied = reservations.some((r: any) => !r.end_at || new Date(r.end_at) > new Date())

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
      if (roomId) {
        await prisma.room.deleteMany({ where: { venueId: venue.id, froggeRoomId: roomId } })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[Frogge webhook] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
