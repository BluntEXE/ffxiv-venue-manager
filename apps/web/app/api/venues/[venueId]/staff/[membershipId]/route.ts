import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const updateStaffSchema = z.object({
  role: z.enum(["OWNER", "MANAGER", "STAFF"]).optional(),
  roleId: z.string().nullable().optional(),
  status: z.string().optional(),
  invitedName: z.string().nullable().optional(),
  invitedEmail: z.string().nullable().optional(),
  temporaryRole: z.enum(["OWNER", "MANAGER", "STAFF"]).nullable().optional(),
  temporaryRoleExpiresAt: z.string().nullable().optional(),
  permanentRole: z.enum(["OWNER", "MANAGER", "STAFF"]).nullable().optional(),
})

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string }> }>(
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
      const { venueId, membershipId } = await params

    // Check permissions
    const userMembership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        status: "active",
      },
    })

    if (!userMembership || !["OWNER", "MANAGER"].includes(userMembership.role)) {
      return NextResponse.json(
        { error: "You don't have permission to update staff" },
        { status: 403 }
      )
    }

    // Get the membership being updated
    const targetMembership = await prisma.membership.findFirst({
      where: { id: membershipId, venueId },
    })

    if (!targetMembership) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    // Managers cannot modify owners
    if (userMembership.role === "MANAGER" && targetMembership.role === "OWNER") {
      return NextResponse.json(
        { error: "Managers cannot modify owners" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = updateStaffSchema.parse(body)

    // Only OWNERs can grant or change role to OWNER
    if (userMembership.role !== "OWNER") {
      if (validatedData.role === "OWNER") {
        return NextResponse.json(
          { error: "Only owners can promote members to owner" },
          { status: 403 }
        )
      }
      if (validatedData.temporaryRole === "OWNER") {
        return NextResponse.json(
          { error: "Only owners can grant temporary owner role" },
          { status: 403 }
        )
      }
      if (validatedData.permanentRole === "OWNER") {
        return NextResponse.json(
          { error: "Only owners can set permanent owner role" },
          { status: 403 }
        )
      }
    }

    // Prepare update data, converting date strings to Date objects
    const updateData: any = {}
    if (validatedData.role !== undefined) updateData.role = validatedData.role
    if (validatedData.roleId !== undefined) updateData.roleId = validatedData.roleId
    if (validatedData.status !== undefined) updateData.status = validatedData.status
    if (validatedData.invitedName !== undefined) updateData.invitedName = validatedData.invitedName
    if (validatedData.invitedEmail !== undefined) updateData.invitedEmail = validatedData.invitedEmail
    if (validatedData.temporaryRole !== undefined) updateData.temporaryRole = validatedData.temporaryRole
    if (validatedData.temporaryRoleExpiresAt !== undefined) {
      updateData.temporaryRoleExpiresAt = validatedData.temporaryRoleExpiresAt
        ? new Date(validatedData.temporaryRoleExpiresAt)
        : null
    }
    if (validatedData.permanentRole !== undefined) updateData.permanentRole = validatedData.permanentRole

    const updatedMembership = await prisma.membership.update({
      where: { id: membershipId, venueId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        customRole: true,
      },
    })

      return NextResponse.json(updatedMembership)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error updating staff:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string }> }>(
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
      const { venueId, membershipId } = await params

    // Check permissions
    const userMembership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
        status: "active",
      },
    })

    if (!userMembership || userMembership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only owners can remove staff" },
        { status: 403 }
      )
    }

    // Get the membership being deleted
    const targetMembership = await prisma.membership.findFirst({
      where: { id: membershipId, venueId },
    })

    if (!targetMembership) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    // Cannot remove the venue owner
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
    })

    if (venue?.ownerId === targetMembership.userId) {
      return NextResponse.json(
        { error: "Cannot remove the venue owner" },
        { status: 400 }
      )
    }

    // Use transaction with row-level locking to prevent race condition
    // when deleting owners (ensures at least 1 owner remains)
    if (targetMembership.role === "OWNER") {
      try {
        await prisma.$transaction(async (tx) => {
          const owners = await tx.membership.findMany({
            where: {
              venueId,
              role: "OWNER",
              status: "active",
            },
            select: { id: true },
          })

          if (owners.length <= 1) {
            throw new Error("LAST_OWNER")
          }

          await tx.membership.delete({
            where: { id: membershipId, venueId },
          })
        }, {
          isolationLevel: "Serializable",
          timeout: 5000,
        })
      } catch (txError: any) {
        if (txError.message === "LAST_OWNER") {
          return NextResponse.json(
            { error: "Cannot remove the last owner. Promote another member to owner first." },
            { status: 400 }
          )
        }
        throw txError
      }
    } else {
      await prisma.membership.delete({
        where: { id: membershipId, venueId },
      })
    }

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error("Error removing staff:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 5, window: "1 m" }
)
