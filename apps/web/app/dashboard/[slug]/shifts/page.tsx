import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { Breadcrumb } from "@/components/breadcrumb"
import { CreateShiftDialog } from "@/components/create-shift-dialog"
import { ServerTimeRange } from "@/components/server-time"
import { getServerTimezone, getServerTimeLabel } from "@/lib/server-time"
import { DeleteShiftButton } from "@/components/delete-shift-button"
import { ClockShiftButton } from "@/components/clock-shift-button"

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  MISSED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
}

export default async function ShiftsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect("/auth/signin")
  }

  const { slug } = await params

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: {
        where: { userId: session.user.id },
      },
    },
  })

  if (!venue || venue.memberships.length === 0) {
    notFound()
  }

  const userRole = venue.memberships[0].role
  const currentMembershipId = venue.memberships[0].id
  const canManage = ["OWNER", "MANAGER"].includes(userRole)
  const timezone = getServerTimezone(venue.dataCenter)
  const tzLabel = getServerTimeLabel(venue.dataCenter)

  // Fetch shifts: past 7 days + next 30 days
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const shifts = await prisma.shift.findMany({
    where: {
      venueId: venue.id,
      scheduledStart: { gte: from, lte: to },
    },
    include: {
      membership: {
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
      },
    },
    orderBy: { scheduledStart: "asc" },
  })

  // Staff list for the create dialog
  const activeStaff = await prisma.membership.findMany({
    where: { venueId: venue.id, status: "active", userId: { not: null } },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  })

  const staffForDialog = activeStaff.map((m) => ({
    id: m.id,
    name: m.user?.name ?? "Unknown",
    image: m.user?.image ?? null,
  }))

  // Group shifts
  const activeShifts = shifts.filter((s) => s.status === "ACTIVE")
  const upcomingShifts = shifts.filter((s) => s.status === "SCHEDULED")
  const pastShifts = shifts.filter((s) =>
    ["COMPLETED", "MISSED", "CANCELLED"].includes(s.status)
  )

  return (
    <VenueLayout
      venueSlug={venue.slug}
      venueName={venue.name}
      userRole={userRole}
    >
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: venue.name, href: `/dashboard/${slug}` },
            { label: "Shifts" },
          ]}
        />

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">Shifts</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
              Schedule and track staff shifts &middot; Times shown in Server Time ({tzLabel})
            </p>
          </div>
          {canManage && (
            <CreateShiftDialog venueSlug={slug} staff={staffForDialog} timezone={timezone} tzLabel={tzLabel} />
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Active Now</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{activeShifts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{upcomingShifts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {pastShifts.filter((s) => s.status === "COMPLETED").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{activeStaff.length}</div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {/* Active Shifts */}
          {activeShifts.length > 0 && (
            <div>
              <h2 className="text-xl font-bold mb-4">On Shift Now</h2>
              <div className="grid grid-cols-1 gap-3">
                {activeShifts.map((shift) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    slug={slug}
                    canManage={canManage}
                    currentMembershipId={currentMembershipId}
                    timezone={timezone}
                    tzLabel={tzLabel}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {upcomingShifts.length > 0 && (
            <div>
              <h2 className="text-xl font-bold mb-4">Upcoming</h2>
              <div className="grid grid-cols-1 gap-3">
                {upcomingShifts.map((shift) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    slug={slug}
                    canManage={canManage}
                    currentMembershipId={currentMembershipId}
                    timezone={timezone}
                    tzLabel={tzLabel}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Past */}
          {pastShifts.length > 0 && (
            <div>
              <h2 className="text-xl font-bold mb-4">Recent</h2>
              <div className="grid grid-cols-1 gap-3">
                {pastShifts.map((shift) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    slug={slug}
                    canManage={canManage}
                    currentMembershipId={currentMembershipId}
                    timezone={timezone}
                    tzLabel={tzLabel}
                  />
                ))}
              </div>
            </div>
          )}

          {shifts.length === 0 && (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-muted-foreground">
                  No shifts scheduled yet.
                  {canManage
                    ? " Use the button above to schedule your first shift."
                    : " Your manager will schedule shifts for you."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </VenueLayout>
  )
}

function ShiftCard({
  shift,
  slug,
  canManage,
  currentMembershipId,
  timezone,
  tzLabel,
}: {
  shift: any
  slug: string
  canManage: boolean
  currentMembershipId: string
  timezone: string
  tzLabel: string
}) {
  let hoursWorked: string | null = null
  if (shift.actualStart && shift.actualEnd) {
    const ms =
      new Date(shift.actualEnd).getTime() -
      new Date(shift.actualStart).getTime()
    const h = Math.round((ms / (1000 * 60 * 60)) * 10) / 10
    hoursWorked = `${h}h worked`
  }

  return (
    <Card>
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={shift.membership.user?.image || undefined} />
              <AvatarFallback>
                {shift.membership.user?.name?.substring(0, 2).toUpperCase() || "??"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">
                {shift.membership.user?.name || "Unknown"}
              </p>
              <p className="text-sm text-muted-foreground">
                <ServerTimeRange start={shift.scheduledStart} end={shift.scheduledEnd} timezone={timezone} tzLabel={tzLabel} />
              </p>
              {shift.notes && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {shift.notes}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hoursWorked && (
              <span className="text-xs text-muted-foreground">
                {hoursWorked}
              </span>
            )}
            <Badge
              variant="outline"
              className={statusColors[shift.status] ?? ""}
            >
              {shift.status}
            </Badge>
            {canManage && shift.status === 'SCHEDULED' && (
              <ClockShiftButton
                venueSlug={slug}
                shiftId={shift.id}
                action="clock-in"
                staffName={shift.membership.user?.name || 'staff'}
              />
            )}
            {canManage && shift.status === 'ACTIVE' && (
              <ClockShiftButton
                venueSlug={slug}
                shiftId={shift.id}
                action="clock-out"
                staffName={shift.membership.user?.name || 'staff'}
              />
            )}
            {!canManage && shift.membershipId === currentMembershipId && shift.status === 'SCHEDULED' && (
              <ClockShiftButton
                venueSlug={slug}
                shiftId={shift.id}
                action="clock-in"
                staffName="yourself"
              />
            )}
            {!canManage && shift.membershipId === currentMembershipId && shift.status === 'ACTIVE' && (
              <ClockShiftButton
                venueSlug={slug}
                shiftId={shift.id}
                action="clock-out"
                staffName="yourself"
              />
            )}
            {canManage && (
              <DeleteShiftButton
                venueSlug={slug}
                shiftId={shift.id}
                hasPayroll={!!shift.payrollEntryId}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
