import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { Breadcrumb } from "@/components/breadcrumb"

export default async function VenueDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/auth/signin")
  }

  // Await params in Next.js 15+
  const { slug } = await params

  // Get venue with user's membership
  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: {
        where: {
          userId: session.user.id,
        },
      },
      _count: {
        select: {
          events: true,
          memberships: true,
          tasks: true,
          services: true,
        },
      },
    },
  })

  if (!venue) {
    notFound()
  }

  // Check if user has access to this venue
  if (venue.memberships.length === 0) {
    redirect("/dashboard")
  }

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
            { label: venue.name },
          ]}
        />

        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-2">{venue.name}</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {venue.world} ({venue.dataCenter}) • Your role: {userRole}
          </p>
          {venue.location && (
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              📍 {venue.location}
            </p>
          )}
        </div>

        {/* Analytics Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <Link href={`/dashboard/${venue.slug}/events`}>
            <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{venue._count.events}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total scheduled
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/dashboard/${venue.slug}/staff`}>
            <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Staff</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{venue._count.memberships}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active members
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/dashboard/${venue.slug}/tasks`}>
            <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{venue._count.tasks}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pending & active
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/dashboard/${venue.slug}/services`}>
            <Card className="hover:shadow-lg hover:border-primary transition-all cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Services</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{venue._count.services}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Available offerings
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Activity (placeholder for future) */}
        <Card className="mt-6 md:mt-8">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Activity feed coming soon...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This section will show recent events, task completions, and staff updates.
            </p>
          </CardContent>
        </Card>
      </div>
    </VenueLayout>
  )
}
