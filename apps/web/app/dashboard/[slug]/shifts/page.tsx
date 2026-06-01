import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { CreateShiftDialog } from "@/components/create-shift-dialog"
import { getServerTimezone, getServerTimeLabel, formatServerTime } from "@/lib/server-time"
import { DeleteShiftButton } from "@/components/delete-shift-button"
import { ClockShiftButton } from "@/components/clock-shift-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// Week start = Monday in UTC (FFXIV server time = UTC)
function getWeekMonday(base: Date): Date {
  const day = base.getUTCDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + diff))
}

function addUTCDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n))
}

// "2026-06-01"
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// "10PM" or "10:30PM"
function fmtHour(iso: string | Date): string {
  const d = new Date(iso)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
}

// "Mon 2 Jun"
function fmtWeekLabel(d: Date): string {
  return d.toLocaleString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
}

const statusChip: Record<string, string> = {
  SCHEDULED: "bg-[rgba(0,180,255,0.10)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.28)]",
  ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  MISSED:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CANCELLED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/15 line-through",
}

const statusBadge: Record<string, string> = {
  SCHEDULED: "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  ACTIVE:    "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  MISSED:    "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
}

export default async function ShiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ w?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params
  const { w } = await searchParams

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role
  const currentMembershipId = venue.memberships[0].id
  const canManage = ["OWNER", "MANAGER"].includes(userRole)
  const timezone = getServerTimezone(venue.dataCenter)
  const tzLabel = getServerTimeLabel(venue.dataCenter)

  // Week bounds
  const base = w ? new Date(w + "T00:00:00Z") : new Date()
  const weekStart = getWeekMonday(base)
  const weekEnd = addUTCDays(weekStart, 7) // exclusive upper bound

  const todayKey = utcDayKey(new Date())
  const thisWeekKey = utcDayKey(getWeekMonday(new Date()))
  const isCurrentWeek = utcDayKey(weekStart) === thisWeekKey

  const prevWeekParam = utcDayKey(addUTCDays(weekStart, -7))
  const nextWeekParam = utcDayKey(addUTCDays(weekStart, 7))

  const weekDays = Array.from({ length: 7 }, (_, i) => addUTCDays(weekStart, i))

  // Fetch shifts for this week + active shifts (may have started before this week)
  const [weekShifts, activeShifts] = await Promise.all([
    prisma.shift.findMany({
      where: {
        venueId: venue.id,
        scheduledStart: { gte: weekStart, lt: weekEnd },
      },
      include: {
        membership: { include: { user: { select: { id: true, name: true, image: true } } } },
      },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.shift.findMany({
      where: { venueId: venue.id, status: "ACTIVE" },
      include: {
        membership: { include: { user: { select: { id: true, name: true, image: true } } } },
      },
    }),
  ])

  // Staff list for create dialog
  const activeStaff = await prisma.membership.findMany({
    where: { venueId: venue.id, status: "active", userId: { not: null } },
    include: { user: { select: { id: true, name: true, image: true } } },
  })
  const staffForDialog = activeStaff.map((m) => ({
    id: m.id,
    name: m.user?.name ?? "Unknown",
    image: m.user?.image ?? null,
  }))

  // Build staff × day grid
  type ShiftRow = (typeof weekShifts)[0]
  const staffMap = new Map<string, {
    membershipId: string
    name: string
    image: string | null
    cells: Map<string, ShiftRow[]>
  }>()

  for (const shift of weekShifts) {
    const mid = shift.membershipId
    if (!staffMap.has(mid)) {
      staffMap.set(mid, {
        membershipId: mid,
        name: shift.membership.user?.name ?? "Unknown",
        image: shift.membership.user?.image ?? null,
        cells: new Map(),
      })
    }
    const member = staffMap.get(mid)!
    const key = utcDayKey(new Date(shift.scheduledStart))
    if (!member.cells.has(key)) member.cells.set(key, [])
    member.cells.get(key)!.push(shift)
  }

  const staffRows = [...staffMap.values()]

  // KPI counts
  const scheduledCount = weekShifts.filter((s) => s.status === "SCHEDULED").length
  const activeCount = activeShifts.length
  const openSlots = weekShifts.filter((s) => s.status === "MISSED").length
  const coverPct =
    weekShifts.length === 0
      ? 100
      : Math.round(((weekShifts.length - openSlots) / weekShifts.length) * 100)

  // Upcoming shifts that need action (clock-in/out for this week)
  const actionShifts = weekShifts.filter(
    (s) => s.status === "SCHEDULED" || s.status === "ACTIVE"
  )

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">{venue.name} &middot; {venue.dataCenter} &middot; {venue.world}</span>
            </div>
            <h1 className="page-h1">Shifts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Schedule and track staff shifts &middot; Times in Server Time ({tzLabel})
            </p>
          </div>
          {canManage && (
            <CreateShiftDialog
              venueSlug={slug}
              staff={staffForDialog}
              timezone={timezone}
              tzLabel={tzLabel}
            />
          )}
        </div>

        {/* KPIs */}
        <div className="kpis mb-6">
          {[
            { k: "Shifts this week", v: weekShifts.length,  sub: fmtWeekLabel(weekStart) + "–" + fmtWeekLabel(addUTCDays(weekStart, 6)), icon: "M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2zm0 2v8l4 2" },
            { k: "Open shifts",       v: openSlots,           sub: "needs cover",     icon: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01" },
            { k: "Active now",       v: activeCount,         sub: "on shift",        icon: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" },
            { k: "Coverage",         v: `${coverPct}%`,      sub: "of scheduled",    icon: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0" },
          ].map(({ k, v, sub, icon }) => (
            <Card key={k} className="p-4">
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-[var(--blue-010)] border border-[var(--blue-018)] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d={icon} />
                  </svg>
                </span>
                <div>
                  <p className="text-[0.66rem] uppercase tracking-[0.1em] text-[var(--fg-faint)] font-semibold">{k}</p>
                  <p className="font-[var(--font-outfit)] text-xl font-bold mt-0.5">{v}</p>
                  <p className="text-[0.7rem] text-muted-foreground mt-0.5">{sub}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Week nav toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full px-1 py-1">
            <Link
              href={`/dashboard/${slug}/shifts?w=${prevWeekParam}`}
              className="w-8 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] transition-colors"
            >
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </Link>
            <span className="px-3 text-sm font-semibold min-w-[90px] text-center">
              {isCurrentWeek ? "This week" : fmtWeekLabel(weekStart)}
            </span>
            <Link
              href={`/dashboard/${slug}/shifts?w=${nextWeekParam}`}
              className="w-8 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] transition-colors"
            >
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          </div>
          {!isCurrentWeek && (
            <Link
              href={`/dashboard/${slug}/shifts`}
              className="text-xs text-[var(--xiv-blue)] hover:underline"
            >
              Back to current week
            </Link>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-[0.7rem] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="text-[0.68rem] font-semibold px-2 py-0.5 rounded bg-[rgba(0,180,255,0.10)] text-[var(--xiv-blue)] border border-[rgba(0,180,255,0.28)]">10PM</span>
              Scheduled
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[0.68rem] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
              On shift
            </span>
          </div>
        </div>

        {/* Weekly grid */}
        <Card className="mb-6 overflow-hidden">
          <div className="overflow-x-auto">
            <div
              className="grid"
              style={{ minWidth: 760, gridTemplateColumns: "160px repeat(7, 1fr)" }}
            >
              {/* Header row */}
              <div className="pl-4 py-3 text-left text-[0.66rem] uppercase tracking-[0.05em] text-[var(--xiv-blue)] font-semibold border-b border-[var(--blue-008)]">
                Staff
              </div>
              {weekDays.map((day, i) => {
                const isToday = utcDayKey(day) === todayKey
                return (
                  <div
                    key={i}
                    className={`py-3 px-2 text-center text-[0.66rem] uppercase tracking-[0.05em] font-semibold border-b border-[var(--blue-008)] ${
                      isToday ? "bg-[var(--blue-004)]" : ""
                    }`}
                  >
                    <span className={isToday ? "text-[var(--xiv-blue)]" : "text-[var(--fg-faint)]"}>
                      {DAY_SHORT[i]}
                    </span>{" "}
                    <span className={isToday ? "text-[var(--xiv-blue)]" : "text-[var(--fg-faint)] font-normal"}>
                      {day.getUTCDate()}
                    </span>
                  </div>
                )
              })}

              {/* Staff rows */}
              {staffRows.map((member) => (
                <>
                  <div
                    key={`${member.membershipId}-name`}
                    className="flex items-center gap-2.5 px-3.5 py-3 border-b border-[var(--blue-008)] text-sm min-w-0"
                  >
                    <Avatar className="w-7 h-7 flex-shrink-0">
                      <AvatarImage src={member.image ?? undefined} />
                      <AvatarFallback className="text-[0.62rem] font-bold bg-gradient-to-br from-[var(--xiv-blue)] to-blue-700 text-white">
                        {member.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-[0.82rem]">{member.name}</span>
                  </div>
                  {weekDays.map((day) => {
                    const key = utcDayKey(day)
                    const dayShifts = member.cells.get(key) ?? []
                    const isToday = key === todayKey
                    return (
                      <div
                        key={`${member.membershipId}-${key}`}
                        className={`border-b border-[var(--blue-008)] border-l border-l-[var(--blue-008)] p-1.5 flex flex-col gap-1 min-h-[58px] ${
                          isToday ? "bg-[var(--blue-004)]" : ""
                        }`}
                      >
                        {dayShifts.map((shift) => (
                          <span
                            key={shift.id}
                            className={`text-[0.66rem] font-semibold px-1.5 py-1 rounded text-center leading-tight border whitespace-nowrap ${
                              statusChip[shift.status] ?? statusChip.SCHEDULED
                            }`}
                          >
                            {fmtHour(shift.scheduledStart)}–{fmtHour(shift.scheduledEnd)}
                          </span>
                        ))}
                      </div>
                    )
                  })}
                </>
              ))}

              {/* Empty state */}
              {staffRows.length === 0 && (
                <div className="col-span-8 py-12 text-center text-sm text-muted-foreground">
                  No shifts scheduled for this week.
                  {canManage && " Use the button above to add shifts."}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Actions section — clock-in/out for shifts that need it */}
        {actionShifts.length > 0 && (
          <div>
            <h2 className="font-cinzel text-base font-bold tracking-[0.02em] mb-3">
              {activeShifts.length > 0 ? "On shift now" : "Upcoming — actions needed"}
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {actionShifts.map((shift) => (
                <Card key={shift.id}>
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={shift.membership.user?.image ?? undefined} />
                        <AvatarFallback className="text-[0.65rem] font-bold">
                          {shift.membership.user?.name?.slice(0, 2).toUpperCase() ?? "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {shift.membership.user?.name ?? "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatServerTime(shift.scheduledStart, "time")} — {formatServerTime(shift.scheduledEnd, "time")} {tzLabel}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className={statusBadge[shift.status] ?? ""}>
                          {shift.status}
                        </Badge>
                        {canManage && shift.status === "SCHEDULED" && (
                          <ClockShiftButton venueSlug={slug} shiftId={shift.id} action="clock-in" staffName={shift.membership.user?.name ?? "staff"} />
                        )}
                        {canManage && shift.status === "ACTIVE" && (
                          <ClockShiftButton venueSlug={slug} shiftId={shift.id} action="clock-out" staffName={shift.membership.user?.name ?? "staff"} />
                        )}
                        {!canManage && shift.membershipId === currentMembershipId && shift.status === "SCHEDULED" && (
                          <ClockShiftButton venueSlug={slug} shiftId={shift.id} action="clock-in" staffName="yourself" />
                        )}
                        {!canManage && shift.membershipId === currentMembershipId && shift.status === "ACTIVE" && (
                          <ClockShiftButton venueSlug={slug} shiftId={shift.id} action="clock-out" staffName="yourself" />
                        )}
                        {canManage && (
                          <DeleteShiftButton venueSlug={slug} shiftId={shift.id} hasPayroll={!!shift.payrollEntryId} />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </VenueLayout>
  )
}
