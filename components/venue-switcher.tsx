"use client"

import { useRouter, usePathname } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Venue {
  id: string
  name: string
  slug: string
}

interface VenueSwitcherProps {
  venues: Venue[]
  currentSlug?: string
}

export function VenueSwitcher({ venues, currentSlug }: VenueSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()

  const handleVenueChange = (slug: string) => {
    // Only swap segment 2 when the current path is already inside a
    // venue-slug-scoped route (e.g. /dashboard/my-venue/shifts). If we're
    // on an account-scoped page like /dashboard/account/characters or
    // /dashboard/api-keys, that segment is NOT a venue slug, and blindly
    // overwriting it produces a 404 (e.g. /dashboard/my-venue/characters
    // has no such page). In that case, jump to the venue root instead.
    const knownSlugs = new Set(venues.map((v) => v.slug))
    if (pathname.startsWith("/dashboard/")) {
      const pathParts = pathname.split("/")
      if (pathParts[2] && knownSlugs.has(pathParts[2])) {
        pathParts[2] = slug
        router.push(pathParts.join("/"))
        return
      }
    }
    router.push(`/dashboard/${slug}`)
  }

  if (venues.length <= 1) {
    // Don't show switcher if user only has one venue
    return null
  }

  return (
    <div className="w-[200px]">
      <Select value={currentSlug} onValueChange={handleVenueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select venue" />
        </SelectTrigger>
        <SelectContent>
          {venues.map((venue) => (
            <SelectItem key={venue.id} value={venue.slug}>
              {venue.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
