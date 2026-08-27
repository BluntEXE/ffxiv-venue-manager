import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import { listRooms, XvmApiError, xvmErrorMessage } from "@/lib/api/xvm-api"
import { toPluginRoom } from "@/lib/api/plugin-rooms"

/**
 * GET /api/plugin/rooms?venueId=
 *
 * List rooms for the plugin's Rooms tab. Bridges the plugin's fixed
 * RoomsResponse contract to xvm-api, which owns Rooms data now.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get("venueId")
    if (!venueId || !auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
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
      const rooms = await listRooms(token, venue.xvmApiVenueId)
      return NextResponse.json({ rooms: rooms.map(toPluginRoom) })
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[plugin/rooms] GET error:", err)
      await invalidateXvmApiCredential(auth.userId)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  } catch (err) {
    console.error("[plugin/rooms] GET unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
