import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { CreateShiftDialog } from "@/components/create-shift-dialog"
import { ShiftsCalendar } from "@/components/shifts-calendar"
import { ShiftsWeekView } from "@/components/shifts-week-view"
import { resolveDisplayName } from "@/lib/display-name"
import { shiftSelect } from "@/lib/shift-format"

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

export default async function ShiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ w?: string; view?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params
  const { w, view = "week" } = await searchParams

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

  // Single "now" for this request — every other date derived below reuses
  // it, so nothing here can disagree with anything else in the same render.
  const now = new Date()

  // Week bounds
  const base = w ? new Date(w + "T00:00:00Z") : now
  const weekStart = getWeekMonday(base)
  const weekEnd = addUTCDays(weekStart, 7) // exclusive upper bound

  const FETCH_LOOKBACK_MS = 24 * 60 * 60 * 1000 // covers the full negative-offset range (UTC-12); positive offsets never shift the day backward from weekStart's UTC grid
  const fetchWindowStart = new Date(weekStart.getTime() - FETCH_LOOKBACK_MS)
  const fetchWindowEnd = weekEnd

  const todayKeyST = utcDayKey(now)
  const thisWeekKey = utcDayKey(getWeekMonday(now))
  const isCurrentWeek = utcDayKey(weekStart) === thisWeekKey

  const prevWeekParam = utcDayKey(addUTCDays(weekStart, -7))
  const nextWeekParam = utcDayKey(addUTCDays(weekStart, 7))

  // Fetch shifts for this week + count of active shifts (may have started before this week)
  const [weekShifts, activeCount] = await Promise.all([
    prisma.shift.findMany({
      where: {
        venueId: venue.id,
        scheduledStart: { gte: fetchWindowStart, lt: fetchWindowEnd },
      },
      select: shiftSelect,
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.shift.count({
      where: { venueId: venue.id, status: "ACTIVE" },
    }),
  ])

  // Calendar view only: 6-month rolling window (3 back, 3 forward), independent
  // of the week grid's ?w= offset. Only fetched when actually viewing the
  // calendar tab, to avoid pulling months of shift history on every page load.
  const calendarShifts = view === "calendar"
    ? await prisma.shift.findMany({
        where: {
          venueId: venue.id,
          scheduledStart: {
            gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)),
            lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 1)),
          },
        },
        // Explicit select (not include) — this array is passed whole into a
        // client component (ShiftsCalendar). Prisma's Decimal fields (e.g.
        // hoursWorked) can't cross the server/client boundary, so only the
        // fields CalendarShift (lib/shift-format.ts) actually declares are
        // selected here.
        select: {
          id: true,
          membershipId: true,
          roleId: true,
          payrollEntryId: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
          notes: true,
          recurrenceRule: true,
          parentShiftId: true,
          slotGroupId: true,
          membership: {
            select: {
              nickname: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  image: true,
                  characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
                },
              },
            },
          },
          role: { select: { name: true } },
        },
        orderBy: { scheduledStart: "asc" },
      })
    : []

  // Staff list for create dialog
  const activeStaff = await prisma.membership.findMany({
    where: { venueId: venue.id, status: "active", userId: { not: null } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          displayName: true,
          image: true,
          characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
        },
      },
    },
  })
  const staffForDialog = activeStaff.map((m) => ({
    id: m.id,
    name: resolveDisplayName({
      characterName: m.user?.characters?.[0]?.characterName,
      nickname: m.nickname,
      displayName: m.user?.displayName,
      discordName: m.user?.name,
    }),
    image: m.user?.image ?? null,
  }))

  const venueRoles = await prisma.role.findMany({
    where: { venueId: venue.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  const venuePotSettings = await prisma.venuePotSettings.findUnique({
    where: { venueId: venue.id },
  })
  const potModeEnabled = venuePotSettings?.enabled ?? false

  const venueEvents = potModeEnabled
    ? await prisma.event.findMany({
        where: { venueId: venue.id },
        select: { id: true, title: true },
        orderBy: { startTime: "desc" },
        take: 50,
      })
    : []
  const eventsForDialog = venueEvents.map((e) => ({ id: e.id, name: e.title }))

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        {/* Header */}
        <div className="head-row">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">{venue.name} &middot; {venue.dataCenter} &middot; {venue.world}</span>
            </div>
            <h1 className="page-h1">Shifts</h1>
          </div>
          {canManage && (
            <CreateShiftDialog
              venueSlug={slug}
              staff={staffForDialog}
              roles={venueRoles}
              potModeEnabled={potModeEnabled}
              events={eventsForDialog}
            />
          )}
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1">
            {([
              { key: "week", label: "Week" },
              { key: "calendar", label: "Calendar" },
            ] as const).map(({ key, label }) => (
              <Link
                key={key}
                href={`/dashboard/${slug}/shifts?view=${key}`}
                className={`text-sm font-semibold px-3 sm:px-4 py-1.5 rounded-full transition-colors ${
                  view === key
                    ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {view === "calendar" ? (
          <ShiftsCalendar
            shifts={calendarShifts}
            currentMembershipId={currentMembershipId}
            canManage={canManage}
            venueSlug={slug}
            venueId={venue.id}
            staffForDialog={staffForDialog}
            roles={venueRoles}
            todayKeyST={todayKeyST}
          />
        ) : (
        <>
        {/* Week nav toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full px-1 py-1">
            <Link
              href={`/dashboard/${slug}/shifts?w=${prevWeekParam}`}
              className="w-8 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] transition-colors"
            >
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </Link>
            <Link
              href={`/dashboard/${slug}/shifts?w=${nextWeekParam}`}
              className="w-8 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] transition-colors"
            >
              <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          </div>
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

        <ShiftsWeekView
          weekShifts={weekShifts}
          activeCount={activeCount}
          weekStartISO={weekStart.toISOString()}
          todayKeyST={todayKeyST}
          isCurrentWeek={isCurrentWeek}
          fmtWeekLabelST={fmtWeekLabel(weekStart)}
          slug={slug}
          venueId={venue.id}
          currentMembershipId={currentMembershipId}
          canManage={canManage}
          staffForDialog={staffForDialog}
          venueRoles={venueRoles}
          potModeEnabled={potModeEnabled}
          eventsForDialog={eventsForDialog}
        />
        </>
        )}
      </div>
    </VenueLayout>
  )
}
