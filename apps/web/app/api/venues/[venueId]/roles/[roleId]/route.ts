import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"

const updateRoleSchema = z.object({
  name: validators.roleName.optional(),
  responsibilities: validators.roleDescription,
  color: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  hourlyRate: z.number().positive().nullable().optional(),
  potPayoutMode: z.enum(["STANDARD", "POT", "CONTRACTOR"]).optional(),
  contractorSharesPot: z.boolean().optional(),
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string; roleId: string }> }>(
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
      const { venueId, roleId } = await params

      // Check permissions
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 })
      }

      const role = await prisma.role.findUnique({
        where: { id: roleId, venueId },
        include: {
          _count: {
            select: {
              memberships: true,
              additionalFor: true,
            },
          },
        },
      })

      if (!role) {
        return NextResponse.json({ error: "Role not found" }, { status: 404 })
      }

      return NextResponse.json({
        ...role,
        _count: { memberships: role._count.memberships + role._count.additionalFor },
      })
    } catch (error) {
      console.error("Error fetching role:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; roleId: string }> }>(
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
      const { venueId, roleId } = await params

      // Check permissions
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
        return NextResponse.json({ error: "You don't have permission to update roles" }, { status: 403 })
      }

      // Check if role exists
      const existingRole = await prisma.role.findUnique({
        where: { id: roleId, venueId },
      })

      if (!existingRole) {
        return NextResponse.json({ error: "Role not found" }, { status: 404 })
      }

      const body = await request.json()
      const validatedData = updateRoleSchema.parse(body)

      // If updating name, check for duplicates
      if (validatedData.name && validatedData.name !== existingRole.name) {
        const duplicateRole = await prisma.role.findFirst({
          where: {
            venueId,
            name: validatedData.name,
            id: { not: roleId },
          },
        })

        if (duplicateRole) {
          return NextResponse.json({ error: "A role with this name already exists" }, { status: 400 })
        }
      }

      const updatedRole = await prisma.role.update({
        where: { id: roleId, venueId },
        data: validatedData,
        include: {
          _count: {
            select: {
              memberships: true,
              additionalFor: true,
            },
          },
        },
      })

      return NextResponse.json({
        ...updatedRole,
        _count: { memberships: updatedRole._count.memberships + updatedRole._count.additionalFor },
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }

      console.error("Error updating role:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; roleId: string }> }>(
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
      const { venueId, roleId } = await params

      // Check permissions
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership || membership.role !== "OWNER") {
        return NextResponse.json({ error: "Only owners can delete roles" }, { status: 403 })
      }

      // Check if role exists
      const role = await prisma.role.findUnique({
        where: { id: roleId, venueId },
        include: {
          _count: {
            select: {
              memberships: true,
              additionalFor: true,
            },
          },
        },
      })

      if (!role) {
        return NextResponse.json({ error: "Role not found" }, { status: 404 })
      }

      // Check if role is assigned to any staff members, as their primary role or a sub-role
      const assignedCount = role._count.memberships + role._count.additionalFor
      if (assignedCount > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete role. It is assigned to ${assignedCount} staff member(s)`,
          },
          { status: 400 }
        )
      }

      await prisma.role.delete({
        where: { id: roleId, venueId },
      })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error("Error deleting role:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 5, window: "1 m" }
)
