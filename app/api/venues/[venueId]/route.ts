import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"

export const DELETE = withRateLimit(
  async (
    request: NextRequest,
    context?: { params: Promise<{ venueId: string }> }
  ) => {
    try {
      // Check authentication
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      if (!context?.params) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 })
      }

      const { venueId } = await context.params

      // Check if venue exists and user is the owner
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        include: {
          memberships: {
            where: {
              userId: session.user.id,
            },
          },
        },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Only owners can delete venues
      if (venue.memberships.length === 0 || venue.memberships[0].role !== "OWNER") {
        return NextResponse.json(
          { error: "Only venue owners can delete venues" },
          { status: 403 }
        )
      }

      // Delete venue (cascade will handle related records)
      await prisma.venue.delete({
        where: { id: venueId },
      })

      // Invalidate all related caches
      await Promise.all([
        invalidateCache(cacheKeys.userVenues(session.user.id)),
        invalidateCache(cacheKeys.venue(venueId)),
        invalidateCache(cacheKeys.venueBySlug(venue.slug)),
        invalidateCache(`venue:${venueId}:*`), // All venue-related caches
      ])

      return NextResponse.json(
        { message: "Venue deleted successfully" },
        { status: 200 }
      )
    } catch (error) {
      console.error("Error deleting venue:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 3, window: "1 m" } // Very strict rate limit for deletion
)
