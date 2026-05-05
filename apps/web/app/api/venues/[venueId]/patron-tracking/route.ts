import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const logPatronSchema = z.object({
  action: z.enum(["ENTER", "EXIT"]),
  eventId: z.string().optional(),
})

// GET - Get patron count and recent logs
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
      const { searchParams } = new URL(request.url)
      const eventId = searchParams.get("eventId")

      // Check permissions
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
        status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to this venue" },
          { status: 403 }
        )
      }

      // Get patron logs
      const where = eventId ? { venueId, eventId } : { venueId }

      const logs = await prisma.patronLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: 50, // Last 50 entries
        include: {
          staff: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      // Calculate current count
      const allLogs = await prisma.patronLog.findMany({
        where,
        select: { countChange: true },
      })

      const currentCount = allLogs.reduce((sum, log) => sum + (log.countChange ?? 0), 0)

      return NextResponse.json({
        currentCount: Math.max(0, currentCount), // Never negative
        logs,
      })
    } catch (error) {
      console.error("Error fetching patron tracking data:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)

// POST - Log patron entry or exit
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

      // Check permissions (STAFF and above can log patrons)
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
        status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to this venue" },
          { status: 403 }
        )
      }

      const body = await request.json()
      const validatedData = logPatronSchema.parse(body)

      // Validate the eventId before attribution. The dashboard sends the
      // pages eventId on every click, including future/draft events; we
      // only attribute the log if the event is currently within its
      // active window. Otherwise the log is venue-scoped (eventId null).
      let attributedEventId: string | null = null
      if (validatedData.eventId) {
        const now = new Date()
        const activeEvent = await prisma.event.findFirst({
          where: {
            id: validatedData.eventId,
            venueId,
            startTime: { lte: now },
            endTime: { gte: now },
            status: { in: ["PUBLISHED", "ACTIVE"] },
          },
          select: { id: true },
        })
        if (activeEvent) attributedEventId = activeEvent.id
      }

      // Create patron log entry
      const patronLog = await prisma.patronLog.create({
        data: {
          venueId,
          eventId: attributedEventId,
          action: validatedData.action,
          countChange: validatedData.action === "ENTER" ? 1 : -1,
          loggedBy: session.user.id,
        },
        include: {
          staff: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      // Calculate new current count
      const where = validatedData.eventId
        ? { venueId, eventId: validatedData.eventId }
        : { venueId }

      const allLogs = await prisma.patronLog.findMany({
        where,
        select: { countChange: true },
      })

      const currentCount = allLogs.reduce((sum, log) => sum + (log.countChange ?? 0), 0)

      return NextResponse.json({
        log: patronLog,
        currentCount: Math.max(0, currentCount),
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }

      console.error("Error logging patron:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" } // Allow frequent logging
)
