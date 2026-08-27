import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { pluginAuthGate, checkPermission } from "@/lib/api/plugin-auth"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import { releaseRoom, XvmApiError, xvmErrorMessage } from "@/lib/api/xvm-api"
import { parsePluginRoomId } from "@/lib/api/plugin-rooms"

/**
 * POST /api/plugin/rooms/release
 *
 * Ends the room's current reservation early, from the plugin's exit-detect
 * flow (or manual release button).
 */
const bodySchema = z.object({
  venueId: z.string().min(1),
  roomId: z.string().min(1),
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
    const { venueId, roomId } = parsed.data

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    const canRelease = await checkPermission(auth.userId, venueId, "toggle_room")
    if (!canRelease) {
      return NextResponse.json({ error: "You don't have permission to release rooms at this venue" }, { status: 403 })
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
      const room = await releaseRoom(token, venue.xvmApiVenueId, id)
      return NextResponse.json({ success: true, room })
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[plugin/rooms/release] error:", err)
      await invalidateXvmApiCredential(auth.userId)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  } catch (err) {
    console.error("[plugin/rooms/release] unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
