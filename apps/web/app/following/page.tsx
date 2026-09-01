import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Following",
  description: "Venues you follow across the realm.",
}
import { prisma } from "@/lib/prisma"
import { FollowingClient } from "@/components/following-client"
import { ExploreLayout } from "@/components/explore-layout"
import { getPublicHoursForVenues, type PublicHours } from "@/lib/api/xvm-api"

export const dynamic = "force-dynamic"

export default async function FollowingPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const follows = await prisma.venueFollow.findMany({
    where: { userId: session.user.id },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
          dataCenter: true,
          world: true,
          district: true,
          ward: true,
          plot: true,
          apartment: true,
          location: true,
          xvmApiVenueId: true,
          _count: { select: { follows: true } },
          events: {
            where: { status: "ACTIVE" },
            take: 1,
            select: { title: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  // xvm-api is the source of truth for a connected venue's hours. Following is
  // unbounded (no take cap), so getPublicHoursForVenues chunks the ids into
  // batches of 50 and merges them - one request per 50 followed venues rather
  // than one per venue. Unconnected venues and failed reads show closed
  // (unless a live event is running) - Prisma no longer computes hours.
  const xvmVenueIds = follows.map((f) => f.venue.xvmApiVenueId).filter((id): id is string => id !== null)
  let hoursByVenue: Record<string, PublicHours> = {}
  if (xvmVenueIds.length > 0) {
    try {
      hoursByVenue = await getPublicHoursForVenues(xvmVenueIds)
    } catch {
      hoursByVenue = {}
    }
  }

  const venues = follows.map((f) => {
    const xvmHoursEntry = f.venue.xvmApiVenueId ? hoursByVenue[f.venue.xvmApiVenueId] : undefined
    return {
      id: f.venue.id,
      name: f.venue.name,
      slug: f.venue.slug,
      dataCenter: f.venue.dataCenter,
      world: f.venue.world,
      district: f.venue.district,
      ward: f.venue.ward,
      plot: f.venue.plot,
      apartment: f.venue.apartment,
      location: f.venue.location,
      followCount: f.venue._count.follows,
      isOpenNow: f.venue.events.length > 0 || (xvmHoursEntry?.open_now.open ?? false),
      activeEvent: f.venue.events[0] ?? null,
    }
  })

  return (
    <ExploreLayout>
      <FollowingClient venues={venues} followCount={follows.length} />
    </ExploreLayout>
  )
}
