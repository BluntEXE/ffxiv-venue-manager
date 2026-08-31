import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { createVenue } from "@/lib/api/xvm-api"

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

      const updated = await prisma.venue.updateMany({
        where: { id: venueId, xvmApiVenueId: null },
        data: {
          xvmApiVenueId: result.id,
          xvmApiVenueLinkedAt: new Date(),
          xvmApiVenueLinkedBy: session.user.id,
        },
      })

      if (updated.count === 0) {
        console.error(`[xvm-connect] lost the connect race; orphaned xvm-api venue ${result.id}`)
        return NextResponse.json({ error: "Already connected" }, { status: 409 })
      }

      await Promise.all([
        invalidateCache(cacheKeys.userVenues(session.user.id)),
        invalidateCache(cacheKeys.venue(venueId)),
        invalidateCache(cacheKeys.venueBySlug(venue.slug)),
      ])

      return NextResponse.json(result)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[xvm-connect] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
