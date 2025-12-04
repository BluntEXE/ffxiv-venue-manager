import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  title: z.string().min(1, "Event title is required"),
  description: z.string().optional(),
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]),
  timezone: z.string().default("UTC"),
  defaultStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format. Use HH:MM").default("19:00"),
  defaultEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format. Use HH:MM").default("22:00"),
})

// GET - List all event templates for a venue
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
      const { venueId: slugOrId } = await params

      // Look up venue by slug
      const venue = await prisma.venue.findUnique({
        where: { slug: slugOrId },
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

      // Get all templates for this venue
      const templates = await prisma.eventTemplate.findMany({
        where: {
          venueId: venue.id,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      })

      return NextResponse.json(templates)
    } catch (error) {
      console.error("Error fetching event templates:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 60, window: "1 m" }
)

// POST - Create a new event template
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
      const { venueId: slugOrId } = await params

      // Look up venue by slug
      const venue = await prisma.venue.findUnique({
        where: { slug: slugOrId },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Check if user has access to this venue (OWNER or MANAGER only)
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
        },
      })

      if (!membership || (membership.role !== "OWNER" && membership.role !== "MANAGER")) {
        return NextResponse.json(
          { error: "You don't have permission to create templates" },
          { status: 403 }
        )
      }

      const body = await request.json()
      const validatedData = createTemplateSchema.parse(body)

      const template = await prisma.eventTemplate.create({
        data: {
          venueId: venue.id,
          name: validatedData.name,
          title: validatedData.title,
          description: validatedData.description,
          eventType: validatedData.eventType,
          timezone: validatedData.timezone,
          defaultStartTime: validatedData.defaultStartTime,
          defaultEndTime: validatedData.defaultEndTime,
          createdById: session.user.id,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
      })

      return NextResponse.json(template, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error creating event template:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 10, window: "1 m" }
)
