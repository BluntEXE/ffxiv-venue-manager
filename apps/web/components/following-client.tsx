"use client"

import { useState } from "react"
import Link from "next/link"
import { MapPin, ArrowRight, Radio, Building2, Heart } from "lucide-react"
import { VenueFollowButton } from "@/components/venue-follow-button"
import { formatVenueAddress } from "@/lib/venue-location"

type FollowingVenue = {
  id: string
  name: string
  slug: string
  dataCenter: string
  world: string
  district: string | null
  ward: number | null
  plot: number | null
  location: string | null
  followCount: number
  isOpenNow: boolean
  activeEvent: { title: string } | null
}

export function FollowingClient({
  venues,
  followCount,
}: {
  venues: FollowingVenue[]
  followCount: number
}) {
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<"open" | "all">("open")

  const filtered = venues.filter(v => {
    if (tab === "open" && !v.isOpenNow) return false
    if (search) {
      const q = search.toLowerCase()
      return [v.name, v.dataCenter, v.world, v.district ?? "", v.location ?? ""].join(" ").toLowerCase().includes(q)
    }
    return true
  })

  const open   = filtered.filter(v => v.isOpenNow)
  const closed = filtered.filter(v => !v.isOpenNow)

  return (
    <div className="page-inner" style={{ maxWidth: 940 }}>
      {/* Page header */}
      <div className="head-row">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">Following</span>
          </div>
          <h1 className="page-h1">Following</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-[560px]">
            Venues you follow across the realm. See who&apos;s open now and never miss a night.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-[14px] mt-[30px] mb-3 flex-wrap">
        <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1">
          <button
            onClick={() => setTab("open")}
            className={`flex items-center gap-[7px] text-[0.85rem] font-semibold px-4 py-[7px] rounded-full transition-colors ${tab === "open" ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]" : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"}`}
          >
            <Radio className="w-3.5 h-3.5" /> Open now
          </button>
          <button
            onClick={() => setTab("all")}
            className={`text-[0.85rem] font-semibold px-4 py-[7px] rounded-full transition-colors ${tab === "all" ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]" : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"}`}
          >
            All
          </button>
        </div>
        <div className="flex-1 min-w-[200px] relative flex items-center">
          <svg className="absolute left-[14px] w-4 h-4 text-[var(--fg-faint)] pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search followed venues…"
            className="w-full bg-[var(--card)] border border-[var(--blue-015)] rounded-[var(--radius-md)] py-[10px] pl-10 pr-[14px] text-[0.88rem] text-foreground placeholder:text-[var(--fg-faint)] outline-none focus:border-[var(--blue-035)] transition-colors"
          />
        </div>
      </div>

      {followCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Heart className="h-12 w-12 text-muted-foreground opacity-30 mb-4" />
          <p className="text-muted-foreground mb-4">You haven&apos;t followed any venues yet.</p>
          <Link href="/discover" className="xiv-btn-shimmer xiv-cta px-6 py-2.5 rounded-lg text-sm font-semibold">
            Discover Venues
          </Link>
        </div>
      ) : (
        <div>
          {/* Open now */}
          {(tab === "open" || tab === "all") && open.length > 0 && (
            <>
              <div className="section-label">
                <span className="sl-label">Open now</span>
                <span className="ln" />
                <span className="count">{open.length} of {followCount} open</span>
              </div>
              <div className="space-y-2">
                {open.map(v => <VenueC3Card key={v.id} venue={v} showFollow />)}
              </div>
            </>
          )}

          {/* Closed */}
          {tab === "all" && closed.length > 0 && (
            <>
              <div className="section-label">
                <span className="sl-label muted">Closed</span>
                <span className="ln" />
              </div>
              <div className="space-y-2">
                {closed.map(v => <VenueC3Card key={v.id} venue={v} dimmed showFollow />)}
              </div>
            </>
          )}

          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-12">No venues match your search.</p>
          )}
        </div>
      )}
    </div>
  )
}

function VenueC3Card({
  venue,
  dimmed,
  showFollow,
}: {
  venue: FollowingVenue
  dimmed?: boolean
  showFollow?: boolean
}) {
  const isOpen = venue.isOpenNow

  return (
    <div className={`vcard c3 flex items-center gap-4 px-[18px] py-4 ${dimmed ? "opacity-70" : ""}`}>
      {/* Icon badge */}
      <div className={`iconbadge flex-shrink-0 rounded-[var(--radius-lg)] w-[54px] h-[54px] grid place-items-center ${dimmed ? "bg-[rgba(108,112,134,0.10)] border-[var(--border)] text-[var(--fg-faint)]" : ""}`}>
        <Building2 className="w-[25px] h-[25px]" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[10px] flex-wrap">
          <span className={`vname text-[1.18rem] ${dimmed ? "text-[var(--fg-subtle)]" : ""}`}>{venue.name}</span>
          {isOpen && venue.activeEvent && (
            <span className="tag hidden sm:inline">{venue.activeEvent.title}</span>
          )}
        </div>
        <div className="flex items-center gap-[18px] mt-[7px] flex-wrap">
          <span className="meta">
            <MapPin className="w-[15px] h-[15px]" />
            {formatVenueAddress(venue)}
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isOpen ? (
          <span className="status open"><span className="dot" />Open</span>
        ) : (
          <span className="status closed"><span className="dot" />Closed</span>
        )}
        {showFollow && (
          <VenueFollowButton venueId={venue.id} isFollowing={true} followCount={venue.followCount} compact />
        )}
        <Link
          href={`/venues/${venue.slug}`}
          className="btn btn-outline btn-sm flex items-center gap-2 px-4 py-[7px] text-[0.85rem] rounded-[var(--radius-md)] border border-[var(--blue-018)] bg-[rgba(7,11,20,0.5)] hover:border-[var(--blue-045)] hover:bg-[var(--blue-007)] transition-colors"
        >
          Visit <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
