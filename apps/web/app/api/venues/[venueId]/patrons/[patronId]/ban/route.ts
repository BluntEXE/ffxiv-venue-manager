import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const setBanSchema = z
  .object({
    isBanned: z.boolean(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((d) => !d.isBanned || !!d.reason, {
    message: "reason is required when banning a patron",
    path: ["reason"],
  })

export const PATCH = withRateLimit<{
  params: Promise<{ venueId: string; patronId: string }>
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

      const { venueId, patronId } = await context.params

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
      const { isBanned, reason } = setBanSchema.parse(body)

      const patron = await prisma.patron.findFirst({
        where: { id: patronId, venueId: venue.id },
        select: { id: true },
      })
      if (!patron) {
        return NextResponse.json({ error: "Patron not found in this venue" }, { status: 404 })
      }

      const updated = await prisma.patron.update({
        where: { id: patronId },
        data: isBanned
          ? {
              isBanned: true,
              banReason: reason,
              bannedAt: new Date(),
              bannedById: session.user.id,
            }
          : {
              isBanned: false,
            },
      })

      return NextResponse.json({ id: updated.id, isBanned: updated.isBanned })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      console.error("[patrons/ban] error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)
