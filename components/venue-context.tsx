"use client"

import { createContext, useContext, ReactNode, useState, useCallback, useEffect } from "react"

interface Venue {
  id: string
  name: string
  slug: string
  memberships?: Array<{ role: string }>
}

interface VenueContextValue {
  venues: Venue[]
  isLoading: boolean
  error: string | null
  fetchVenues: () => Promise<void>
  getVenueBySlug: (slug: string) => Venue | undefined
  invalidateCache: () => void
}

const VenueContext = createContext<VenueContextValue | undefined>(undefined)

interface VenueProviderProps {
  children: ReactNode
}

export function VenueProvider({ children }: VenueProviderProps) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)

  const fetchVenues = useCallback(async () => {
    // If already fetched, don't fetch again
    if (hasFetched && venues.length > 0) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/venues")

      if (!response.ok) {
        throw new Error("Failed to fetch venues")
      }

      const data = await response.json()
      setVenues(data)
      setHasFetched(true)
    } catch (err: any) {
      console.error("Failed to fetch venues:", err)
      setError(err.message || "Failed to load venues")
    } finally {
      setIsLoading(false)
    }
  }, [hasFetched, venues.length])

  const getVenueBySlug = useCallback(
    (slug: string) => {
      return venues.find((v) => v.slug === slug)
    },
    [venues]
  )

  const invalidateCache = useCallback(() => {
    setVenues([])
    setHasFetched(false)
  }, [])

  // Auto-fetch on mount if not fetched
  useEffect(() => {
    if (!hasFetched) {
      fetchVenues()
    }
  }, [hasFetched, fetchVenues])

  return (
    <VenueContext.Provider
      value={{
        venues,
        isLoading,
        error,
        fetchVenues,
        getVenueBySlug,
        invalidateCache,
      }}
    >
      {children}
    </VenueContext.Provider>
  )
}

export function useVenues() {
  const context = useContext(VenueContext)
  if (context === undefined) {
    throw new Error("useVenues must be used within a VenueProvider")
  }
  return context
}
