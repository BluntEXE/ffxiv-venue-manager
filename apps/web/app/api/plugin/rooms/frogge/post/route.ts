import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { pluginAuthGate, checkPermission } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"
import { postRoomsToDiscord } from "@/lib/frogge-api"

const postSchema = z.object({ venueId: z.string().min(1) })

export async function POST(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "write")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const body = await request.json()
    const { venueId } = postSchema.parse(body)

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
    if (!venue?.froggeToken || !venue.froggeVenueId) {
      return NextResponse.json({ error: "Frogge not connected" }, { status: 400 })
    }

    await postRoomsToDiscord(venue.froggeVenueId, venue.froggeToken)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    console.error("[Plugin API] Error posting rooms to Discord:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
