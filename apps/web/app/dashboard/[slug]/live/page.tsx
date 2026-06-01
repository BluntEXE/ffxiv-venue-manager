import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { LiveDashboard } from "@/components/live-dashboard"

export default async function LivePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: {
        where: { userId: session.user.id },
      },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role
  const canManage = ["OWNER", "MANAGER"].includes(userRole)
  const settings = (venue.settings as any) ?? {}
  const showRevenue =
    canManage ||
    settings.revenueVisibility === "all" ||
    (settings.revenueVisibility === "own")

  // Find the currently active event (or the next upcoming one)
  const now = new Date()
  let activeEvent = await prisma.event.findFirst({
    where: {
      venueId: venue.id,
      status: "ACTIVE",
    },
    include: {
      transactions: {
        select: { amount: true, staffId: true },
      },
    },
  })

  // If no active event, check for one starting within 30 minutes
  let isUpcoming = false
  if (!activeEvent) {
    const soon = new Date(now.getTime() + 30 * 60 * 1000)
    const upcoming = await prisma.event.findFirst({
      where: {
        venueId: venue.id,
        status: "PUBLISHED",
        startTime: { lte: soon, gte: now },
      },
      include: {
        transactions: {
          select: { amount: true, staffId: true },
        },
      },
      orderBy: { startTime: "asc" },
    })
    if (upcoming) {
      activeEvent = upcoming
      isUpcoming = true
    }
  }

  // Get current patron count
  const patronCount = activeEvent
    ? await prisma.patronLog.count({
        where: {
          venueId: venue.id,
          action: "ENTER",
          timestamp: { gte: activeEvent.startTime },
        },
      }) -
      await prisma.patronLog.count({
        where: {
          venueId: venue.id,
          action: "LEAVE",
          timestamp: { gte: activeEvent.startTime },
        },
      })
    : 0

  // Calculate revenue (respect visibility)
  let totalRevenue = 0
  let personalRevenue = 0
  if (activeEvent) {
    for (const tx of activeEvent.transactions) {
      const amt = Number(tx.amount)
      totalRevenue += amt
      if (tx.staffId === session.user.id) personalRevenue += amt
    }
  }

  const revenueDisplay =
    canManage
      ? totalRevenue
      : settings.revenueVisibility === "all"
        ? totalRevenue
        : settings.revenueVisibility === "own"
          ? personalRevenue
          : null

  // Patron roster (recent ENTERs, crude in-venue list)
  const patronRoster = activeEvent ? await prisma.patronLog.findMany({
    where: { venueId: venue.id, action: "ENTER", loggedAt: { gte: activeEvent.startTime } },
    orderBy: { loggedAt: "desc" },
    take: 20,
    select: { characterName: true, loggedAt: true },
  }) : []

  // On-shift staff
  const activeShifts = await prisma.shift.findMany({
    where: { venueId: venue.id, status: "ACTIVE" },
    include: {
      membership: {
        include: { user: { select: { name: true, image: true } } },
      },
    },
    take: 10,
  })

  // New patrons tonight (first visit this event)
  const newTonightCount = activeEvent ? await prisma.patronLog.count({
    where: { venueId: venue.id, action: "ENTER", loggedAt: { gte: activeEvent.startTime } },
  }) : 0

  return (
    <VenueLayout
      venueSlug={venue.slug}
      venueName={venue.name}
      userRole={userRole}
    >
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-4">
          <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">{venue.name} &middot; {venue.dataCenter} &middot; {venue.world}</span>
        </div>

        {activeEvent ? (
          <LiveDashboard
            venueId={venue.id}
            event={{
              id: activeEvent.id,
              title: activeEvent.title,
              eventType: activeEvent.eventType,
              startTime: activeEvent.startTime.toISOString(),
              endTime: activeEvent.endTime.toISOString(),
              status: activeEvent.status,
            }}
            isUpcoming={isUpcoming}
            initialPatronCount={Math.max(0, patronCount)}
            initialRevenue={revenueDisplay}
            initialSaleCount={activeEvent.transactions.length}
            initialNewTonight={newTonightCount}
            showRevenue={showRevenue}
            revenueLabel={
              canManage || settings.revenueVisibility === "all"
                ? "Total Revenue"
                : "My Sales"
            }
            patronRoster={patronRoster.map(p => ({
              name: p.characterName ?? "Unknown",
              arrivedAt: p.loggedAt.toISOString(),
            }))}
            onShiftStaff={activeShifts.map(s => ({
              name: s.membership?.user?.name ?? s.membership?.invitedName ?? "Staff",
              role: s.membership?.role ?? "STAFF",
            }))}
          />
        ) : (
          <div className="mt-2">
            <h1 className="font-cinzel text-2xl md:text-3xl font-bold tracking-[0.02em] mb-4">Live Mode</h1>
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No active or upcoming events.
                  {canManage
                    ? " Create an event and set it to Active to use Live Mode."
                    : " Live Mode activates when an event is running."}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </VenueLayout>
  )
}
