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
      createdBy: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      startTime: "asc",
    },
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
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
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
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">Events</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
              Manage your venue's events and schedule
            </p>
          </div>
          <Button asChild size="sm" className="sm:size-default self-start">
            <Link href={`/dashboard/${slug}/events/new`}>
              <span className="hidden sm:inline">Create Event</span>
              <span className="sm:hidden">New Event</span>
            </Link>
          </Button>
        </div>

      {/* View Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={view === "list" ? "default" : "outline"}
          asChild
        >
          <Link href={`/dashboard/${slug}/events?view=list`}>
            List View
          </Link>
        </Button>
        <Button
          variant={view === "calendar" ? "default" : "outline"}
          asChild
        >
          <Link href={`/dashboard/${slug}/events?view=calendar`}>
            Calendar View
          </Link>
        </Button>
      </div>

      {view === "calendar" ? (
        <EventsCalendar events={events} venueSlug={slug} />
      ) : (
        <>
          {/* Upcoming Events */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              Upcoming Events ({upcomingEvents.length})
            </h2>
            {upcomingEvents.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">
                    No events yet. Check back soon or ask your manager about upcoming events.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {upcomingEvents.map((event: typeof upcomingEvents[number]) => (
                  <Card key={event.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle>{event.title}</CardTitle>
                          <CardDescription className="mt-2">
                            {formatServerTime(event.startTime, "datelong")} at {formatServerTime(event.startTime, "time")} - {formatServerTime(event.endTime, "time")} {SERVER_TIME_LABEL}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Badge className={statusColors[event.status as keyof typeof statusColors]}>
                            {event.status}
                          </Badge>
                          <Badge variant="outline">
                            {typeLabels[event.eventType as keyof typeof typeLabels]}
                          </Badge>
                          {event.partakeEventId && (
                            <Badge variant="outline" className="border-[rgba(0,180,255,0.4)] text-[var(--xiv-blue)]">
                              Partake
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {event.location && (
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-1">
                          📍 {event.location}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/${slug}/events/${event.id}`}>
                            View Details
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/${slug}/events/${event.id}/edit`}>
                            Edit
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Past Events */}
          {pastEvents.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">
                Past Events ({pastEvents.length})
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {pastEvents.map((event: typeof pastEvents[number]) => (
                  <Card key={event.id} className="opacity-75">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle>{event.title}</CardTitle>
                          <CardDescription className="mt-2">
                            {formatServerTime(event.startTime, "datelong")} at {formatServerTime(event.startTime, "time")} {SERVER_TIME_LABEL}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Badge className={statusColors[event.status as keyof typeof statusColors]}>
                            {event.status}
                          </Badge>
                          <Badge variant="outline">
                            {typeLabels[event.eventType as keyof typeof typeLabels]}
                          </Badge>
                          {event.partakeEventId && (
                            <Badge variant="outline" className="border-[rgba(0,180,255,0.4)] text-[var(--xiv-blue)]">
                              Partake
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/${slug}/events/${event.id}`}>
                          View Details
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </VenueLayout>
  )
}
