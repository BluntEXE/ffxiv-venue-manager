import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"

const updateServiceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  price: z.number().min(0).optional(),
  roleIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
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
      const { venueId, serviceId } = await params

    // Check permissions
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

    const service = await prisma.service.findUnique({
      where: { id: serviceId, venueId },
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
    })

    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 })
    }

      return NextResponse.json(service)
    } catch (error) {
      console.error("Error fetching service:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
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
      const { venueId, serviceId } = await params

    // Check permissions
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
      },
    })

    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json(
        { error: "You don't have permission to update services" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { roleIds, ...validatedData } = updateServiceSchema.parse(body)

    const updatedService = await prisma.service.update({
      where: { id: serviceId, venueId },
      data: {
        ...validatedData,
        roles: roleIds ? {
          set: roleIds.map(id => ({ id })),
        } : undefined,
      },
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
    })

    // Invalidate services cache
    await invalidateCache(cacheKeys.venueServices(venueId))

      return NextResponse.json(updatedService)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error updating service:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
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
      const { venueId, serviceId } = await params

    // Check permissions
    const membership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId,
      },
    })

    if (!membership || membership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only owners can delete services" },
        { status: 403 }
      )
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId, venueId },
    })

    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 })
    }

    await prisma.service.delete({
      where: { id: serviceId, venueId },
    })

    // Invalidate services cache
    await invalidateCache(cacheKeys.venueServices(venueId))

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error("Error deleting service:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 5, window: "1 m" }
)
