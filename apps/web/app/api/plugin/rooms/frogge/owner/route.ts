import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { pluginAuthGate, checkPermission } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"

const ownerSchema = z.object({
  venueId: z.string().min(1),
  roomId: z.string().min(1),
  ownerDiscordId: z.string().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "write")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const body = await request.json()
    const { venueId, roomId, ownerDiscordId } = ownerSchema.parse(body)

    if (!venueId || !auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }
    const canToggle = await checkPermission(auth.userId, venueId, "toggle_room")
    if (!canToggle) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { froggeToken: true, froggeVenueId: true },
    })
    if (!venue?.froggeToken) {
      return NextResponse.json({ error: "Frogge not connected" }, { status: 400 })
    }

    const room = await prisma.room.findFirst({ where: { id: roomId, venueId } })
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 })
    }

    await prisma.room.update({
      where: { id: roomId },
      data: { ownerDiscordId: ownerDiscordId || null },
    })

    if (venue.froggeVenueId && room.froggeRoomId) {
      try {
        const { setRoomOwner } = await import("@/lib/frogge-api")
        await setRoomOwner(venue.froggeVenueId, room.froggeRoomId, ownerDiscordId || null, venue.froggeToken)
      } catch (error) {
        console.error("[Plugin API] Frogge owner sync failed:", error)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    console.error("[Plugin API] Error setting room owner:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
