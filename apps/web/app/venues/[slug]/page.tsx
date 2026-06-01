import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, Calendar, Heart, Clock, Users, ArrowLeft, Crown, Image as ImageIcon } from "lucide-react"
import { format } from "date-fns"
import { getServerTimeLabel, formatServerTime } from "@/lib/server-time"
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

  const [owner, isFollowing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: venue.ownerId },
      select: { name: true, image: true, createdAt: true },
    }),
    session?.user?.id
      ? prisma.venueFollow.findFirst({
          where: { userId: session.user.id, venueId: venue.id },
        }).then(Boolean)
      : Promise.resolve(false),
  ])

  const liveEvent = venue.events.find((e) => e.status === "ACTIVE")
  const upcomingEvents = venue.events.filter((e) => e.status === "PUBLISHED")
  const tzLabel = getServerTimeLabel(venue.dataCenter)

  // Today's day index (UTC = server time): 0=Sun … 6=Sat
  const todayUTCDay = new Date().getUTCDay()
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

  return (
    <div className="min-h-screen bg-[var(--background)]">

      {/* ── Hero banner ────────────────────────────────────────────────── */}
      <div className="relative h-[300px] md:h-[360px] overflow-hidden border-b border-[var(--blue-008)]">
        {venue.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={venue.bannerUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,180,255,0.18) 0%, transparent 70%), url('/starfield.png') center/cover",
            }}
          />
        )}
        {/* Gradient fade to page bg */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(7,11,20,0.2) 0%, rgba(7,11,20,0.55) 55%, var(--background) 100%)",
          }}
        />

        {/* Back link */}
        <div className="absolute top-4 left-4 md:top-6 md:left-8 z-10">
          <Link
            href="/discover"
            className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Discover
          </Link>
        </div>

        {/* Hero content anchored to bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <div className="max-w-5xl mx-auto px-4 md:px-8 pb-6 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-cinzel text-3xl md:text-4xl font-bold tracking-[0.02em] text-white drop-shadow-lg" style={{ animation: "xiv-glow-pulse 3s ease-in-out infinite" }}>
                {venue.name}
              </h1>
              <p className="text-sm text-white/70 mt-1 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {venue.dataCenter} · {venue.world}
                {venue.location && ` · ${venue.location}`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {liveEvent ? (
                <Badge variant="live">Live Now</Badge>
              ) : upcomingEvents.length > 0 ? (
                <Badge variant="status-soon">Event Soon</Badge>
              ) : (
                <Badge variant="status-closed">Closed</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Identity strip ─────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-5 flex items-center justify-between gap-4 flex-wrap border-b border-[var(--blue-008)] xiv-fade-up">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-[var(--support-pink)]" />
            {venue._count.follows.toLocaleString()} followers
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-[var(--xiv-blue)]" />
            {venue._count.memberships} staff
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-[var(--xiv-blue)]" />
            {venue._count.events} events
          </span>
        </div>
        <div className="flex gap-2">
          {session ? (
            <VenueFollowButton
              venueId={venue.id}
              isFollowing={isFollowing}
              followCount={venue._count.follows}
            />
          ) : (
            <Button asChild variant="outline-blue" size="sm">
              <Link href="/auth/signin">Sign in to Follow</Link>
            </Button>
          )}
        </div>
      </div>

      {/* ── Body: 2-column layout ───────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 xiv-fade-up-delay-1">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 items-start">

          {/* ── MAIN COLUMN ── */}
          <div className="space-y-8">

            {/* Description */}
            {venue.description && (
              <p className="text-foreground/80 leading-relaxed">{venue.description}</p>
            )}

            {/* Live now banner */}
            {liveEvent && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-500/25 bg-emerald-500/7">
                <span className="xiv-live-dot" />
                <div>
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Happening now</span>
                  <p className="text-sm font-medium">{liveEvent.title}</p>
                </div>
                <Badge variant="tag" className="ml-auto text-[10px] shrink-0">{liveEvent.eventType}</Badge>
              </div>
            )}

            {/* Upcoming events */}
            {upcomingEvents.length > 0 && (
              <div>
                <p className="stat-label mb-3">Upcoming Events</p>
                <div className="space-y-2">
                  {upcomingEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[var(--blue-008)] hover:border-[var(--blue-018)] transition-colors"
                    >
                      {/* Date box */}
                      <div className="w-10 flex-shrink-0 text-center">
                        <div className="text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--xiv-blue)]">
                          {format(ev.startTime, "MMM")}
                        </div>
                        <div className="font-cinzel text-lg font-bold leading-none">
                          {format(ev.startTime, "d")}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{ev.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(ev.startTime, "EEE")} · {formatServerTime(ev.startTime.toISOString(), "time")} {tzLabel}
                          {ev.endTime && ` — ${formatServerTime(ev.endTime.toISOString(), "time")} ${tzLabel}`}
                        </p>
                      </div>
                      {ev.eventType && (
                        <Badge variant="tag" className="text-[10px] shrink-0">{ev.eventType}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No events empty state */}
            {!liveEvent && upcomingEvents.length === 0 && (
              <div className="text-center py-10 rounded-xl border border-[var(--blue-008)]">
                <Clock className="h-8 w-8 text-muted-foreground opacity-30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No events scheduled right now.</p>
              </div>
            )}

            {/* Gallery */}
            <div>
              <p className="stat-label mb-3 flex items-center gap-2">
                <ImageIcon className="h-3.5 w-3.5" /> Gallery
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="aspect-[4/3] rounded-xl border border-[var(--blue-015)] bg-gradient-to-br from-card to-[var(--surface-alt,var(--card))] overflow-hidden relative flex items-center justify-center"
                  >
                    <div
                      className="absolute inset-0 opacity-[0.18]"
                      style={{ background: "url('/starfield.png') center/cover" }}
                    />
                    <ImageIcon className="w-6 h-6 text-[var(--blue-035)] relative" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── SIDEBAR ── */}
          <div className="flex flex-col gap-4">

            {/* Hours */}
            <div className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[var(--blue-008)] font-semibold text-[0.95rem]">
                <Clock className="w-4 h-4 text-[var(--xiv-blue)]" />
                Hours
              </div>
              {/* No hours model yet — show structured empty state */}
              <div className="divide-y divide-[var(--blue-008)]">
                {DAY_NAMES.map((day, i) => {
                  const isToday = i === todayUTCDay
                  return (
                    <div
                      key={day}
                      className={`flex items-center justify-between px-5 py-2.5 text-sm ${
                        isToday ? "bg-[var(--blue-007)]" : ""
                      }`}
                    >
                      <span className={isToday ? "text-[var(--xiv-blue)] font-semibold" : "text-muted-foreground"}>
                        {day}
                      </span>
                      <span className="text-[var(--fg-faint)] text-xs">—</span>
                    </div>
                  )
                })}
              </div>
              <div className="px-5 py-3 border-t border-[var(--blue-008)]">
                <p className="text-[0.7rem] text-[var(--fg-faint)]">
                  Hours are set in venue Settings
                </p>
              </div>
            </div>

            {/* Location */}
            <div className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[var(--blue-008)] font-semibold text-[0.95rem]">
                <MapPin className="w-4 h-4 text-[var(--xiv-blue)]" />
                Location
              </div>
              <div className="px-5 py-4 space-y-2.5">
                {[
                  { k: "Data Centre", v: venue.dataCenter },
                  { k: "World",       v: venue.world },
                  ...(venue.location ? [{ k: "Ward & Plot", v: venue.location }] : []),
                ].map(({ k, v }) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--fg-faint)]">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hosted by */}
            {owner && (
              <div className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[var(--blue-008)] font-semibold text-[0.95rem]">
                  <Crown className="w-4 h-4 text-[var(--xiv-blue)]" />
                  Hosted by
                </div>
                <div className="flex items-center gap-3 px-5 py-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--xiv-blue)] to-blue-700 flex items-center justify-center font-bold text-white text-sm flex-shrink-0">
                    {owner.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <Crown className="w-3 h-3 text-[var(--warning)]" />
                      {owner.name ?? "Owner"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Owner · since {format(owner.createdAt, "yyyy")}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
