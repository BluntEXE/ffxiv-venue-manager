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
      dataCenter: true,
      world: true,
    },
  })

  return (
    <div className="relative min-h-screen">
      <VenueSidebar
        venueSlug={venueSlug}
        venueName={venueName}
        userRole={userRole}
        userName={session?.user?.name || undefined}
        userEmail={session?.user?.email || undefined}
        venues={venues}
      />
      {/* main: matches prototype .main { margin-left: calc(260px + 20px*2); padding: ... } */}
      <main className="[@media(min-width:1081px)]:ml-[300px] px-[18px] [@media(min-width:1081px)]:px-[24px] pt-[24px] pb-[80px] [@media(min-width:1081px)]:pb-[80px] relative z-[1]">
        {children}
      </main>
    </div>
  )
}
