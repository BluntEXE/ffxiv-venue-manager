"use client"

import { useRouter, usePathname } from "next/navigation"
import { ChevronsUpDown, Crown, Store } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Venue {
  id: string
  name: string
  slug: string
  dataCenter?: string
  world?: string
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
      const parts = pathname.split("/")
      if (parts[2] && knownSlugs.has(parts[2])) {
        parts[2] = slug
        router.push(parts.join("/"))
        return
      }
    }
    router.push(`/dashboard/${slug}`)
  }

  // Detect current venue from URL
  const parts = pathname?.split("/") || []
  const currentSlug = parts[2] && venues.some((v) => v.slug === parts[2]) ? parts[2] : null
  const current = venues.find((v) => v.slug === currentSlug) ?? venues[0]

  if (!current) return null

  const trigger = (
    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--blue-015)] bg-card hover:border-[var(--blue-035)] transition-colors cursor-pointer group">
      {/* Icon badge */}
      <span className="w-9 h-9 rounded-lg bg-[var(--blue-010)] border border-[var(--blue-018)] flex items-center justify-center flex-shrink-0 group-hover:border-[var(--blue-035)] transition-colors">
        <Store className="w-5 h-5 text-[var(--xiv-blue)]" />
      </span>
      {/* Venue info */}
      <span className="flex-1 min-w-0 text-left">
        <span className="flex items-center gap-1 text-sm font-semibold leading-tight truncate">
          <Crown className="w-3 h-3 text-[var(--warning)] flex-shrink-0" />
          <span className="truncate">{current.name}</span>
        </span>
        {(current.dataCenter || current.world) && (
          <span className="text-[0.68rem] text-[var(--fg-faint)] font-mono leading-tight block mt-0.5 truncate">
            {[current.dataCenter, current.world].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      {/* Chevrons — only shown when there are multiple venues */}
      {venues.length > 1 && (
        <ChevronsUpDown className="w-4 h-4 text-[var(--fg-faint)] flex-shrink-0" />
      )}
    </button>
  )

  if (venues.length <= 1) return trigger

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        className="w-[240px] border-[var(--blue-018)]"
        style={{ background: "rgba(7,11,20,0.97)", backdropFilter: "blur(16px)" }}
      >
        <p className="px-3 pt-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--fg-faint)]">
          Switch venue
        </p>
        <DropdownMenuSeparator className="bg-[var(--blue-008)]" />
        {venues.map((venue) => (
          <DropdownMenuItem
            key={venue.id}
            onClick={() => handleVenueChange(venue.slug)}
            className={`gap-2.5 cursor-pointer ${venue.slug === currentSlug ? "text-[var(--xiv-blue)]" : ""}`}
          >
            <span className="w-6 h-6 rounded bg-[var(--blue-010)] border border-[var(--blue-015)] flex items-center justify-center flex-shrink-0">
              <Store className="w-3.5 h-3.5 text-[var(--xiv-blue)]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{venue.name}</span>
              {(venue.dataCenter || venue.world) && (
                <span className="block text-[0.66rem] text-[var(--fg-faint)] truncate">
                  {[venue.dataCenter, venue.world].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
            {venue.slug === currentSlug && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--xiv-blue)] flex-shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
