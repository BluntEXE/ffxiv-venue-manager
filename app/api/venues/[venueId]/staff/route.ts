import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

// Old email-based invitation system has been replaced
// Use POST /api/venues/[venueId]/staff/invite instead

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { params } = context
      const { venueId } = await params

      // Look up venue by slug or ID
      const venue = await prisma.venue.findFirst({
        where: {
          OR: [
            { id: venueId },
            { slug: venueId }
          ]
        },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Check if user has access to this venue
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
        },
      })

      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to this venue" },
          { status: 403 }
        )
      }

      // Get all staff members (active with user accounts)
      const staff = await prisma.membership.findMany({
        where: {
          venueId: venue.id,
          status: "active", // Only active members
          userId: { not: null }, // Only members with linked Discord accounts
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              discordId: true,
              displayName: true,
            },
          },
          customRole: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      })

      return NextResponse.json(staff)
    } catch (error) {
      console.error("Error fetching staff:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 60, window: "1 m" }
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  // This endpoint has been deprecated in favor of the invite link system
  // Use POST /api/venues/[venueId]/staff/invite instead
  return NextResponse.json(
    {
      error: "This endpoint is deprecated. Use POST /api/venues/[venueId]/staff/invite to generate invite links.",
      migration: "The venue manager now uses Discord-only authentication with unique invite links. Email-based invitations are no longer supported."
    },
    { status: 410 } // 410 Gone
  )
}
