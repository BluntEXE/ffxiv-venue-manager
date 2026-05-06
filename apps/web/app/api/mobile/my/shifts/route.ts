// GET /api/mobile/my/shifts
// Returns the authenticated user's upcoming shifts (next 7 days).
// Read-only — no mutations exposed. Plugin-first rule preserved.
import { NextResponse } from "next/server"
import { verifyMobileJwt } from "@/lib/auth/mobile-auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let userId: string
  try {
    const payload = await verifyMobileJwt(auth)
    userId = payload.sub
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
