import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DiscoverClient, type DiscoverVenue } from "@/components/discover-client"
import { ExploreLayout } from "@/components/explore-layout"
import { isVenueOpenNow } from "@/lib/schedule-utils"
import { getPublicHoursBatch, type PublicHours } from "@/lib/api/xvm-api"

export const metadata: Metadata = {
  title: "Discover Venues",
  description: "Find FFXIV roleplay venues open tonight across every data centre and world.",
  alternates: { canonical: "https://xivvenuemanager.com/discover" },
}

export const revalidate = 60

// "Tonight" window: events starting within the next 8 hours, or started up to 30 min ago
function tonightWindow(): { from: Date; to: Date } {
  const now = new Date()
  return {
    from: new Date(now.getTime() - 30 * 60 * 1000),
    to: new Date(now.getTime() + 8 * 60 * 60 * 1000),
  }
}

export default async function DiscoverPage() {
  const session = await getServerSession(authOptions)
  const { from, to } = tonightWindow()

  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { follows: true } },
      events: {
        where: {
          OR: [{ status: "ACTIVE" }, { startTime: { gte: from, lte: to } }],
        },
        orderBy: { startTime: "asc" },
        select: { id: true, title: true, startTime: true, status: true },
        take: 2,
      },
      scheduleEntries: true,
      venueSchedule: { select: { data: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const followedIds = session?.user?.id
    ? (
        await prisma.venueFollow.findMany({
          where: { userId: session.user.id },
          select: { venueId: true },
        })
      ).map((f) => f.venueId)
    : []

  // xvm-api is the source of truth for a connected venue's hours - one batched
  // read for the whole page (take: 50 above stays within the batch cap) rather
  // than one request per venue. Non-fatal: unconnected venues and failed reads
  // fall back to the Prisma scheduleEntries computation per venue.
  const xvmVenueIds = venues.map((v) => v.xvmApiVenueId).filter((id): id is string => id !== null)
  let hoursByVenue: Record<string, PublicHours> = {}
  if (xvmVenueIds.length > 0) {
    try {
      hoursByVenue = (await getPublicHoursBatch(xvmVenueIds)).venues
    } catch {
      hoursByVenue = {}
    }
  }

  const cards: DiscoverVenue[] = venues.map((v) => {
    const activeEvent = v.events.find((e) => e.status === "ACTIVE") ?? null
    const upcomingEvent = v.events.find((e) => e.status !== "ACTIVE") ?? null
    const xvmHoursEntry = v.xvmApiVenueId ? hoursByVenue[v.xvmApiVenueId] : undefined
    return {
      id: v.id,
      name: v.name,
      slug: v.slug,
      dataCenter: v.dataCenter,
      world: v.world,
      district: v.district,
      ward: v.ward,
      plot: v.plot,
      apartment: v.apartment,
      location: v.location,
      description: v.description,
      followCount: v._count.follows,
      isFollowed: followedIds.includes(v.id),
      isOpenNow: xvmHoursEntry
        ? activeEvent !== null || xvmHoursEntry.open_now.open
        : isVenueOpenNow({
            hasActiveEvent: activeEvent !== null,
            scheduleEntries: v.scheduleEntries,
            ffxivSchedule: v.venueSchedule?.data,
          }),
      isTonightOpen: v.events.length > 0,
      activeEvent: activeEvent ? { title: activeEvent.title } : null,
      upcomingEvent: upcomingEvent
        ? { title: upcomingEvent.title, startTime: upcomingEvent.startTime.toISOString() }
        : null,
    }
  })

  // Sort: open now first, then tonight, then rest
  cards.sort((a, b) => {
    if (a.isOpenNow !== b.isOpenNow) return a.isOpenNow ? -1 : 1
    if (a.isTonightOpen !== b.isTonightOpen) return a.isTonightOpen ? -1 : 1
    return 0
  })

  return (
    <ExploreLayout>
      <DiscoverClient venues={cards} isAuthed={!!session?.user} totalCount={venues.length} />
    </ExploreLayout>
  )
}
