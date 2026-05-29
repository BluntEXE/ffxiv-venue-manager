import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { prisma } from "@/lib/prisma"

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/auth/signin")
  }

  // Get user's venues
  const venues = await prisma.venue.findMany({
    where: {
      memberships: {
        some: {
          userId: session.user.id,
        },
      },
    },
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
        },
      },
    },
  })

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
          <div>
            <h1 className="font-cinzel text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide">Dashboard</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
              Welcome back, {session.user.name || "User"}!
            </p>
          </div>
          <Button asChild size="sm" className="sm:size-default">
            <Link href="/venues/new">
              <span className="hidden sm:inline">Create New Venue</span>
              <span className="sm:hidden">New Venue</span>
            </Link>
          </Button>
        </div>
      </div>

      {venues.length === 0 ? (
        <Card className="text-center py-12">
          <CardHeader>
            <CardTitle>No Venues Yet</CardTitle>
            <CardDescription>
              Create your first venue to start managing events, staff, and more!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg">
              <Link href="/venues/new">
                Create Your First Venue
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {venues.map((venue: typeof venues[number]) => (
            <Card key={venue.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle>{venue.name}</CardTitle>
                <CardDescription>
                  {venue.world} ({venue.dataCenter})
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {venue.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {venue.description}
                  </p>
                )}

                <div className="flex justify-between text-sm">
                  <div>
                    <p className="font-semibold">{venue._count.events}</p>
                    <p className="text-muted-foreground">Events</p>
                  </div>
                  <div>
                    <p className="font-semibold">{venue._count.memberships}</p>
                    <p className="text-muted-foreground">Staff</p>
                  </div>
                  <div>
                    <p className="font-semibold">{venue.memberships[0].role}</p>
                    <p className="text-muted-foreground">Your Role</p>
                  </div>
                </div>

                <Button asChild className="w-full">
                  <Link href={`/dashboard/${venue.slug}`}>
                    Manage Venue
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
