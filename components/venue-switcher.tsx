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
    // If we're on a dashboard page, navigate to the new venue's dashboard
    if (pathname.includes("/dashboard/")) {
      const pathParts = pathname.split("/")
      pathParts[2] = slug // Replace the slug in the path
      router.push(pathParts.join("/"))
    } else {
      // Otherwise, just go to the venue's main dashboard
      router.push(`/dashboard/${slug}`)
    }
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
