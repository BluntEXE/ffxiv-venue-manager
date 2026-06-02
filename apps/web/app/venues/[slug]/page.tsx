import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const venue = await prisma.venue.findUnique({ where: { slug, isActive: true }, select: { name: true, description: true, dataCenter: true, world: true } })
  if (!venue) return { title: "Venue — XIV Venue Manager" }
  return {
    title: `${venue.name} — XIV Venue Manager`,
    description: venue.description ?? `${venue.name} is an FFXIV roleplay venue on ${venue.dataCenter} · ${venue.world}. Follow to stay updated on events.`,
  }
}
import { format } from "date-fns"
import { MapPin, Calendar, Clock, Crown, Image as ImageIcon, ChevronLeft, Scroll, Heart } from "lucide-react"
import { getServerTimeLabel, formatServerTime } from "@/lib/server-time"
import { VenueFollowButton } from "@/components/venue-follow-button"
import { CopyAddressButton, CopyAddressInline } from "@/components/copy-address-button"

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
      ? prisma.venueFollow.findFirst({ where: { userId: session.user.id, venueId: venue.id } }).then(Boolean)
      : Promise.resolve(false),
  ])

  const liveEvent     = venue.events.find(e => e.status === "ACTIVE")
  const upcomingEvents = venue.events.filter(e => e.status === "PUBLISHED")
  const tzLabel       = getServerTimeLabel(venue.dataCenter)
  const todayUTCDay   = new Date().getUTCDay()
  const DAY_NAMES     = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
  const address       = `${venue.dataCenter} · ${venue.world}${venue.location ? ` · ${venue.location}` : ""}`

  // Parse hours from settings
  const s = venue.settings as Record<string, unknown> | null
  const defaultHours = (s?.defaultHours as string | undefined) ?? ""
  const openNights   = (s?.openNights   as string | undefined) ?? ""

  // Map day abbreviations/names to DAY_NAMES index (0=Sunday)
  const DAY_PATTERNS: [RegExp, number][] = [
    [/\bsun(day)?\b/i,    0],
    [/\bmon(day)?\b/i,    1],
    [/\btue(s(day)?)?\b/i, 2],
    [/\bwed(nesday)?\b/i, 3],
    [/\bthu(rs?(day)?)?\b/i, 4],
    [/\bfri(day)?\b/i,    5],
    [/\bsat(urday)?\b/i,  6],
  ]

  // Detect a "Fri-Sun" / "Fri–Sat" range and expand it
  function expandDayRange(text: string): number[] {
    const rangeMatch = text.match(/(\w+)\s*[-–]\s*(\w+)/)
    if (rangeMatch) {
      const from = DAY_PATTERNS.findIndex(([rx]) => rx.test(rangeMatch[1]))
      const to   = DAY_PATTERNS.findIndex(([rx]) => rx.test(rangeMatch[2]))
      if (from !== -1 && to !== -1) {
        const days: number[] = []
        let i = from
        while (true) {
          days.push(i % 7)
          if (i % 7 === to) break
          i++
          if (i - from > 7) break // safety
        }
        return days
      }
    }
    return []
  }

  function parseOpenDays(nights: string): Set<number> | null {
    if (!nights.trim()) return null
    if (/every\s*(night|day)/i.test(nights)) return new Set([0,1,2,3,4,5,6])
    const range = expandDayRange(nights)
    if (range.length > 0) return new Set(range)
    const found = new Set<number>()
    for (const [rx, idx] of DAY_PATTERNS) {
      if (rx.test(nights)) found.add(idx)
    }
    return found.size > 0 ? found : null
  }

  const openDays = parseOpenDays(openNights)

  return (
    <div className="min-h-screen bg-[var(--background)]">

      {/* ── Hero banner ── */}
      <section className="profile-hero relative mt-[60px] h-[340px] overflow-hidden border-b border-[var(--blue-008)]">
        {/* BG */}
        <div className="absolute inset-0 bg-[url('/starfield.png')] bg-center bg-cover opacity-40 scale-[1.05]" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(7,11,20,0.2) 0%, rgba(7,11,20,0.55) 55%, var(--background) 100%)" }} />

        {/* Back link — top left */}
        <div className="absolute top-5 left-6 z-10">
          <Link href="/discover" className="inline-flex items-center gap-1.5 text-[0.88rem] font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] px-3 py-2 rounded-[var(--radius-md)] transition-colors">
            <ChevronLeft className="w-4 h-4" /> Discover
          </Link>
        </div>

        {/* Hero content — anchored bottom */}
        <div className="hero-content absolute bottom-0 left-0 right-0 z-10">
          <div className="max-w-[1080px] mx-auto px-8 pb-[26px] flex items-end justify-between gap-6 flex-wrap">
            {/* Identity */}
            <div className="hero-id">
              {liveEvent ? (
                <span className="status open mb-[14px] inline-flex"><span className="dot" />Open now</span>
              ) : upcomingEvents.length > 0 ? (
                <span className="status soon mb-[14px] inline-flex"><span className="dot" />Opening soon</span>
              ) : (
                <span className="status closed mb-[14px] inline-flex"><span className="dot" />Closed</span>
              )}
              <h1 className="font-cinzel font-bold text-[clamp(2.2rem,4vw,3.2rem)] tracking-[0.02em] leading-[1.05]">
                {venue.name}
              </h1>
              <div className="font-mono text-[0.86rem] text-[var(--xiv-blue)] mt-3 flex items-center gap-2">
                <MapPin className="w-[15px] h-[15px]" />
                {address}
              </div>
              {/* Tags from settings or eventType */}
              {/* Tags pulled from settings json if present */}
              {(() => {
                const s = venue.settings as Record<string, unknown> | null
                const tags = (s?.tags as string[] | undefined) ?? []
                return tags.length > 0 ? (
                  <div className="tags flex flex-wrap gap-2 mt-[14px]">
                    {tags.map(t => <span key={t} className={`tag ${t === "18+" ? "adult" : ""}`}>{t}</span>)}
                  </div>
                ) : null
              })()}
            </div>

            {/* Follow action */}
            <div className="hero-actions flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                {session ? (
                  <VenueFollowButton venueId={venue.id} isFollowing={isFollowing} followCount={venue._count.follows} />
                ) : (
                  <Link href="/auth/signin" className="btn btn-follow flex items-center gap-2 px-5 py-[10px] rounded-[var(--radius-md)] bg-[var(--blue-010)] text-[var(--xiv-blue)] border border-[var(--blue-035)] hover:bg-[var(--blue-012)] transition-colors font-semibold text-[0.9rem]">
                    <Heart className="w-4 h-4" /> Follow
                  </Link>
                )}
                <div className="text-[0.8rem] text-muted-foreground mt-2 text-right">
                  <strong className="text-foreground">{venue._count.follows.toLocaleString()}</strong> following
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Live strip ── */}
      {liveEvent && (
        <div className="live-strip bg-[var(--card)] border-b border-[var(--blue-008)]">
          <div className="max-w-[1080px] mx-auto px-8 py-[14px] flex items-center gap-4 flex-wrap">
            <span className="lb inline-flex items-center gap-2 text-[0.72rem] font-bold tracking-[0.12em] uppercase text-[var(--success-text)]">
              <span className="d w-2 h-2 rounded-full bg-[var(--success-text)] relative">
                <span className="absolute inset-[-4px] rounded-full bg-[var(--success-text)] opacity-50 animate-ping" />
              </span>
              Happening now
            </span>
            <span className="text-[0.92rem]">
              <strong>{liveEvent.title}</strong>
              {" · "}open until {liveEvent.endTime ? `${formatServerTime(liveEvent.endTime.toISOString(), "time")} ${tzLabel}` : "late"}
            </span>
            <div className="flex-1" />
            <CopyAddressInline address={address} />
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <section className="prof-body pt-[44px] pb-[70px]">
        <div className="max-w-[1080px] mx-auto px-8">
          <div className="prof-grid grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-[30px] items-start">

            {/* ── Main column ── */}
            <div className="prof-main flex flex-col gap-[34px]">

              {/* About */}
              <div className="about">
                <div className="block-title"><Scroll /> About</div>
                {venue.description
                  ? <p className="text-[0.96rem] text-[var(--fg-subtle)] leading-[1.7]">{venue.description}</p>
                  : <p className="text-[0.9rem] text-[var(--fg-faint)] italic">The owner hasn&apos;t added a description yet.</p>
                }
              </div>

              {/* Upcoming events */}
              {upcomingEvents.length > 0 && (
                <div className="upcoming">
                  <div className="block-title">
                    <Calendar /> Upcoming events
                  </div>
                  <div className="events-list panel">
                    {upcomingEvents.map(ev => (
                      <div key={ev.id} className="event-row border-b border-[var(--blue-008)] last:border-b-0">
                        <div className="datebox">
                          <div className="mo">{format(ev.startTime, "MMM")}</div>
                          <div className="dy">{format(ev.startTime, "d")}</div>
                        </div>
                        <div className="ev-mid">
                          <div className="ev-title">{ev.title}</div>
                          <div className="ev-sub">
                            <span className="meta">
                              <Clock />
                              {format(ev.startTime, "EEE")} · {formatServerTime(ev.startTime.toISOString(), "time")}{ev.endTime ? `–${formatServerTime(ev.endTime.toISOString(), "time")}` : ""} {tzLabel}
                            </span>
                            {ev.eventType && <span className="tag">{ev.eventType}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gallery — real images from MinIO */}
              {venue.galleryImages && venue.galleryImages.length > 0 && (
                <div className="gallery-block">
                  <div className="block-title"><ImageIcon /> Gallery</div>
                  <div className="gallery">
                    {venue.galleryImages.map((url, i) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="gtile">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`${venue.name} gallery ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Side column ── */}
            <div className="prof-side flex flex-col gap-[18px]">

              {/* Hours */}
              <div className="dcard">
                <div className="dh"><Clock /> Hours</div>
                {openDays ? (
                  DAY_NAMES.map((day, i) => {
                    const isOpen  = openDays.has(i)
                    const isToday = i === todayUTCDay
                    return (
                      <div key={day} className={`hours-row${isToday ? " today" : isOpen ? "" : " closed"}`}>
                        <span className="day">{day}</span>
                        <span className="hrs">{isOpen ? (defaultHours || "Open") : "Closed"}</span>
                      </div>
                    )
                  })
                ) : defaultHours ? (
                  // Has hours but couldn't parse specific days — show a summary row
                  <>
                    <div className="px-5 py-3 text-[0.86rem]">
                      <span className="text-muted-foreground">Hours</span>
                      <span className="float-right font-medium">{defaultHours} {tzLabel}</span>
                    </div>
                    {openNights && (
                      <div className="px-5 pb-3 text-[0.86rem]">
                        <span className="text-muted-foreground">Open</span>
                        <span className="float-right font-medium">{openNights}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {DAY_NAMES.map((day, i) => (
                      <div key={day} className={`hours-row closed${i === todayUTCDay ? " today" : ""}`}>
                        <span className="day">{day}</span>
                        <span className="hrs">—</span>
                      </div>
                    ))}
                    <p className="px-5 pb-3 pt-1 text-[0.72rem] text-[var(--fg-faint)]">Hours not set by owner.</p>
                  </>
                )}
              </div>

              {/* Location */}
              <div className="dcard">
                <div className="dh"><MapPin /> Location</div>
                <div className="loc-block">
                  {[
                    { k: "Data Centre", v: venue.dataCenter },
                    { k: "World",       v: venue.world },
                    ...(venue.location ? [{ k: "District, Ward & Plot", v: venue.location }] : []),
                  ].map(({ k, v }) => (
                    <div key={k} className="loc-line">
                      <span className="lk">{k}</span>
                      <span className="lv">{v}</span>
                    </div>
                  ))}
                  <CopyAddressButton address={address} />
                </div>
              </div>

              {/* Hosted by */}
              {owner && (
                <div className="dcard">
                  <div className="dh"><Crown /> Hosted by</div>
                  <div className="host-row">
                    <div className="av">{owner.name?.charAt(0)?.toUpperCase() ?? "?"}</div>
                    <div>
                      <div className="hn">
                        <Crown />
                        {owner.name ?? "Owner"}
                      </div>
                      <div className="hr">Owner · since {format(owner.createdAt, "yyyy")}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[var(--card-mantle)] border-t border-[var(--blue-008)] py-[30px]">
        <div className="max-w-[1080px] mx-auto px-8 flex justify-between gap-4 flex-wrap items-center">
          <Link href="/" className="inline-flex items-center gap-2 text-[0.92rem] font-cinzel font-bold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/xiv-icon.png" alt="" width={26} height={26} />
            <span><span className="text-[var(--xiv-blue)]">XIV</span> <span className="text-foreground/80">Venue Manager</span></span>
          </Link>
          <p className="text-[0.74rem] text-[var(--fg-faint)] leading-[1.6] max-w-[60ch]">
            A community fan tool, not affiliated with SQUARE ENIX CO., LTD. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.
          </p>
        </div>
      </footer>
    </div>
  )
}
