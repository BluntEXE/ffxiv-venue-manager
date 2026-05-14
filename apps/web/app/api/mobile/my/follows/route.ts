// GET /api/mobile/my/follows — list followed venues with current open status
import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const now = new Date()

  const follows = await prisma.venueFollow.findMany({
    where: { userId },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          dataCenter: true,
          world: true,
          logoUrl: true,
          shifts: {
            where: {
              status: "ACTIVE",
              scheduledStart: { lte: now },
              scheduledEnd: { gte: now },
            },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(
    follows.map((f) => ({
      venueId: f.venueId,
      venueName: f.venue.name,
      dataCenter: f.venue.dataCenter,
      world: f.venue.world,
      logoUrl: f.venue.logoUrl,
      isOpenNow: f.venue.shifts.length > 0,
      followedAt: f.createdAt,
    }))
  )
}
