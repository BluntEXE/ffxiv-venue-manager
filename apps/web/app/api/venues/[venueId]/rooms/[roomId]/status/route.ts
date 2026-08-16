import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { venueEventBus } from "@/lib/sse/venue-events"

const setStatusSchema = z.object({
  isOccupied: z.boolean(),
  note: z.string().trim().max(200).optional(),
})

export const PATCH = withRateLimit<{
  params: Promise<{ venueId: string; roomId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { venueId, roomId } = await context.params

      const venue = await prisma.venue.findUnique({ where: { id: venueId } })
      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Any active member can toggle room status — matches how patron-visit
      // logging and the transactions POST route already work (no OWNER/MANAGER
      // gate), unlike VIP/ban which are moderation actions.
      const membership = await prisma.membership.findFirst({
        where: { userId: session.user.id, venueId: venue.id, status: "active" },
      })
      if (!membership) {
        return NextResponse.json({ error: "Not an active member of this venue" }, { status: 403 })
      }

      const body = await request.json()
      const { isOccupied, note } = setStatusSchema.parse(body)

      const room = await prisma.room.findFirst({
        where: { id: roomId, venueId: venue.id },
      })
      if (!room) {
        return NextResponse.json({ error: "Room not found in this venue" }, { status: 404 })
      }

      const updated = await prisma.room.update({
        where: { id: roomId },
        data: {
          isOccupied,
          note: note !== undefined ? note || null : room.note,
          updatedById: session.user.id,
        },
        include: { updatedBy: { select: { name: true } } },
      })

      venueEventBus.emit(venue.id, {
        id: `room-${updated.id}-${updated.updatedAt.getTime()}`,
        type: "room_status",
        venueId: venue.id,
        timestamp: updated.updatedAt.toISOString(),
        data: {
          roomId: updated.id,
          name: updated.name,
          isOccupied: updated.isOccupied,
          note: updated.note,
          updatedByName: updated.updatedBy?.name ?? null,
        },
      })

      return NextResponse.json({ id: updated.id, isOccupied: updated.isOccupied, note: updated.note })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      console.error("[rooms/:id/status] error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)
