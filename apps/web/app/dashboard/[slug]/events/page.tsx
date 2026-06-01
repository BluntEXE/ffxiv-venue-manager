import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/prisma"
import { EventsCalendar } from "@/components/events-calendar"
import { VenueLayout } from "@/components/venue-layout"
import { Breadcrumb } from "@/components/breadcrumb"
import { formatServerTime, SERVER_TIME_LABEL } from "@/lib/server-time"
import { format } from "date-fns"

const statusColors = {
  DRAFT: "bg-zinc-500",
  PUBLISHED: "bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  ACTIVE: "bg-emerald-500",
  COMPLETED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  CANCELLED: "bg-red-500",
}

const typeLabels = {
  PERFORMANCE: "Performance",
  GAME_NIGHT: "Game Night",
  SPECIAL: "Special Event",
  SOCIAL: "Social",
  PRIVATE: "Private",
  OTHER: "Other",
}

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ status?: string; view?: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const { slug } = await params
  const { status, view = "list" } = await searchParams

  // Get venue
  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: {
        where: {
          userId: session.user.id,
        },
      },
    },
  })

  if (!venue || venue.memberships.length === 0) {
    notFound()
  }

  // Build where clause
  const where: any = { venueId: venue.id }
  if (status) {
    where.status = status
  }

  // Get events
  const events = await prisma.event.findMany({
    where,
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { patronLogs: true } },
    },
    orderBy: { startTime: "asc" },
  })

  // Separate upcoming and past events
  const now = new Date()
  const upcomingEvents = events.filter((e: typeof events[number]) => new Date(e.startTime) >= now)
  const pastEvents = events.filter((e: typeof events[number]) => new Date(e.startTime) < now)

  const userRole = venue.memberships[0].role

  return (
    <VenueLayout
      venueSlug={venue.slug}
      venueName={venue.name}
      userRole={userRole}
    >
      <div className="p-4 md:p-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: venue.name, href: `/dashboard/${slug}` },
            { label: "Events" },
          ]}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">{venue.name} &middot; {venue.dataCenter} &middot; {venue.world}</span>
            </div>
            <h1 className="font-cinzel text-2xl md:text-3xl font-bold tracking-[0.02em]">Events</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your venue's events and schedule</p>
          </div>
          <Button asChild size="sm" className="sm:size-default self-start">
            <Link href={`/dashboard/${slug}/events/new`}>
              <span className="hidden sm:inline">Create Event</span>
              <span className="sm:hidden">New Event</span>
            </Link>
          </Button>
        </div>

      {/* View Tabs */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-1 bg-card border border-[var(--blue-015)] rounded-full p-1">
          {([
            { key: "list", label: "Upcoming" },
            { key: "calendar", label: "Calendar" },
          ] as const).map(({ key, label }) => (
            <Link
              key={key}
              href={`/dashboard/${slug}/events?view=${key}`}
              className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                view === key
                  ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{upcomingEvents.length} upcoming · {pastEvents.length} past</span>
      </div>

      {view === "calendar" ? (
        <EventsCalendar events={events} venueSlug={slug} />
      ) : (
        <>
          {/* Upcoming Events */}
          <div className="mb-10">
            <h2 className="font-cinzel text-lg font-bold tracking-[0.02em] mb-4">
              Upcoming Events <span className="text-muted-foreground font-normal text-base">({upcomingEvents.length})</span>
            </h2>
            {upcomingEvents.length === 0 ? (
              <div className="xiv-card rounded-xl p-8 text-center">
                <p className="text-muted-foreground">No upcoming events. Check back soon or ask your manager.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {upcomingEvents.map((event: typeof upcomingEvents[number]) => (
                  <div key={event.id} className="xiv-card rounded-xl p-4 transition-all duration-200 hover:border-[rgba(0,180,255,0.4)] flex gap-4">
                    {/* Datebox */}
                    <div className="w-10 flex-shrink-0 text-center pt-0.5">
                      <div className="text-[0.58rem] font-semibold uppercase tracking-wide text-[var(--xiv-blue)]">
                        {formatServerTime(event.startTime, "date").split(" ")[0]}
                      </div>
                      <div className="font-cinzel text-xl font-bold leading-none mt-0.5">
                        {new Date(event.startTime).getUTCDate()}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-3 flex-wrap">
                        <p className="font-semibold truncate">{event.title}</p>
                        <div className="flex gap-1.5 flex-wrap shrink-0">
                          <Badge className={statusColors[event.status as keyof typeof statusColors]}>{event.status}</Badge>
                          <Badge variant="outline">{typeLabels[event.eventType as keyof typeof typeLabels]}</Badge>
                          {event.partakeEventId && <Badge variant="outline" className="border-[rgba(0,180,255,0.4)] text-[var(--xiv-blue)]">Partake</Badge>}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <svg className="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {format(new Date(event.startTime), "EEE")} · {formatServerTime(event.startTime, "time")}
                        {event.endTime ? ` – ${formatServerTime(event.endTime, "time")} ${SERVER_TIME_LABEL}` : ` ${SERVER_TIME_LABEL}`}
                      </p>
                      {(event.attendanceCount || event.partakeAttendeeCount || event._count.patronLogs > 0) && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <svg className="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                          {event.attendanceCount
                            ? `${event.attendanceCount} attended`
                            : event.partakeAttendeeCount
                            ? `${event.partakeAttendeeCount} RSVP via Partake`
                            : `${event._count.patronLogs} patron logs`}
                        </p>
                      )}
                      {event.location && <p className="text-xs text-muted-foreground mt-1 truncate">{event.location}</p>}
                      <div className="flex gap-2 mt-3">
                        <Button asChild variant="outline" size="sm"><Link href={`/dashboard/${slug}/events/${event.id}`}>View</Link></Button>
                        <Button asChild variant="outline" size="sm"><Link href={`/dashboard/${slug}/events/${event.id}/edit`}>Edit</Link></Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past Events — grouped by month */}
          {pastEvents.length > 0 && (() => {
            const grouped = pastEvents.reduce((acc: Record<string, typeof pastEvents>, event) => {
              const key = format(new Date(event.startTime), "MMMM yyyy")
              if (!acc[key]) acc[key] = []
              acc[key].push(event)
              return acc
            }, {})
            return (
              <div>
                <h2 className="font-cinzel text-lg font-bold tracking-[0.02em] mb-6">
                  Past Events <span className="text-muted-foreground font-normal text-base">({pastEvents.length})</span>
                </h2>
                <div className="space-y-8">
                  {Object.entries(grouped).map(([month, monthEvents]) => (
                    <div key={month}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-semibold text-[var(--xiv-blue)] uppercase tracking-widest">{month}</span>
                        <div className="flex-1 h-px bg-[rgba(0,180,255,0.15)]" />
                        <span className="text-xs text-muted-foreground">{monthEvents.length} events</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {monthEvents.map((event: typeof pastEvents[number]) => (
                          <Link key={event.id} href={`/dashboard/${slug}/events/${event.id}`} className="group">
                            <div className="xiv-card rounded-xl p-3.5 flex items-center justify-between gap-4 opacity-70 hover:opacity-100 transition-all duration-200 hover:border-[rgba(0,180,255,0.3)]">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate group-hover:text-[var(--xiv-blue)] transition-colors">{event.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {formatServerTime(event.startTime, "datelong")} · {formatServerTime(event.startTime, "time")} {SERVER_TIME_LABEL}
                                </p>
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <Badge className={statusColors[event.status as keyof typeof statusColors]}>{event.status}</Badge>
                                <Badge variant="outline">{typeLabels[event.eventType as keyof typeof typeLabels]}</Badge>
                                {event.partakeEventId && <Badge variant="outline" className="border-[rgba(0,180,255,0.4)] text-[var(--xiv-blue)]">Partake</Badge>}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </>
      )}
      </div>
    </VenueLayout>
  )
}
