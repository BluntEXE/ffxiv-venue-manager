"use client"

import { ReactNode, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { VenueSidebar } from "./venue-sidebar"
import { useVenues } from "./venue-context"

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
    return <div className="flex-1">{children}</div>
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <VenueSidebar
        venueSlug={slug}
        venueName={venueData.name}
        userRole={venueData.role}
        userName={session?.user?.name || undefined}
        userEmail={session?.user?.email || undefined}
        venues={venues}
      />
      <main className="flex-1 lg:ml-[260px]">
        {children}
      </main>
    </div>
  )
}
