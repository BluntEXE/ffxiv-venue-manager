import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CrystalDivider } from "@/components/ui/crystal-divider"
import { MapPin, Clock, Users, ArrowRight, Heart, Radio } from "lucide-react"
import { getServerTimezone, getServerTimeLabel, formatServerTime } from "@/lib/server-time"

export const revalidate = 60

export default async function DiscoverPage() {
  const session = await getServerSession(authOptions)

  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { follows: true, events: true } },
      events: {
        where: { status: "ACTIVE" },
        take: 1,
        select: { id: true, title: true, startTime: true, endTime: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  // Get follow status for logged-in user
  const followedIds = session?.user?.id
    ? (await prisma.venueFollow.findMany({
        where: { userId: session.user.id },
        select: { venueId: true },
      })).map(f => f.venueId)
    : []

  // Featured = first venue with an active event, else first venue
  const featured = venues.find(v => v.events.length > 0) ?? venues[0]
  const rest = venues.filter(v => v.id !== featured?.id)

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8 text-center">
          <CrystalDivider className="mb-4" />
          <h1 className="font-cinzel text-3xl md:text-4xl font-bold tracking-[0.02em] mb-2">Discover Venues</h1>
          <p className="text-muted-foreground">Find roleplay taverns, lounges and clubs across the realm</p>
        </div>

        {/* Featured hero */}
        {featured && (
          <div className="mb-8">
            <p className="stat-label text-[var(--xiv-blue)] mb-3">Featured tonight</p>
            <div className="rounded-xl border border-[var(--blue-018)] overflow-hidden"
              style={{ background: "linear-gradient(135deg, rgba(0,180,255,0.06) 0%, rgba(7,11,20,0.95) 60%)" }}>
              <div className="p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Icon badge */}
                  <div className="h-16 w-16 rounded-xl bg-[var(--blue-010)] border border-[var(--blue-018)] flex items-center justify-center shrink-0 text-2xl font-cinzel font-bold text-[var(--xiv-blue)]">
                    {featured.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <h2 className="font-cinzel text-2xl md:text-3xl font-bold tracking-[0.02em] mb-1">{featured.name}</h2>
                        <p className="text-sm text-muted-foreground">
                          {featured.dataCenter} · {featured.world}
                          {featured.location && ` · ${featured.location}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {featured.events.length > 0
                          ? <Badge variant="live">Live Now</Badge>
                          : <Badge variant="tag">Open</Badge>
                        }
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Heart className="h-3.5 w-3.5" /> {featured._count.follows}
                        </span>
                      </div>
                    </div>

                    {featured.events[0] && (
                      <div className="mt-4 pt-4 border-t border-[var(--blue-008)] grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <div>
                          <p className="stat-label mb-0.5">Tonight</p>
                          <p className="text-sm font-medium text-[var(--xiv-blue)]">{featured.events[0].title}</p>
                        </div>
                        <div>
                          <p className="stat-label mb-0.5">Status</p>
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            <span className="xiv-live-dot scale-75" /> Active
                          </p>
                        </div>
                      </div>
                    )}

                    {featured.description && (
                      <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{featured.description}</p>
                    )}

                    <div className="flex items-center gap-3 mt-4">
                      <Button asChild variant="cta" size="sm">
                        <Link href={`/venues/${featured.slug}`}>
                          Visit Venue <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      {session && (
                        <Button asChild variant="outline-blue" size="sm">
                          <Link href={`/venues/${featured.slug}`}>
                            <Heart className="h-3.5 w-3.5" />
                            {followedIds.includes(featured.id) ? "Following" : "Follow"}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Browse list */}
        {rest.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="stat-label">All Venues</p>
              <span className="text-xs text-muted-foreground">{venues.length} venues</span>
            </div>
            <div className="space-y-2">
              {rest.map(venue => {
                const isOpen = venue.events.length > 0
                return (
                  <div key={venue.id} className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[var(--blue-008)] hover:border-[var(--blue-018)] hover:bg-[var(--blue-004)] transition-all">
                    <div className="h-10 w-10 rounded-lg bg-[var(--blue-010)] flex items-center justify-center text-sm font-cinzel font-bold text-[var(--xiv-blue)] shrink-0">
                      {venue.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{venue.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 inline mr-0.5" />
                        {venue.dataCenter} · {venue.world}
                        {venue.location && ` · ${venue.location}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {isOpen
                        ? <Badge variant="status-open" className="text-[10px]">Open</Badge>
                        : <Badge variant="status-closed" className="text-[10px]">Closed</Badge>
                      }
                      <Button asChild variant="outline-blue" size="sm" className={!isOpen ? "opacity-50 pointer-events-none" : ""}>
                        <Link href={`/venues/${venue.slug}`}>Visit <ArrowRight className="h-3 w-3" /></Link>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {venues.length === 0 && (
          <div className="text-center py-20">
            <Radio className="h-12 w-12 text-muted-foreground opacity-30 mx-auto mb-4" />
            <p className="text-muted-foreground">No venues yet. Be the first!</p>
            {session && (
              <Button asChild variant="cta" className="mt-4">
                <Link href="/venues/new">Create a Venue</Link>
              </Button>
            )}
          </div>
        )}
    </div>
  )
}
