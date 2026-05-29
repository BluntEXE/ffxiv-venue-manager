import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { Breadcrumb } from "@/components/breadcrumb"
import { DashboardAnalytics } from "@/components/dashboard-analytics"
import { ServerTimeRange, ServerTime } from "@/components/server-time"
import { getServerTimezone, getServerTimeLabel } from "@/lib/server-time"
import { ShoppingBag, Clock, ScrollText, BarChart3, Calendar, Users } from "lucide-react"

export default async function VenueDashboardPage({
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
      _count: {
        select: {
          events: true,
          memberships: true,
          tasks: true,
          services: true,
          follows: true,
        },
      },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role
  const membershipId = venue.memberships[0].id
  const canManage = ["OWNER", "MANAGER"].includes(userRole)
  const canViewReports = canManage
  const timezone = getServerTimezone(venue.dataCenter)
  const tzLabel = getServerTimeLabel(venue.dataCenter)

  // Fetch my upcoming shifts (all roles see their own)
  const now = new Date()
  const myShifts = await prisma.shift.findMany({
    where: {
      venueId: venue.id,
      membershipId,
      status: { in: ["SCHEDULED", "ACTIVE"] },
      scheduledStart: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { scheduledStart: "asc" },
    take: 5,
  })

  // Fetch upcoming events (all roles)
  const upcomingEvents = await prisma.event.findMany({
    where: {
      venueId: venue.id,
      startTime: { gte: now },
      status: { in: ["PUBLISHED", "ACTIVE"] },
    },
    orderBy: { startTime: "asc" },
    take: 5,
  })

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
            { label: venue.name },
          ]}
        />

        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="font-cinzel text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide mb-2">{venue.name}</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {venue.world} ({venue.dataCenter}) &bull; {userRole.charAt(0) + userRole.slice(1).toLowerCase()} &bull; Server Time: {tzLabel}
          </p>
          {venue.location && (
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              {venue.location}
            </p>
          )}
        </div>

        {/* Stat Cards - Owner/Manager see all 4, Staff sees none */}
        {canManage && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <Link href={`/dashboard/${venue.slug}/events`}>
              <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Events</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{venue._count.events}</div>
                  <p className="text-xs text-muted-foreground mt-1">Total scheduled</p>
                </CardContent>
              </Card>
            </Link>
            <Link href={`/dashboard/${venue.slug}/staff`}>
              <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Staff</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{venue._count.memberships}</div>
                  <p className="text-xs text-muted-foreground mt-1">Active members</p>
                </CardContent>
              </Card>
            </Link>
            <Link href={`/dashboard/${venue.slug}/analytics`}>
              <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Followers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{venue._count.follows}</div>
                  <p className="text-xs text-muted-foreground mt-1">App followers</p>
                </CardContent>
              </Card>
            </Link>
            <Link href={`/dashboard/${venue.slug}/tasks`}>
              <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{venue._count.tasks}</div>
                  <p className="text-xs text-muted-foreground mt-1">Pending & active</p>
                </CardContent>
              </Card>
            </Link>
            <Link href={`/dashboard/${venue.slug}/services`}>
              <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Services</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{venue._count.services}</div>
                  <p className="text-xs text-muted-foreground mt-1">Available offerings</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        )}

        {/* My Shifts - all roles */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-cinzel text-xl font-semibold tracking-wide">My Shifts</h2>
            <Link href={`/dashboard/${venue.slug}/shifts`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              View all
            </Link>
          </div>
          {myShifts.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              {myShifts.map((shift) => {
                const isActive = shift.status === "ACTIVE"
                return (
                  <Card key={shift.id} className={isActive ? "border-emerald-500/30" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">
                            <ServerTimeRange start={shift.scheduledStart} end={shift.scheduledEnd} timezone={timezone} tzLabel={tzLabel} />
                          </p>
                          {shift.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5">{shift.notes}</p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={isActive
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]"
                          }
                        >
                          {isActive ? "On Shift" : "Upcoming"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No upcoming shifts scheduled.</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Upcoming Events - all roles */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-cinzel text-xl font-semibold tracking-wide">Upcoming Events</h2>
            <Link href={`/dashboard/${venue.slug}/events`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              View all
            </Link>
          </div>
          {upcomingEvents.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              {upcomingEvents.map((event) => (
                <Link key={event.id} href={`/dashboard/${venue.slug}/events/${event.id}`}>
                  <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{event.title}</p>
                          <p className="text-sm text-muted-foreground">
                            <ServerTimeRange
                              start={event.startTime}
                              end={event.endTime ?? event.startTime}
                              timezone={timezone}
                              tzLabel={tzLabel}
                            />
                          </p>
                        </div>
                        <Badge variant="outline">{event.eventType}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No upcoming events.</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Quick Actions - Staff view only */}
        {!canManage && (
          <div className="mb-6 md:mb-8">
            <h2 className="font-cinzel text-xl font-semibold tracking-wide mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { href: `/dashboard/${venue.slug}/sales`, icon: ShoppingBag, label: "Log a Sale", desc: "Record a transaction" },
                { href: `/dashboard/${venue.slug}/shifts`, icon: Clock, label: "My Shifts", desc: "View your schedule" },
                { href: `/dashboard/${venue.slug}/timeline`, icon: ScrollText, label: "Timeline", desc: "Live activity feed" },
                { href: `/dashboard/${venue.slug}/events`, icon: Calendar, label: "Events", desc: "Upcoming events" },
                { href: `/dashboard/${venue.slug}/tasks`, icon: BarChart3, label: "Tasks", desc: "Your assigned tasks" },
              ].map(({ href, icon: Icon, label, desc }) => (
                <Link key={href} href={href} className="group">
                  <div className="xiv-card rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 group-hover:border-[rgba(0,180,255,0.4)] group-hover:bg-[rgba(0,180,255,0.04)]">
                    <div className="h-9 w-9 rounded-lg bg-[rgba(0,180,255,0.1)] flex items-center justify-center shrink-0 group-hover:bg-[rgba(0,180,255,0.18)] transition-colors">
                      <Icon className="h-4 w-4 text-[var(--xiv-blue)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{label}</p>
                      <p className="text-xs text-muted-foreground truncate">{desc}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Analytics - Owner/Manager only */}
        {canViewReports && (
          <div className="mt-6 md:mt-8">
            <h2 className="font-cinzel text-xl font-semibold tracking-wide mb-4">Analytics Overview</h2>
            <DashboardAnalytics venueId={venue.id} />
          </div>
        )}
      </div>
    </VenueLayout>
  )
}
