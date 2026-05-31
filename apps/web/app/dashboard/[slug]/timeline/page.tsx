import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { Breadcrumb } from "@/components/breadcrumb"
import { TimelineFeed } from "@/components/timeline-feed"

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params
  const { type } = await searchParams

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
  const initialFilter = type === "sales" || type === "patrons" ? type : "all"

  return (
    <VenueLayout
      venueSlug={venue.slug}
      venueName={venue.name}
      userRole={userRole}
    >
      <div className="p-4 md:p-6">
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: venue.name, href: `/dashboard/${slug}` },
            { label: "Timeline" },
          ]}
        />

        <div className="mb-6 md:mb-8">
          <h1 className="font-cinzel text-2xl md:text-3xl font-bold tracking-[0.02em]">Timeline</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
            All venue activity in one feed
          </p>
        </div>

        <TimelineFeed venueId={venue.id} initialFilter={initialFilter} />
      </div>
    </VenueLayout>
  )
}
