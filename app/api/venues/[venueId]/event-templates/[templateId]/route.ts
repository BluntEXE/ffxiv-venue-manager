import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]).optional(),
  timezone: z.string().optional(),
  durationMinutes: z.number().int().min(15).optional(),
})

// PATCH - Update an event template
export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; templateId: string }> }>(
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
      const { venueId: slugOrId, templateId } = await params

      // Look up venue by slug
      const venue = await prisma.venue.findUnique({
        where: { slug: slugOrId },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Check if user has permission (OWNER or MANAGER only)
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
        },
      })

      if (!membership || (membership.role !== "OWNER" && membership.role !== "MANAGER")) {
        return NextResponse.json(
          { error: "You don't have permission to update templates" },
          { status: 403 }
        )
      }

      // Verify template belongs to this venue
      const existingTemplate = await prisma.eventTemplate.findUnique({
        where: { id: templateId },
      })

      if (!existingTemplate || existingTemplate.venueId !== venue.id) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 })
      }

      const body = await request.json()
      const validatedData = updateTemplateSchema.parse(body)

      const template = await prisma.eventTemplate.update({
        where: { id: templateId },
        data: validatedData,
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

      return NextResponse.json(template)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error updating event template:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 20, window: "1 m" }
)

// DELETE - Delete an event template
export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; templateId: string }> }>(
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
      const { venueId: slugOrId, templateId } = await params

      // Look up venue by slug
      const venue = await prisma.venue.findUnique({
        where: { slug: slugOrId },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Check if user has permission (OWNER or MANAGER only)
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId: venue.id,
        },
      })

      if (!membership || (membership.role !== "OWNER" && membership.role !== "MANAGER")) {
        return NextResponse.json(
          { error: "You don't have permission to delete templates" },
          { status: 403 }
        )
      }

      // Verify template belongs to this venue
      const existingTemplate = await prisma.eventTemplate.findUnique({
        where: { id: templateId },
      })

      if (!existingTemplate || existingTemplate.venueId !== venue.id) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 })
      }

      await prisma.eventTemplate.delete({
        where: { id: templateId },
      })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error("Error deleting event template:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 5, window: "1 m" }
)
