import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { postRoomsToDiscord } from "@/lib/frogge-api"

export async function POST(request: Request, { params }: { params: Promise<{ venueId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await params

    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        role: { in: ["OWNER", "MANAGER"] },
        status: "active",
      },
    })

    if (!membership) {
      return NextResponse.json({ error: "Only owners and managers can post rooms" }, { status: 403 })
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { froggeVenueId: true, froggeToken: true },
    })

    if (!venue?.froggeVenueId || !venue.froggeToken) {
      return NextResponse.json({ error: "Venue not connected to Frogge" }, { status: 400 })
    }

    await postRoomsToDiscord(venue.froggeVenueId, venue.froggeToken)

    return NextResponse.json({ posted: true })
  } catch (error) {
    console.error("[Frogge post] Error:", error)
    const message = error instanceof Error ? error.message : "Failed to post rooms"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
