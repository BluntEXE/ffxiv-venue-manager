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
          location: true,
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

  const venues = follows.map(f => ({
    id:          f.venue.id,
    name:        f.venue.name,
    slug:        f.venue.slug,
    dataCenter:  f.venue.dataCenter,
    world:       f.venue.world,
    location:    f.venue.location,
    followCount: f.venue._count.follows,
    isOpenNow:   f.venue.events.length > 0,
    activeEvent: f.venue.events[0] ?? null,
  }))

  return (
    <ExploreLayout>
      <FollowingClient venues={venues} followCount={follows.length} />
    </ExploreLayout>
  )
}
