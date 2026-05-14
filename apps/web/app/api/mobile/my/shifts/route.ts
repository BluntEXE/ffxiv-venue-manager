// GET /api/mobile/my/shifts
// Returns the authenticated user's upcoming shifts (next 7 days).
// Read-only — no mutations exposed. Plugin-first rule preserved.
import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const shifts = await prisma.shift.findMany({
    where: {
      membership: { userId },
      status: { not: "CANCELLED" },
      scheduledStart: { lte: in7Days },
      scheduledEnd: { gte: now },
    },
    select: {
      id: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      venue: {
        select: { id: true, name: true, dataCenter: true, world: true },
      },
    },
    orderBy: { scheduledStart: "asc" },
    take: 20,
  })

  return NextResponse.json(shifts)
}
