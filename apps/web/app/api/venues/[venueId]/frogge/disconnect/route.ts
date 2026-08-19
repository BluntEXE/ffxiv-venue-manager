import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
      return NextResponse.json({ error: "Only owners and managers can disconnect Frogge" }, { status: 403 })
    }

    await prisma.venue.update({
      where: { id: venueId },
      data: {
        froggeToken: null,
        froggeConnectedAt: null,
        froggeConnectedBy: null,
      },
    })

    return NextResponse.json({ disconnected: true })
  } catch (error) {
    console.error("[Frogge disconnect] Error:", error)
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 })
  }
}
