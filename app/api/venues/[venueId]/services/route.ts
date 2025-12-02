import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const createServiceSchema = z.object({
  name: z.string().min(1, "Service name is required").max(100),
  description: z.string().optional(),
  price: z.number().min(0, "Price must be positive"),
  roleIds: z.array(z.string()).optional().default([]),
  isActive: z.boolean().default(true),
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

    // Get all services for this venue
    const services = await prisma.service.findMany({
      where: { venueId },
      include: {
        roles: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        _count: {
          select: {
            transactions: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

      return NextResponse.json(services)
    } catch (error) {
      console.error("Error fetching services:", error)
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

    // Check if user has permission to manage services
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
      },
    })

    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json(
        { error: "You don't have permission to create services" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createServiceSchema.parse(body)

    const newService = await prisma.service.create({
      data: {
        venueId,
        name: validatedData.name,
        description: validatedData.description,
        price: validatedData.price,
        isActive: validatedData.isActive,
        roles: {
          connect: validatedData.roleIds.map(id => ({ id })),
        },
      },
      include: {
        roles: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    })

      return NextResponse.json(newService, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error creating service:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 10, window: "1 m" }
)
