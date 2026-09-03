import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { postTonightList } from "@/lib/discord-feed"
import { getPublicVenuesForIds, type PublicVenue } from "@/lib/api/xvm-api"

export async function GET(request: Request) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      venueType: { not: "TEST_VENUE" },
      events: {
        some: {
          status: { in: ["PUBLISHED", "ACTIVE"] },
          startTime: { gte: startOfDay, lte: endOfDay },
        },
      },
    },
    select: {
      slug: true,
      dataCenter: true,
      world: true,
      xvmApiVenueId: true,
      events: {
        where: {
          status: { in: ["PUBLISHED", "ACTIVE"] },
          startTime: { gte: startOfDay, lte: endOfDay },
        },
        select: { startTime: true, endTime: true },
        orderBy: { startTime: "asc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  })

  if (venues.length === 0) {
    console.log("[tonight-post] No venues open tonight, skipping")
    return NextResponse.json({ success: true, posted: false, venues: 0 })
  }

  const xvmVenueIds = venues.map((v) => v.xvmApiVenueId).filter((id): id is string => id !== null)
  const profileByVenue: Record<string, PublicVenue> =
    xvmVenueIds.length > 0 ? await getPublicVenuesForIds(xvmVenueIds) : {}

  const payload = venues.map((v) => {
    const xvmProfile = v.xvmApiVenueId ? profileByVenue[v.xvmApiVenueId] : undefined
    return {
      name: xvmProfile?.name ?? v.slug,
      slug: v.slug,
      dataCenter: v.dataCenter,
      world: v.world,
      district: xvmProfile?.district ?? null,
      ward: xvmProfile?.ward ?? null,
      plot: xvmProfile?.plot ?? null,
      scheduledStart: v.events[0].startTime,
      scheduledEnd: v.events[0].endTime,
    }
  })

  postTonightList(payload)

  console.log(`[tonight-post] Posted ${venues.length} venues`)
  return NextResponse.json({ success: true, posted: true, venues: venues.length })
}
