import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const bulkReclassifySchema = z
  .object({
    logIds: z.array(z.string().min(1)).min(1).max(500),
    wasWorking: z.boolean(),
    workingUserId: z.string().nullable(),
    reason: z.string().max(500).optional(),
  })
  .refine((d) => !d.wasWorking || !!d.workingUserId, {
    message: "workingUserId is required when wasWorking is true",
    path: ["workingUserId"],
  })

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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
        return NextResponse.json(
          { error: "Owner or Manager role required" },
          { status: 403 }
        )
      }

      const body = await request.json()
      const { logIds, wasWorking, workingUserId, reason } =
        bulkReclassifySchema.parse(body)

      // If assigning to a user, ensure that user is a member of this venue.
      if (wasWorking && workingUserId) {
        const targetMembership = await prisma.membership.findFirst({
          where: { userId: workingUserId, venueId: venue.id, status: "active" },
        })
        if (!targetMembership) {
          return NextResponse.json(
            { error: "Target user is not an active member of this venue" },
            { status: 400 }
          )
        }
      }

      // Verify every log belongs to this venue (prevents cross-venue tampering).
      const logs = await prisma.patronLog.findMany({
        where: { id: { in: logIds }, venueId: venue.id },
        select: { id: true },
      })
      if (logs.length !== logIds.length) {
        return NextResponse.json(
          {
            error: "Some logs were not found in this venue",
            found: logs.length,
            requested: logIds.length,
          },
          { status: 400 }
        )
      }

      const result = await prisma.patronLog.updateMany({
        where: { id: { in: logIds }, venueId: venue.id },
        data: {
          wasWorking,
          workingUserId: wasWorking ? workingUserId : null,
          reclassifiedAt: new Date(),
          reclassifiedById: session.user.id,
          reclassifyReason: reason ?? null,
        },
      })

      return NextResponse.json({ updated: result.count })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Invalid request", details: err.flatten() },
          { status: 400 }
        )
      }
      console.error("[bulk-reclassify] error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)
