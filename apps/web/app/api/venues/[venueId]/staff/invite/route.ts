import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { ensureManagerRole } from "@/lib/api/venue-setup"
import { validators } from "@/lib/validation"

const inviteSchema = z.object({
  role: z.enum(["STAFF", "MANAGER", "OWNER"], { message: "Invalid role" }),
  roleId: z.string().min(1).optional().nullable(),
  invitedName: z.string().max(100, "Name too long (max 100 characters)").optional().nullable(),
  invitedEmail: validators.email.optional().nullable(),
})

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
    let role: "STAFF" | "MANAGER" | "OWNER", roleId: string | null | undefined, invitedName: string | null | undefined, invitedEmail: string | null | undefined
    try {
      const parsed = inviteSchema.parse(body)
      role = parsed.role
      roleId = parsed.roleId
      invitedName = parsed.invitedName
      invitedEmail = parsed.invitedEmail
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      throw error
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

    // Only owners can invite other owners
    if (role === "OWNER" && membership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only owners can invite other owners" },
        { status: 403 }
      )
    }

    // If the invited tier is OWNER or MANAGER and the caller didn't pass
    // a specific roleId, default to the venue's Manager custom role so
    // the new member lands with a non-null customRole (matching our
    // invariant: every OWNER/MANAGER-tier membership has a customRole
    // that the plugin's strict role-filter can return).
    let effectiveRoleId: string | null = roleId || null
    if (!effectiveRoleId && (role === "OWNER" || role === "MANAGER")) {
      const managerRole = await ensureManagerRole(venue.id)
      effectiveRoleId = managerRole.id
    }

    // Generate cryptographically secure invite token (URL-safe)
    const inviteToken = crypto.randomBytes(32).toString("base64url")

    // Set expiration to 7 days from now
    const inviteExpiresAt = new Date()
    inviteExpiresAt.setDate(inviteExpiresAt.getDate() + 7)

    // Create pending membership with invite
    const pendingMembership = await prisma.membership.create({
      data: {
        venueId: venue.id,
        role: role,
        roleId: effectiveRoleId,
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
