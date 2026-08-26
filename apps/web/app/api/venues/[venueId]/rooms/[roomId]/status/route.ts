import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { venueEventBus } from "@/lib/sse/venue-events"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import { createReservation, releaseRoom, getRoom, XvmApiError, xvmErrorMessage, type Room } from "@/lib/api/xvm-api"

// Action-discriminated body: xvm-api has no isOccupied flag, occupying a
// room means creating a reservation and vacating means releasing it.
const setStatusSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reserve"),
    reserved_character_name: z.string().trim().min(1).max(100).optional(),
    reserved_world: z.string().trim().min(1).max(50).optional(),
    reserved_person_id: z.number().int().optional(),
  }),
  z.object({
    action: z.literal("release"),
  }),
])

function emitRoomStatus(venueId: string, room: Room) {
  venueEventBus.emit(venueId, {
    id: `room-${room.id}-${room.updated_at}`,
    type: "room_status",
    venueId,
    timestamp: room.updated_at,
    data: {
      roomId: room.id,
      name: room.name,
      isOccupied: room.current_reservation !== null,
      status: room.status,
    },
  })
}

export const PATCH = withRateLimit<{
  params: Promise<{ venueId: string; roomId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, roomId } = await context.params
    const id = Number(roomId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid room id" }, { status: 400 })
    }

    let parsed: z.infer<typeof setStatusSchema>
    try {
      parsed = setStatusSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      let room: Room
      if (parsed.action === "reserve") {
        await createReservation(token, venueId, id, {
          reserved_person_id: parsed.reserved_person_id ?? null,
          reserved_character_name: parsed.reserved_character_name ?? null,
          reserved_world: parsed.reserved_world ?? null,
          start_at: new Date().toISOString(),
          source: "dashboard",
        })
        // createReservation returns a Reservation, not the room — re-fetch
        // the room so the response/SSE payload carries the full current state.
        room = await getRoom(token, venueId, id)
      } else {
        room = await releaseRoom(token, venueId, id)
      }
      emitRoomStatus(venueId, room)
      return NextResponse.json(room)
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[rooms/:id/status] error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 60, window: "1 m" }
)
