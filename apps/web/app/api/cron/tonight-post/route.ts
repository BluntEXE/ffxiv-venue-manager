import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { postTonightList } from "@/lib/discord-feed"

export async function GET(request: Request) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      venueType: { not: "TEST_VENUE" },
      shifts: {
        some: {
          status: "SCHEDULED",
          scheduledStart: { lte: endOfDay },
          scheduledEnd: { gte: now },
        },
      },
    },
    select: {
      name: true,
      slug: true,
      dataCenter: true,
      world: true,
      district: true,
      ward: true,
      plot: true,
      shifts: {
        where: {
          status: "SCHEDULED",
          scheduledStart: { lte: endOfDay },
          scheduledEnd: { gte: now },
        },
        select: { scheduledStart: true, scheduledEnd: true },
        orderBy: { scheduledStart: "asc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  })

  if (venues.length === 0) {
    console.log("[tonight-post] No venues open tonight, skipping")
    return NextResponse.json({ success: true, posted: false, venues: 0 })
  }

  const payload = venues.map((v) => ({
    name: v.name,
    slug: v.slug,
    dataCenter: v.dataCenter,
    world: v.world,
    district: v.district,
    ward: v.ward,
    plot: v.plot,
    scheduledStart: v.shifts[0].scheduledStart,
    scheduledEnd: v.shifts[0].scheduledEnd,
  }))

  postTonightList(payload)

  console.log(`[tonight-post] Posted ${venues.length} venues`)
  return NextResponse.json({ success: true, posted: true, venues: venues.length })
}
