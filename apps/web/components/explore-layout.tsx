import { ReactNode } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { VenueSidebar } from "./venue-sidebar"

export async function ExploreLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)

  // Get user's first venue for sidebar context (explore pages aren't venue-specific)
  let venueSlug = ""
  let venueName = ""
  let userRole  = "STAFF"
  let venues: Array<{ id: string; name: string; slug: string; dataCenter: string; world: string }> = []

  if (session?.user?.id) {
    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        role: true,
        venue: { select: { id: true, name: true, slug: true, dataCenter: true, world: true } },
      },
    })

    if (membership) {
      venueSlug = membership.venue.slug
      venueName = membership.venue.name
      userRole  = membership.role
    }

    const allMemberships = await prisma.membership.findMany({
      where: { userId: session.user.id },
      select: {
        role: true,
        venue: { select: { id: true, name: true, slug: true, dataCenter: true, world: true } },
      },
    })
    venues = allMemberships.map(m => m.venue)
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
