import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"

export const PATCH = withRateLimit(
  async (
    request: NextRequest,
    context?: { params: Promise<{ venueId: string }> }
  ) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      if (!context?.params) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 })
      }
      const { venueId } = await context.params
      const body = await request.json()

      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        include: { memberships: { where: { userId: session.user.id } } },
      })
      if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      if (!venue.memberships.length || !["OWNER", "MANAGER"].includes(venue.memberships[0].role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      const { name, description, location, bannerUrl } = body
      const updated = await prisma.venue.update({
        where: { id: venueId },
        data: {
          ...(name !== undefined && { name: String(name).trim() }),
          ...(description !== undefined && { description: description ? String(description).trim() : null }),
          ...(location !== undefined && { location: location ? String(location).trim() : null }),
          ...(bannerUrl !== undefined && { bannerUrl: bannerUrl ? String(bannerUrl) : null }),
        },
      })

      await Promise.all([
        invalidateCache(cacheKeys.venue(venueId)),
        invalidateCache(cacheKeys.venueBySlug(venue.slug)),
        invalidateCache(cacheKeys.userVenues(session.user.id)),
      ])

      return NextResponse.json(updated)
    } catch (error) {
      console.error("Error updating venue:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)

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
  {
    requests: 3,
    window: "1 m",
    getIdentifier: async (req) => {
      const session = await getServerSession(authOptions)
      const userId = session?.user?.id
      if (userId) return `user:${userId}:DELETE:${req.nextUrl.pathname}`
      return `ip:${req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "anonymous"}:DELETE:${req.nextUrl.pathname}`
    },
  }
)
