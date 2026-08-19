import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getGuildMembers } from "@/lib/frogge-api"

export async function GET(request: Request, { params }: { params: Promise<{ venueId: string }> }) {
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
        status: "active",
      },
    })

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this venue" }, { status: 403 })
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { froggeToken: true },
    })

    if (!venue?.froggeToken) {
      return NextResponse.json({ error: "Venue not connected to Frogge" }, { status: 400 })
    }

    const members = await getGuildMembers(venue.froggeToken)
    return NextResponse.json(members)
  } catch (error) {
    console.error("[Frogge members] Error:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch members"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
