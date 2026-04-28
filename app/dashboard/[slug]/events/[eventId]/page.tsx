import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { prisma } from "@/lib/prisma"
import { DeleteEventButton } from "@/components/delete-event-button"
import { PatronTracking } from "@/components/patron-tracking"
import { EventAttendanceChart } from "@/components/event-attendance-chart"
import { ServerTime, SERVER_TIME_LABEL } from "@/components/server-time"

const statusColors = {
  DRAFT: "bg-zinc-500",
  PUBLISHED: "bg-blue-500",
  ACTIVE: "bg-emerald-500",
  COMPLETED: "bg-purple-500",
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

export default async function EventDetailsPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const { slug, eventId } = await params

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

  // Get event
  const event = await prisma.event.findUnique({
    where: { id: eventId, venueId: venue.id },
    include: {
      createdBy: {
        select: {
          name: true,
          image: true,
        },
      },
    },
  })

  if (!event) {
    notFound()
  }

  const userRole = venue.memberships[0].role
  const canEdit = ["OWNER", "MANAGER"].includes(userRole)

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-4xl font-bold mb-2 break-words">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge className={statusColors[event.status as keyof typeof statusColors]}>
              {event.status}
            </Badge>
            <Badge variant="outline">
              {typeLabels[event.eventType as keyof typeof typeLabels]}
            </Badge>
            {event.partakeEventId && (
              <Badge variant="outline" className="border-indigo-500/50 text-indigo-400">
                Partake
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {event.partakeEventId
              ? "Synced from Partake.gg"
              : `Created by ${event.createdBy.name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/${slug}/events`}>← Back</Link>
          </Button>
          {canEdit && (
            <>
              <Button size="sm" asChild>
                <Link href={`/dashboard/${slug}/events/${eventId}/edit`}>
                  Edit
                </Link>
              </Button>
              <DeleteEventButton
                venueId={venue.id}
                eventId={eventId}
                venueSlug={slug}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>Event Description</CardTitle>
            </CardHeader>
            <CardContent>
              {event.description ? (
                <p className="whitespace-pre-wrap">{event.description}</p>
              ) : (
                <p className="text-muted-foreground">No description provided</p>
              )}
            </CardContent>
          </Card>

          {/* Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Event Metrics</CardTitle>
              <CardDescription>Final totals after event completion</CardDescription>
            </CardHeader>
            <CardContent className={`grid gap-4 grid-cols-2 ${event.partakeAttendeeCount ? "sm:grid-cols-3" : ""}`}>
              <div>
                <p className="text-sm text-muted-foreground">Final Attendance</p>
                <p className="text-2xl font-bold">
                  {event.attendanceCount || "-"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  From patron tracking
                </p>
              </div>
              {event.partakeAttendeeCount && (
                <div>
                  <p className="text-sm text-muted-foreground">Partake RSVPs</p>
                  <p className="text-2xl font-bold text-indigo-400">
                    {event.partakeAttendeeCount}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    From Partake.gg
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold">
                  {event.revenue ? `${event.revenue} Gil` : "-"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  From transactions
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Patron Tracking - Show for published and active events */}
          {(event.status === "PUBLISHED" || event.status === "ACTIVE") && (
            <div className="space-y-6">
              <PatronTracking venueId={venue.id} eventId={eventId} />
              <EventAttendanceChart venueId={venue.id} eventId={eventId} />
            </div>
          )}

          {/* Show chart for completed events too, but not the live tracker */}
          {event.status === "COMPLETED" && (
            <EventAttendanceChart venueId={venue.id} eventId={eventId} />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Date & Time */}
          <Card>
            <CardHeader>
              <CardTitle>Date & Time</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Start</p>
                <p className="font-semibold">
                  <ServerTime date={event.startTime} formatStr="datelong" />
                </p>
                <p className="text-sm">
                  <ServerTime date={event.startTime} formatStr="time" /> {SERVER_TIME_LABEL}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">End</p>
                <p className="font-semibold">
                  <ServerTime date={event.endTime} formatStr="datelong" />
                </p>
                <p className="text-sm">
                  <ServerTime date={event.endTime} formatStr="time" /> {SERVER_TIME_LABEL}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Timezone</p>
                <p className="text-sm">{event.timezone}</p>
              </div>
            </CardContent>
          </Card>

          {/* Partake Source */}
          {event.partakeEventId && (
            <Card className="border-indigo-500/20 bg-indigo-500/5">
              <CardHeader>
                <CardTitle className="text-sm">Synced from Partake</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Partake Event ID</p>
                  <p className="text-sm font-mono">{event.partakeEventId}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  This event was automatically imported from Partake.gg and syncs hourly.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Venue Info */}
          <Card>
            <CardHeader>
              <CardTitle>Venue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{venue.name}</p>
              <p className="text-sm text-muted-foreground">
                {venue.world} ({venue.dataCenter})
              </p>
              {venue.location && (
                <p className="text-sm text-muted-foreground mt-2">
                  📍 {venue.location}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
