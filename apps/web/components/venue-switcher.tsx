"use client"

import { useRouter, usePathname } from "next/navigation"
import { ChevronDownIcon, Building2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

interface Venue {
  id: string
  name: string
  slug: string
}

interface VenueSwitcherProps {
  venues: Venue[]
}

export function VenueSwitcher({ venues }: VenueSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()

  const handleVenueChange = (slug: string) => {
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

  if (venues.length <= 1) return null

  // Detect current venue from URL
  const pathParts = pathname?.split("/") || []
  const currentSlug = pathParts[2] && venues.some((v) => v.slug === pathParts[2])
    ? pathParts[2]
    : null
  const currentVenue = venues.find((v) => v.slug === currentSlug)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-1.5 px-2.5 h-9 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-[rgba(0,180,255,0.06)] border border-transparent hover:border-[rgba(0,180,255,0.2)] rounded-lg transition-all"
        >
          <Building2 className="h-3.5 w-3.5 text-[var(--xiv-blue)] opacity-70 shrink-0" />
          <span className="max-w-[140px] truncate">
            {currentVenue ? currentVenue.name : "Switch Venue"}
          </span>
          <ChevronDownIcon className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-48">
        {venues.map((venue) => (
          <DropdownMenuItem
            key={venue.id}
            onClick={() => handleVenueChange(venue.slug)}
            className={venue.slug === currentSlug ? "text-[var(--xiv-blue)]" : ""}
          >
            {venue.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
