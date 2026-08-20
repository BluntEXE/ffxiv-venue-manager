import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { pluginAuthGate, checkPermission } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"
import { venueEventBus } from "@/lib/sse/venue-events"

const roomStatusSchema = z.object({
  venueId: z.string().min(1, "venueId is required"),
  roomId: z.string().min(1, "roomId is required"),
  isOccupied: z.boolean(),
  note: z.string().max(500, "Note too long (max 500 characters)").optional(),
})

/**
 * POST /api/plugin/rooms/status
 *
 * Toggle a room's status from the plugin's Rooms tab. Any active
 * staff member (via checkPermission's 'toggle_room' action) — not
 * OWNER/MANAGER only, unlike the ban write endpoint. Also broadcasts
 * to the dashboard's live SSE feed, same as the web status route.
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "write")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const body = await request.json()
    const { venueId, roomId, isOccupied, note } = roomStatusSchema.parse(body)

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

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: {
        isOccupied,
        // Preserve room.note when `note` is omitted from the request;
        // only clear it when the caller sends an explicit empty string.
        note: note !== undefined ? note.trim() || null : room.note,
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

    syncFroggeStatus(venueId, roomId, isOccupied)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    console.error("[Plugin API] Error setting room status:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function syncFroggeStatus(venueId: string, roomId: string, isOccupied: boolean) {
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
    const { reserveRoom, releaseRoom } = await import("@/lib/frogge-api")
    if (isOccupied) {
      await reserveRoom(venue.froggeVenueId, room.froggeRoomId, 240, venue.froggeToken)
    } else {
      await releaseRoom(venue.froggeVenueId, room.froggeRoomId, venue.froggeToken)
    }
  } catch (error) {
    console.error("[Plugin API] Frogge status sync failed:", error)
  }
}
