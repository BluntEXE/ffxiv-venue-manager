// GET /api/mobile/my/open-shifts
// Returns OPEN shifts at venues where the user is an active member.
// Ordered by scheduledStart ascending. Limited to 20.
// Read-only — no mutations exposed. Plugin-first rule preserved.
import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const now = new Date()

  const shifts = await prisma.shift.findMany({
    where: {
      status: "OPEN",
      scheduledStart: { gte: now },
      venue: {
        memberships: {
          some: { userId, status: "active" },
        },
      },
    },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      venue: { select: { id: true, name: true } },
      role: { select: { name: true } },
    },
    orderBy: { scheduledStart: "asc" },
    take: 20,
  })

  return NextResponse.json(
    shifts.map((s) => ({
      id: s.id,
      venueId: s.venue.id,
      venueName: s.venue.name,
      scheduledStart: s.scheduledStart.toISOString(),
      scheduledEnd: s.scheduledEnd.toISOString(),
      roleName: s.role?.name ?? null,
    }))
  )
}
