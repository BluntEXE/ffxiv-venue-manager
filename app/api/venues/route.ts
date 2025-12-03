import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"

const venueSchema = z.object({
  name: validators.venueName,
  slug: validators.slug,
  description: validators.venueDescription,
  dataCenter: z.string().min(1, "Data center is required").max(50, "Data center name too long"),
  world: z.string().min(1, "World is required").max(50, "World name too long"),
  location: validators.venueLocation,
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
