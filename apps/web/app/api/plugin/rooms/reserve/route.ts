import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { pluginAuthGate, checkPermission } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"
import { venueEventBus } from "@/lib/sse/venue-events"

const reserveSchema = z.object({
  venueId: z.string().min(1),
  roomId: z.string().min(1),
  durationMinutes: z.number().int().min(30).max(480),
})

export async function POST(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "write")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const body = await request.json()
    const { venueId, roomId, durationMinutes } = reserveSchema.parse(body)

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    const canToggle = await checkPermission(auth.userId, venueId, "toggle_room")
    if (!canToggle) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 })
    }

    const room = await prisma.room.findFirst({ where: { id: roomId, venueId } })
    if (!room) {
      return NextResponse.json({ error: "Room not found in this venue" }, { status: 404 })
    }
    if (room.locked || room.disabled) {
      return NextResponse.json({ error: "Room is not available" }, { status: 409 })
    }

    const now = new Date()
    const endAt = new Date(now.getTime() + durationMinutes * 60 * 1000)

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: {
        isOccupied: true,
        note: `Reserved by plugin - ${durationMinutes}min`,
        updatedById: auth.userId,
      },
      include: { updatedBy: { select: { name: true } } },
    })

    venueEventBus.emit(venueId, {
      id: `room-${updated.id}-${updated.updatedAt.getTime()}`,
      type: "room_status",
      venueId,
      timestamp: updated.updatedAt.toISOString(),
      data: {
        roomId: updated.id,
        name: updated.name,
        isOccupied: updated.isOccupied,
        note: updated.note,
        updatedByName: updated.updatedBy?.name ?? null,
      },
    })

    await syncFroggeReserve(venueId, roomId, durationMinutes, auth.userId)

    return NextResponse.json({ success: true, endAt: endAt.toISOString() })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    console.error("[Plugin API] Error reserving room:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function syncFroggeReserve(
  venueId: string,
  roomId: string,
  durationMinutes: number,
  userId: string
) {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { froggeToken: true, froggeVenueId: true },
    })
    if (!venue?.froggeToken || !venue.froggeVenueId) return
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: { froggeRoomId: true },
    })
    if (!room?.froggeRoomId) return
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { discordId: true },
    })
    if (!user?.discordId) return

    const { createReservation } = await import("@/lib/frogge-api")
    const now = new Date()
    const endAt = new Date(now.getTime() + durationMinutes * 60 * 1000)
    await createReservation(
      venue.froggeVenueId,
      room.froggeRoomId,
      {
        reserved_discord_id: user.discordId,
        start_at: now.toISOString(),
        end_at: endAt.toISOString(),
        source: "plugin_manual",
      },
      venue.froggeToken
    )
  } catch (error) {
    console.error("[Plugin API] Frogge reserve sync failed:", error)
  }
}
