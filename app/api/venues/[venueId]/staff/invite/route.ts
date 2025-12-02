import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { nanoid } from "nanoid"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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
    const body = await request.json()
    const { role, roleId, invitedName, invitedEmail } = body

    // Validate role
    if (!["STAFF", "MANAGER"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    // Get venue and verify permissions
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: {
        memberships: {
          where: { userId: session.user.id },
        },
      },
    })

    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 })
    }

    const membership = venue.memberships[0]
    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json(
        { error: "You don't have permission to invite staff" },
        { status: 403 }
      )
    }

    // Generate unique invite token (URL-safe)
    const inviteToken = nanoid(32)

    // Set expiration to 7 days from now
    const inviteExpiresAt = new Date()
    inviteExpiresAt.setDate(inviteExpiresAt.getDate() + 7)

    // Create pending membership with invite
    const pendingMembership = await prisma.membership.create({
      data: {
        venueId: venue.id,
        role: role,
        roleId: roleId || null,
        status: "pending",
        inviteToken,
        inviteExpiresAt,
        invitedBy: session.user.id,
        invitedName: invitedName || null,
        invitedEmail: invitedEmail || null,
      },
    })

    // Generate invite URL
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`
    const inviteUrl = `${baseUrl}/invite/${inviteToken}`

      return NextResponse.json({
        success: true,
        invite: {
          id: pendingMembership.id,
          inviteUrl,
          inviteToken,
          expiresAt: inviteExpiresAt,
          role,
          invitedName,
        },
      })
    } catch (error) {
      console.error("Error creating staff invite:", error)
      return NextResponse.json(
        { error: "Failed to create invite" },
        { status: 500 }
      )
    }
  },
  { requests: 10, window: "1 m" }
)
