"use client"

import { ReactNode, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { VenueSidebar } from "./venue-sidebar"
import { useVenues } from "./venue-context"
import { ActiveVenueTracker } from "./active-venue-tracker"

interface VenueLayoutClientProps {
  children: ReactNode
  slug: string
}

export function VenueLayoutClient({ children, slug }: VenueLayoutClientProps) {
  const { data: session } = useSession()
  const { venues, getVenueBySlug, isLoading } = useVenues()
  const [venueData, setVenueData] = useState<{
    name: string
    role: string
  } | null>(null)

  useEffect(() => {
    if (!slug || isLoading) return

    const venue = getVenueBySlug(slug)
    if (venue && venue.memberships?.[0]) {
      setVenueData({
        name: venue.name,
        role: venue.memberships[0].role,
      })
    }
  }, [slug, getVenueBySlug, isLoading])

  if (!venueData) {
    return <div className="[@media(min-width:1081px)]:ml-[300px] relative z-[1]">{children}</div>
  }

  return (
    <div className="relative min-h-screen">
      <ActiveVenueTracker slug={slug} />
      <VenueSidebar
        venueSlug={slug}
        venueName={venueData.name}
        userRole={venueData.role}
        userName={session?.user?.name || undefined}
        userEmail={session?.user?.email || undefined}
        venues={venues}
      />
      <main className="[@media(min-width:1081px)]:ml-[300px] relative z-[1]">
        {children}
      </main>
    </div>
  )
}
