import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import { createVenue, XvmApiError, xvmErrorMessage } from "@/lib/api/xvm-api"

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params

    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        status: "active",
      },
    })

    const isOwner = membership?.role === "OWNER"
    if (!isOwner) {
      return NextResponse.json({ error: "Only the venue owner can connect to xvm-api" }, { status: 403 })
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
    })

    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 })
    }

    if (venue.xvmApiVenueId) {
      return NextResponse.json({ error: "Already connected" }, { status: 409 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      const result = await createVenue(token, {
        name: venue.name,
        data_center: venue.dataCenter,
        world: venue.world,
      })

      await prisma.venue.update({
        where: { id: venueId },
        data: {
          xvmApiVenueId: result.id,
          xvmApiVenueLinkedAt: new Date(),
          xvmApiVenueLinkedBy: session.user.id,
        },
      })

      return NextResponse.json(result)
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[xvm-connect] POST error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 10, window: "1 m" }
)
