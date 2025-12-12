import { VenueSidebar } from "./venue-sidebar"
import { ReactNode } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface VenueLayoutProps {
  children: ReactNode
  venueSlug: string
  venueName: string
  userRole: string
}

export async function VenueLayout({
  children,
  venueSlug,
  venueName,
  userRole,
}: VenueLayoutProps) {
  const session = await getServerSession(authOptions)

  // Fetch all user's venues for venue switcher
  const venues = await prisma.venue.findMany({
    where: {
      memberships: {
        some: {
          userId: session?.user?.id,
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  })

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <VenueSidebar
        venueSlug={venueSlug}
        venueName={venueName}
        userRole={userRole}
        userName={session?.user?.name || undefined}
        userEmail={session?.user?.email || undefined}
        venues={venues}
      />
      <main className="flex-1 lg:ml-[292px] p-4 transition-all duration-300">
        {children}
      </main>
    </div>
  )
}
