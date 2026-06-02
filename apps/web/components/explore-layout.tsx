import { ReactNode } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { VenueSidebar } from "./venue-sidebar"

export async function ExploreLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)

  let venueSlug = ""
  let venueName = ""
  let userRole  = "STAFF"
  let venues: Array<{ id: string; name: string; slug: string; dataCenter: string; world: string }> = []

  if (session?.user?.id) {
    // Read last-active venue from cookie set by VenueLayout/VenueLayoutClient
    const cookieStore = await cookies()
    const activeSlug = cookieStore.get("xiv-active-venue")?.value

    const allMemberships = await prisma.membership.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        venue: { select: { id: true, name: true, slug: true, dataCenter: true, world: true } },
      },
    })
    venues = allMemberships.map(m => m.venue)

    // Prefer cookie (last visited dashboard venue), fall back to oldest
    const preferred = activeSlug
      ? allMemberships.find(m => m.venue.slug === activeSlug)
      : null
    const membership = preferred ?? allMemberships[0]

    if (membership) {
      venueSlug = membership.venue.slug
      venueName = membership.venue.name
      userRole  = membership.role
    }
  }

  return (
    <div className="relative min-h-screen">
      {venueSlug && (
        <VenueSidebar
          venueSlug={venueSlug}
          venueName={venueName}
          userRole={userRole}
          userName={session?.user?.name || undefined}
          userEmail={session?.user?.email || undefined}
          venues={venues}
        />
      )}
      <main className={`${venueSlug ? "[@media(min-width:1081px)]:ml-[300px]" : ""} relative z-[1]`}>
        {children}
      </main>
    </div>
  )
}
