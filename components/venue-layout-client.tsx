"use client"

import { ReactNode, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { VenueSidebar } from "./venue-sidebar"

interface VenueLayoutClientProps {
  children: ReactNode
  slug: string
}

export function VenueLayoutClient({ children, slug }: VenueLayoutClientProps) {
  const { data: session } = useSession()
  const [venueData, setVenueData] = useState<{
    name: string
    role: string
  } | null>(null)
  const [allVenues, setAllVenues] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return

    // AbortController to cancel fetch on unmount or slug change
    const abortController = new AbortController()
    let retryTimeout: NodeJS.Timeout

    const fetchVenueData = async (retryCount = 0) => {
      try {
        setError(null)
        const response = await fetch(`/api/venues?slug=${slug}`, {
          signal: abortController.signal,
        })

        if (response.status === 429 && retryCount < 2) {
          // Rate limited - retry after 1 second
          retryTimeout = setTimeout(() => fetchVenueData(retryCount + 1), 1000)
          return
        }

        if (response.ok) {
          const venues = await response.json()
          setAllVenues(venues) // Store all venues for venue switcher
          const venue = venues.find((v: any) => v.slug === slug)
          if (venue && venue.memberships?.[0]) {
            setVenueData({
              name: venue.name,
              role: venue.memberships[0].role,
            })
          }
        }
      } catch (error: any) {
        // Ignore AbortError (happens on navigation)
        if (error.name === 'AbortError') return

        console.error("Failed to fetch venue data:", error)
        setError("Failed to load venue data")
      }
    }

    fetchVenueData()

    // Cleanup: abort fetch on unmount or slug change
    return () => {
      abortController.abort()
      if (retryTimeout) clearTimeout(retryTimeout)
    }
  }, [slug])

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
        venues={allVenues}
      />
      <main className="flex-1 lg:ml-[260px]">
        {children}
      </main>
    </div>
  )
}
