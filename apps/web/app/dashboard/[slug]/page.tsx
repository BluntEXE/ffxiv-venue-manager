import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatReadout } from "@/components/ui/stat-readout"
import { CrystalDivider } from "@/components/ui/crystal-divider"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { ServerTimeRange } from "@/components/server-time"
import { getServerTimezone, getServerTimeLabel } from "@/lib/server-time"
import { OverviewRevenueChart } from "@/components/overview-revenue-chart"
import { OverviewTasks } from "@/components/overview-tasks"
import { format, subDays, subWeeks, formatDistanceToNow } from "date-fns"
import {
  Radio, ArrowRight, Users, TrendingUp, Calendar,
  Heart, BarChart3, Cog, ChevronRight,
} from "lucide-react"

export default async function VenueDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params
  const now = new Date()
  const weekAgo = subDays(now, 7)
  const twoWeeksAgo = subDays(now, 14)

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
      _count: { select: { follows: true } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role
  const membershipId = venue.memberships[0].id
  const canManage = ["OWNER", "MANAGER"].includes(userRole)
  const timezone = getServerTimezone(venue.dataCenter)
  const tzLabel = getServerTimeLabel(venue.dataCenter)

  // Live event
  const liveEvent = await prisma.event.findFirst({
    where: { venueId: venue.id, status: "ACTIVE" },
    select: { id: true, title: true, startTime: true },
  })

  // KPI data (owner/manager only)
  let kpis = {
    revenueThisWeek: 0, revenuePrev: 0,
    patronsThisWeek: 0, patronsPrev: 0,
    avgAttendance: 0,
    upcomingCount: 0,
    newFollowers: venue._count.follows,
  }

  if (canManage) {
    const [revThis, revPrev, patronsThis, patronsPrev, upcomingCount] = await Promise.all([
      prisma.transaction.aggregate({ where: { venueId: venue.id, createdAt: { gte: weekAgo } }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { venueId: venue.id, createdAt: { gte: twoWeeksAgo, lt: weekAgo } }, _sum: { amount: true } }),
      prisma.patronLog.count({ where: { venueId: venue.id, action: "ENTER", loggedAt: { gte: weekAgo } } }),
      prisma.patronLog.count({ where: { venueId: venue.id, action: "ENTER", loggedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.event.count({ where: { venueId: venue.id, startTime: { gte: now }, status: { in: ["PUBLISHED", "ACTIVE"] } } }),
    ])
    kpis = {
      revenueThisWeek: Number(revThis._sum.amount ?? 0),
      revenuePrev: Number(revPrev._sum.amount ?? 0),
      patronsThisWeek: patronsThis,
      patronsPrev: patronsPrev,
      avgAttendance: 0,
      upcomingCount: upcomingCount,
      newFollowers: venue._count.follows,
    }
  }

  // Recent events for chart + table (last 8)
  const recentEvents = canManage ? await prisma.event.findMany({
    where: { venueId: venue.id, status: { in: ["COMPLETED", "ACTIVE"] }, startTime: { lte: now } },
    orderBy: { startTime: "desc" },
    take: 8,
    select: { id: true, title: true, startTime: true, status: true, eventType: true },
  }) : []

  // Revenue per event for chart
  const chartData = canManage ? await Promise.all(
    recentEvents.slice().reverse().map(async (ev) => {
      const rev = await prisma.transaction.aggregate({
        where: { venueId: venue.id, createdAt: { gte: ev.startTime, lt: new Date(ev.startTime.getTime() + 12 * 60 * 60 * 1000) } },
        _sum: { amount: true },
      })
      return {
        label: format(ev.startTime, "d MMM"),
        revenue: Number(rev._sum.amount ?? 0),
        isToday: format(ev.startTime, "yyyy-MM-dd") === format(now, "yyyy-MM-dd"),
      }
    })
  ) : []

  // Patron counts per recent event for avg attendance
  if (canManage && recentEvents.length > 0) {
    const patPerEvent = await Promise.all(
      recentEvents.map(ev =>
        prisma.patronLog.count({
          where: { venueId: venue.id, action: "ENTER", loggedAt: { gte: ev.startTime, lt: new Date(ev.startTime.getTime() + 12 * 60 * 60 * 1000) } },
        })
      )
    )
    kpis.avgAttendance = patPerEvent.length > 0 ? Math.round(patPerEvent.reduce((a, b) => a + b, 0) / patPerEvent.length) : 0
  }

  // Next upcoming event
  const nextEvent = await prisma.event.findFirst({
    where: { venueId: venue.id, startTime: { gte: now }, status: { in: ["PUBLISHED", "ACTIVE"] } },
    orderBy: { startTime: "asc" },
    select: { id: true, title: true, startTime: true, endTime: true, eventType: true },
  })

  // Open tasks (all roles see their own; managers see all)
  const openTasks = await prisma.task.findMany({
    where: {
      venueId: venue.id,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      ...(canManage ? {} : { assignedTo: session.user.id }),
    },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true, title: true, dueDate: true, priority: true },
  })

  // My upcoming shifts
  const myShifts = await prisma.shift.findMany({
    where: {
      venueId: venue.id,
      membershipId,
      status: { in: ["SCHEDULED", "ACTIVE"] },
      scheduledStart: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
    },
    orderBy: { scheduledStart: "asc" },
    take: 3,
  })

  // Delta helpers
  const pct = (current: number, prev: number) => prev === 0 ? null : Math.round(((current - prev) / prev) * 100)
  const revDelta = pct(kpis.revenueThisWeek, kpis.revenuePrev)
  const patDelta = pct(kpis.patronsThisWeek, kpis.patronsPrev)

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="p-4 md:p-6 space-y-6">

        {/* Page header */}
        <div className="xiv-hero-bg overflow-hidden rounded-xl px-5 py-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="stat-label text-[var(--xiv-blue)]">
              {venue.dataCenter} &middot; {venue.world}
            </span>
          </div>
          <h1 className="font-cinzel text-2xl md:text-3xl font-bold tracking-[0.02em]">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(now, "EEEE, d MMM")} &middot; {tzLabel}
          </p>
        </div>

        {/* Live now banner */}
        {liveEvent && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.07)]">
            <div className="flex items-center gap-3">
              <span className="xiv-live-dot" />
              <span className="text-sm font-semibold text-[var(--success-text)] uppercase tracking-wide">Live now</span>
              <span className="text-sm text-foreground/80 hidden sm:inline">{liveEvent.title} in progress</span>
            </div>
            <Button asChild variant="outline-blue" size="sm">
              <Link href={`/dashboard/${slug}/live`}>
                View Live <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        )}

        {/* KPI readouts + action buttons */}
        {canManage && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card className="p-4">
              <StatReadout
                label="Revenue this week"
                value={kpis.revenueThisWeek >= 1000 ? `${(kpis.revenueThisWeek / 1000).toFixed(1)}k gil` : `${kpis.revenueThisWeek} gil`}
                delta={revDelta !== null ? `${revDelta > 0 ? "+" : ""}${revDelta}% vs last` : undefined}
                deltaDirection={revDelta !== null ? (revDelta >= 0 ? "up" : "down") : "neutral"}
                icon={<BarChart3 />} iconVariant="blue"
              />
            </Card>
            <Card className="p-4">
              <StatReadout
                label="Patrons this week"
                value={kpis.patronsThisWeek.toLocaleString()}
                delta={patDelta !== null ? `${patDelta > 0 ? "+" : ""}${patDelta}% vs last` : undefined}
                deltaDirection={patDelta !== null ? (patDelta >= 0 ? "up" : "down") : "neutral"}
                icon={<Users />} iconVariant="blue"
              />
            </Card>
            <Card className="p-4">
              <StatReadout
                label="Avg attendance"
                value={kpis.avgAttendance}
                subtext="per event"
                icon={<TrendingUp />} iconVariant="success"
              />
            </Card>
            <Card className="p-4">
              <StatReadout
                label="Upcoming events"
                value={kpis.upcomingCount}
                subtext={nextEvent ? `next ${formatDistanceToNow(nextEvent.startTime, { addSuffix: true })}` : undefined}
                icon={<Calendar />} iconVariant="blue"
              />
            </Card>
            <Card className="p-4">
              <StatReadout
                label="Followers"
                value={kpis.newFollowers.toLocaleString()}
                icon={<Heart />} iconVariant="warning"
              />
            </Card>
          </div>
        )}

        {/* Revenue chart + Next event */}
        {canManage && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Chart */}
            <Card className="lg:col-span-2 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="stat-label mb-0.5">Revenue</p>
                  <p className="text-xs text-muted-foreground">Last {chartData.length} events</p>
                </div>
                <Link href={`/dashboard/${slug}/analytics`} className="text-xs text-[var(--xiv-blue)] hover:underline flex items-center gap-1">
                  Full analytics <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              {chartData.length > 0
                ? <OverviewRevenueChart data={chartData} />
                : <p className="text-sm text-muted-foreground py-8 text-center">No event data yet</p>
              }
            </Card>

            {/* Next event — cinematic card */}
            {nextEvent ? (
              <div className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden relative flex flex-col justify-between">
                {/* Starfield strip */}
                <div className="absolute top-0 left-0 right-0 h-[88px] overflow-hidden">
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "url('/starfield.png')", backgroundSize: "cover" }} />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 40%, var(--card) 100%)" }} />
                </div>
                <div className="relative p-5 pt-4 flex flex-col gap-3 z-10">
                  {/* Eyebrow */}
                  <div className="flex items-center gap-2">
                    <span className="w-[6px] h-[6px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_8px_rgba(0,180,255,0.5)]" />
                    <span className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">Next event</span>
                  </div>
                  <h3 className="font-cinzel text-xl font-bold tracking-wide leading-tight">{nextEvent.title}</h3>
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    <ServerTimeRange start={nextEvent.startTime} end={nextEvent.endTime ?? nextEvent.startTime} timezone={timezone} tzLabel={tzLabel} />
                  </div>
                  {/* Countdown pill */}
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--xiv-blue)] bg-[var(--blue-010)] border border-[var(--blue-020)] px-3 py-1.5 rounded-full w-fit">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDistanceToNow(nextEvent.startTime, { addSuffix: true })}
                  </div>
                </div>
                <div className="px-5 pb-5 flex items-center justify-between gap-3 relative z-10">
                  <Badge variant="tag" className="text-[10px]">{nextEvent.eventType}</Badge>
                  <Button asChild variant="outline-blue" size="sm">
                    <Link href={`/dashboard/${slug}/events/${nextEvent.id}`}>
                      <Cog className="h-3.5 w-3.5" /> Manage
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <Card className="p-5 flex flex-col items-center justify-center gap-2 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">No upcoming events</p>
                <Button asChild variant="outline-blue" size="sm">
                  <Link href={`/dashboard/${slug}/events`}>Create one</Link>
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* Recent events table + Open tasks */}
        {canManage && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Events table */}
            <Card className="lg:col-span-2 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="stat-label">Recent events</p>
                <Link href={`/dashboard/${slug}/events`} className="text-xs text-[var(--xiv-blue)] hover:underline flex items-center gap-1">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-0">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-2 border-b border-[var(--blue-008)]">
                  <span className="xiv-th">Event</span>
                  <span className="xiv-th text-right">Date</span>
                  <span className="xiv-th text-right">Status</span>
                </div>
                {recentEvents.length > 0 ? recentEvents.map(ev => (
                  <Link key={ev.id} href={`/dashboard/${slug}/events/${ev.id}`}
                    className="grid grid-cols-[1fr_auto_auto] gap-4 py-2.5 border-b border-[var(--blue-008)] hover:bg-[var(--blue-004)] -mx-5 px-5 transition-colors last:border-0">
                    <span className="text-sm truncate">{ev.title}</span>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{format(ev.startTime, "d MMM")}</span>
                    <span>
                      {ev.status === "ACTIVE"
                        ? <Badge variant="live" className="text-[10px]">Live</Badge>
                        : <Badge variant="tag" className="text-[10px]">{ev.status.charAt(0) + ev.status.slice(1).toLowerCase()}</Badge>
                      }
                    </span>
                  </Link>
                )) : (
                  <p className="text-sm text-muted-foreground py-6 text-center">No events yet</p>
                )}
              </div>
            </Card>

            {/* Open tasks */}
            <Card className="p-5">
              {openTasks.length > 0
                ? <OverviewTasks
                    tasks={openTasks.map(t => ({
                      id: t.id,
                      title: t.title,
                      dueDate: t.dueDate ? format(t.dueDate, "d MMM") : null,
                      priority: t.priority,
                    }))}
                    venueSlug={slug}
                  />
                : (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-4">
                    <p className="stat-label">Open tasks</p>
                    <p className="text-sm text-muted-foreground">All clear</p>
                    <Button asChild variant="outline-blue" size="sm">
                      <Link href={`/dashboard/${slug}/tasks`}>View tasks</Link>
                    </Button>
                  </div>
                )
              }
            </Card>
          </div>
        )}

        {/* My shifts (all roles) */}
        {myShifts.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="stat-label">My shifts</p>
              <Link href={`/dashboard/${slug}/shifts`} className="text-xs text-[var(--xiv-blue)] hover:underline">View all</Link>
            </div>
            <div className="space-y-2">
              {myShifts.map(shift => (
                <Card key={shift.id} className={`p-4 flex items-center justify-between ${shift.status === "ACTIVE" ? "border-[rgba(16,185,129,0.3)]" : ""}`}>
                  <p className="text-sm">
                    <ServerTimeRange start={shift.scheduledStart} end={shift.scheduledEnd} timezone={timezone} tzLabel={tzLabel} />
                  </p>
                  <Badge variant={shift.status === "ACTIVE" ? "status-open" : "tag"}>
                    {shift.status === "ACTIVE" ? "On Shift" : "Upcoming"}
                  </Badge>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Staff quick actions */}
        {!canManage && (
          <div>
            <p className="stat-label mb-3">Quick actions</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { href: `/dashboard/${slug}/sales`, icon: BarChart3, label: "Log a Sale" },
                { href: `/dashboard/${slug}/shifts`, icon: Radio, label: "My Shifts" },
                { href: `/dashboard/${slug}/tasks`, icon: Users, label: "Tasks" },
              ].map(({ href, icon: Icon, label }) => (
                <Link key={href} href={href}>
                  <Card className="p-4 flex items-center gap-3 cursor-pointer">
                    <div className="h-8 w-8 rounded-lg bg-[var(--blue-010)] flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-[var(--xiv-blue)]" />
                    </div>
                    <span className="text-sm font-medium">{label}</span>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </VenueLayout>
  )
}
