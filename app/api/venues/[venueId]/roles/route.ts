import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const createRoleSchema = z.object({
  name: z.string().min(1, "Role name is required").max(50),
  responsibilities: z.string().optional(),
  color: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
})

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

    // Check if user has access to this venue
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: "You don't have access to this venue" },
        { status: 403 }
      )
    }

    // Get all custom roles for this venue
    const roles = await prisma.role.findMany({
      where: { venueId },
      include: {
        _count: {
          select: {
            memberships: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

      return NextResponse.json(roles)
    } catch (error) {
      console.error("Error fetching roles:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 60, window: "1 m" }
)

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

    // Check if user has permission to manage roles
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
      },
    })

    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json(
        { error: "You don't have permission to create roles" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createRoleSchema.parse(body)

    // Check if role name already exists for this venue
    const existingRole = await prisma.role.findFirst({
      where: {
        venueId,
        name: validatedData.name,
      },
    })

    if (existingRole) {
      return NextResponse.json(
        { error: "A role with this name already exists" },
        { status: 400 }
      )
    }

    const newRole = await prisma.role.create({
      data: {
        venueId,
        name: validatedData.name,
        responsibilities: validatedData.responsibilities,
        color: validatedData.color,
        permissions: validatedData.permissions || {},
      },
    })

      return NextResponse.json(newRole, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error creating role:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 10, window: "1 m" }
)
