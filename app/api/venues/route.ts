import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const venueSchema = z.object({
  name: z.string().min(1, "Venue name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  description: z.string().optional(),
  dataCenter: z.string().min(1, "Data center is required"),
  world: z.string().min(1, "World is required"),
  location: z.string().optional(),
})

export const POST = withRateLimit(
  async (request: NextRequest) => {
    try {
      // Check authentication
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        )
      }

      // Parse and validate request body
      const body = await request.json()
      const validatedData = venueSchema.parse(body)

      // Check if slug already exists
      const existingVenue = await prisma.venue.findUnique({
        where: { slug: validatedData.slug },
      })

      if (existingVenue) {
        return NextResponse.json(
          { error: "A venue with this slug already exists" },
          { status: 400 }
        )
      }

      // Create venue with owner membership
      const venue = await prisma.venue.create({
        data: {
          name: validatedData.name,
          slug: validatedData.slug,
          description: validatedData.description,
          dataCenter: validatedData.dataCenter,
          world: validatedData.world,
          location: validatedData.location,
          ownerId: session.user.id,
          memberships: {
            create: {
              userId: session.user.id,
              role: "OWNER",
              status: "active", // Owner is automatically active, no invite needed
            },
          },
        },
        include: {
          memberships: true,
        },
      })

      return NextResponse.json(venue, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error creating venue:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 10, window: "1 m" }
)

export const GET = withRateLimit(
  async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        )
      }

      // Get all venues for the current user
      const venues = await prisma.venue.findMany({
        where: {
          memberships: {
            some: {
              userId: session.user.id,
            },
          },
        },
        include: {
          memberships: {
            where: {
              userId: session.user.id,
            },
          },
        },
      })

      return NextResponse.json(venues)
    } catch (error) {
      console.error("Error fetching venues:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 60, window: "1 m" }
)
