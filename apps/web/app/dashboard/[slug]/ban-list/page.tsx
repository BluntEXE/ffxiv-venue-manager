import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { BanListManager } from "@/components/ban-list-manager"

export default async function BanListPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role
  if (!["OWNER", "MANAGER"].includes(userRole)) notFound()

  const banned = await prisma.patron.findMany({
    where: { venueId: venue.id, isBanned: true },
    include: {
      bannedBy: { select: { id: true, name: true } },
    },
    orderBy: { bannedAt: "desc" },
  })

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
            </span>
          </div>
          <h1 className="page-h1">Ban List</h1>
        </div>

        <BanListManager
          venueId={venue.id}
          patrons={banned.map((p) => ({
            id: p.id,
            characterName: p.characterName,
            world: p.world,
            banReason: p.banReason,
            bannedAt: p.bannedAt?.toISOString() ?? null,
            bannedBy: p.bannedBy,
          }))}
        />
      </div>
    </VenueLayout>
  )
}
