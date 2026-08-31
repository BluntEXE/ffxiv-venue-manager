import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { pluginAuthGate, checkPermission } from "@/lib/api/plugin-auth"
import { getValidXvmApiToken, getValidXvmApiPersonId, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { createReservation } from "@/lib/api/xvm-api"
import { parsePluginRoomId } from "@/lib/api/plugin-rooms"

/**
 * POST /api/plugin/rooms/reserve
 *
 * Ad-hoc reservation from the plugin's duration-dropdown flow (auto-opened
 * on room entry, not the removed manual toggle) — source "plugin_auto" so
 * the maintenance worker's stale-hold sweep can recover an unreleased
 * reservation if the client crashes or logs out mid-room.
 */
const bodySchema = z.object({
  venueId: z.string().min(1),
  roomId: z.string().min(1),
  // 480 matches the plugin's own longest dropdown option (8 hr) - this
  // reservation gets a real end_at, so unlike an open-ended plugin_auto
  // hold, the maintenance worker's stale-hold sweep can never recover an
  // oversized one early.
  durationMinutes: z.number().int().positive().max(480),
})

export async function POST(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "write")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { venueId, roomId, durationMinutes } = parsed.data

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    const canReserve = await checkPermission(auth.userId, venueId, "toggle_room")
    if (!canReserve) {
      return NextResponse.json({ error: "You don't have permission to reserve rooms at this venue" }, { status: 403 })
    }

    const id = parsePluginRoomId(roomId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid room id" }, { status: 400 })
    }

    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
    if (!venue?.xvmApiVenueId) {
      return NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      )
    }

    const token = await getValidXvmApiToken(auth.userId)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      // xvm-api requires a holder (reserved_person_id or reserved_character_name)
      // on every reservation - the plugin doesn't send a specific in-game character
      // for this ad-hoc flow, so the acting dashboard user's own person id fills
      // that role. Fetched inside this try block, not before it: getMe() can throw
      // the same XvmApiError a stale/expired token throws from createReservation,
      // and needs the same 503-and-invalidate handling, not the outer 500.
      const personId = await getValidXvmApiPersonId(auth.userId)
      if (personId === null) {
        return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
      }

      const startAt = new Date()
      const endAt = new Date(startAt.getTime() + durationMinutes * 60_000)
      const reservation = await createReservation(token, venue.xvmApiVenueId, id, {
        reserved_person_id: personId,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        source: "plugin_auto",
      })
      return NextResponse.json({ success: true, reservation })
    } catch (err) {
      return xvmApiErrorResponse(err, auth.userId, "[plugin/rooms/reserve] error")
    }
  } catch (err) {
    console.error("[plugin/rooms/reserve] unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
