import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const renameRoomSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  roomNumber: z.number().int().min(0).max(999).nullable().optional(),
})

async function requireManager(session: { user?: { id?: string } } | null, venueId: string) {
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const venue = await prisma.venue.findUnique({ where: { id: venueId } })
  if (!venue) {
    return { error: NextResponse.json({ error: "Venue not found" }, { status: 404 }) }
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, venueId: venue.id, status: "active" },
  })
  if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
    return { error: NextResponse.json({ error: "Owner or Manager role required" }, { status: 403 }) }
  }
  return { venue }
}

export const PATCH = withRateLimit<{
  params: Promise<{ venueId: string; roomId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      const { venueId, roomId } = await context.params

      const gate = await requireManager(session, venueId)
      if (gate.error) return gate.error

      const body = await request.json()
      const parsed = renameRoomSchema.parse(body)

      const room = await prisma.room.findFirst({
        where: { id: roomId, venueId: gate.venue!.id },
        select: { id: true },
      })
      if (!room) {
        return NextResponse.json({ error: "Room not found in this venue" }, { status: 404 })
      }

      const data: { name?: string; roomNumber?: number | null } = {}
      if (parsed.name !== undefined) data.name = parsed.name
      if (parsed.roomNumber !== undefined) data.roomNumber = parsed.roomNumber

      const updated = await prisma.room.update({
        where: { id: roomId },
        data,
      })

      return NextResponse.json({ id: updated.id, name: updated.name, roomNumber: updated.roomNumber })
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "A room with this name already exists" }, { status: 409 })
      }
      console.error("[rooms/:id] PATCH error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{
  params: Promise<{ venueId: string; roomId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      const { venueId, roomId } = await context.params

      const gate = await requireManager(session, venueId)
      if (gate.error) return gate.error

      const room = await prisma.room.findFirst({
        where: { id: roomId, venueId: gate.venue!.id },
        select: { id: true },
      })
      if (!room) {
        return NextResponse.json({ error: "Room not found in this venue" }, { status: 404 })
      }

      await prisma.room.delete({ where: { id: roomId } })

      return NextResponse.json({ success: true })
    } catch (err) {
      console.error("[rooms/:id] DELETE error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)
