import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CrystalDivider } from "@/components/ui/crystal-divider"
import { MapPin, Calendar, Heart, Radio, Clock, Users, ArrowLeft } from "lucide-react"
import { format } from "date-fns"
import { getServerTimezone, getServerTimeLabel, formatServerTime } from "@/lib/server-time"
import { VenueFollowButton } from "@/components/venue-follow-button"

export default async function VenueProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const session = await getServerSession(authOptions)
  const { slug } = await params

  const venue = await prisma.venue.findUnique({
    where: { slug, isActive: true },
    include: {
      _count: { select: { follows: true, events: true, memberships: true } },
      events: {
        where: {
          status: { in: ["ACTIVE", "PUBLISHED"] },
          startTime: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        },
        orderBy: { startTime: "asc" },
        take: 5,
        select: { id: true, title: true, startTime: true, endTime: true, status: true, eventType: true },
      },
    },
  })

  if (!venue) notFound()

  const liveEvent = venue.events.find(e => e.status === "ACTIVE")
  const upcomingEvents = venue.events.filter(e => e.status === "PUBLISHED")

  const isFollowing = session?.user?.id
    ? !!(await prisma.venueFollow.findFirst({
        where: { userId: session.user.id, venueId: venue.id },
      }))
    : false

  const tzLabel = getServerTimeLabel(venue.dataCenter)

  return (
    <div className="min-h-screen">

        {/* Hero banner */}
        <div className="relative border-b border-[var(--blue-015)]"
          style={{ background: "linear-gradient(180deg, rgba(0,180,255,0.05) 0%, rgba(7,11,20,0.0) 100%)" }}>
          <div className="max-w-4xl mx-auto px-4 py-10 md:py-14">
            <Link href="/discover" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--xiv-blue)] mb-6 transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Discover
            </Link>

            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Icon */}
              <div className="h-20 w-20 rounded-xl bg-[var(--blue-010)] border border-[var(--blue-018)] flex items-center justify-center text-3xl font-cinzel font-bold text-[var(--xiv-blue)] shrink-0">
                {venue.name.charAt(0)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <h1 className="font-cinzel text-2xl md:text-3xl font-bold tracking-[0.02em]">{venue.name}</h1>
                  <div className="flex items-center gap-2">
                    {liveEvent
                      ? <Badge variant="live">Live Now</Badge>
                      : upcomingEvents.length > 0
                      ? <Badge variant="status-soon">Event Soon</Badge>
                      : <Badge variant="status-closed">Closed</Badge>
                    }
                  </div>
                </div>

                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mb-3">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {venue.dataCenter} · {venue.world}
                  {venue.location && ` · ${venue.location}`}
                </p>

                {venue.description && (
                  <p className="text-sm text-foreground/80 mb-4 max-w-2xl">{venue.description}</p>
                )}

                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {venue._count.follows} followers</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {venue._count.memberships} staff</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {venue._count.events} events</span>
                </div>

                <div className="flex gap-3">
                  {session ? (
                    <VenueFollowButton venueId={venue.id} isFollowing={isFollowing} followCount={venue._count.follows} />
                  ) : (
                    <Button asChild variant="outline-blue" size="sm">
                      <Link href="/auth/signin">Sign in to Follow</Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

          {/* Happening now */}
          {liveEvent && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.07)]">
              <div className="flex items-center gap-3">
                <span className="xiv-live-dot" />
                <div>
                  <span className="text-xs font-semibold text-[var(--success-text)] uppercase tracking-wide">Happening now</span>
                  <p className="text-sm font-medium">{liveEvent.title}</p>
                </div>
              </div>
              <Badge variant="tag" className="text-[10px] shrink-0">{liveEvent.eventType}</Badge>
            </div>
          )}

          {/* Upcoming events */}
          {upcomingEvents.length > 0 && (
            <div>
              <p className="stat-label mb-3">Upcoming Events</p>
              <div className="space-y-2">
                {upcomingEvents.map(ev => (
                  <div key={ev.id} className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-[var(--blue-008)]">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-[var(--xiv-blue)] shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(ev.startTime, "d MMM")} · {formatServerTime(ev.startTime.toISOString(), "time")} {tzLabel}
                        </p>
                      </div>
                    </div>
                    <Badge variant="tag" className="text-[10px] shrink-0">{ev.eventType}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location */}
          {venue.location && (
            <div>
              <p className="stat-label mb-3">Location</p>
              <Card className="p-4 flex items-center gap-3">
                <MapPin className="h-4 w-4 text-[var(--xiv-blue)] shrink-0" />
                <p className="text-sm">{venue.location}</p>
              </Card>
            </div>
          )}

          {/* No events */}
          {!liveEvent && upcomingEvents.length === 0 && (
            <div className="text-center py-12">
              <Clock className="h-10 w-10 text-muted-foreground opacity-30 mx-auto mb-3" />
              <p className="text-muted-foreground">No events scheduled right now.</p>
            </div>
          )}
        </div>
    </div>
  )
}
