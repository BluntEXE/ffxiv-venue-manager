import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { Prisma } from "@/generated/prisma/client"

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

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

      const { venueId } = await context.params

      const venue = await prisma.venue.findUnique({ where: { id: venueId } })
      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      const membership = await prisma.membership.findFirst({
        where: { userId: session.user.id, venueId: venue.id, status: "active" },
      })
      if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
        return NextResponse.json({ error: "Owner or Manager role required" }, { status: 403 })
      }

      const body = await request.json()
      const { name } = createRoomSchema.parse(body)

      const existing = await prisma.room.findFirst({
        where: { venueId: venue.id, name },
      })
      if (existing) {
        return NextResponse.json({ error: "A room with this name already exists" }, { status: 409 })
      }

      const room = await prisma.room.create({
        data: { venueId: venue.id, name },
      })

      return NextResponse.json({ id: room.id, name: room.name, isOccupied: room.isOccupied, note: room.note })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ error: "A room with this name already exists" }, { status: 409 })
      }
      console.error("[rooms] error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)
