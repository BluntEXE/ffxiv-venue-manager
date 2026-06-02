import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DiscoverClient, type DiscoverVenue } from "@/components/discover-client"
import { ExploreLayout } from "@/components/explore-layout"

export const metadata: Metadata = {
  title: "Discover Venues — XIV Venue Manager",
  description: "Find FFXIV roleplay venues open tonight across every data centre and world.",
}

export const revalidate = 60

// "Tonight" window: events starting within the next 8 hours, or started up to 30 min ago
function tonightWindow(): { from: Date; to: Date } {
  const now = new Date()
  return {
    from: new Date(now.getTime() - 30 * 60 * 1000),
    to:   new Date(now.getTime() + 8 * 60 * 60 * 1000),
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
          OR: [
            { status: "ACTIVE" },
            { startTime: { gte: from, lte: to } },
          ],
        },
        orderBy: { startTime: "asc" },
        select: { id: true, title: true, startTime: true, status: true },
        take: 2,
      },
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

  const cards: DiscoverVenue[] = venues.map((v) => {
    const activeEvent = v.events.find((e) => e.status === "ACTIVE") ?? null
    const upcomingEvent = v.events.find((e) => e.status !== "ACTIVE") ?? null
    return {
      id:            v.id,
      name:          v.name,
      slug:          v.slug,
      dataCenter:    v.dataCenter,
      world:         v.world,
      location:      v.location,
      description:   v.description,
      followCount:   v._count.follows,
      isFollowed:    followedIds.includes(v.id),
      isOpenNow:     activeEvent !== null,
      isTonightOpen: v.events.length > 0,
      activeEvent:   activeEvent ? { title: activeEvent.title } : null,
      upcomingEvent: upcomingEvent ? { title: upcomingEvent.title, startTime: upcomingEvent.startTime.toISOString() } : null,
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
