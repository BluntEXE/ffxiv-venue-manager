import { NextRequest, NextResponse } from "next/server"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"
import { getGuildMembers } from "@/lib/frogge-api"

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

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { froggeToken: true, froggeVenueId: true },
    })
    if (!venue?.froggeToken || !venue.froggeVenueId) {
      return NextResponse.json({ error: "Frogge not connected" }, { status: 400 })
    }

    const members = await getGuildMembers(venue.froggeToken)
    return NextResponse.json({ members })
  } catch (error) {
    console.error("[Plugin API] Error fetching frogge members:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
