"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { CrystalDivider } from "@/components/ui/crystal-divider"
import { MapPin, ArrowRight, Heart, Radio } from "lucide-react"
import { VenueFollowButton } from "@/components/venue-follow-button"

export type DiscoverVenue = {
  id: string
  name: string
  slug: string
  dataCenter: string
  world: string
  location: string | null
  description: string | null
  followCount: number
  isFollowed: boolean
  isOpenNow: boolean
  isTonightOpen: boolean
  activeEvent: { title: string } | null
  upcomingEvent: { title: string; startTime: string } | null
}

type Tab = "open" | "tonight" | "all"

export function DiscoverClient({
  venues,
  isAuthed,
}: {
  venues: DiscoverVenue[]
  isAuthed: boolean
}) {
  const [tab, setTab] = useState<Tab>("all")
  const [search, setSearch] = useState("")

  const openCount = venues.filter((v) => v.isOpenNow).length
  const tonightCount = venues.filter((v) => v.isTonightOpen).length

  const filtered = venues.filter((v) => {
    if (tab === "open" && !v.isOpenNow) return false
    if (tab === "tonight" && !v.isTonightOpen) return false
    if (search) {
      const q = search.toLowerCase()
      const haystack = [v.name, v.dataCenter, v.world, v.location ?? ""].join(" ").toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const featured = filtered.find((v) => v.isOpenNow || v.isTonightOpen) ?? filtered[0]
  const rest = filtered.filter((v) => v.id !== featured?.id)

  const openVenueCount = filtered.filter((v) => v.isOpenNow).length
  const closedVenueCount = filtered.filter((v) => !v.isOpenNow).length

  const tabs: { key: Tab; icon: React.ReactNode; label: string; count: number }[] = [
    {
      key: "open",
      icon: <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>,
      label: "Open now",
      count: openCount,
    },
    {
      key: "tonight",
      icon: <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
      label: "Tonight",
      count: tonightCount,
    },
    {
      key: "all",
      icon: null,
      label: "All",
      count: venues.length,
    },
  ]

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-1 bg-card border border-[var(--blue-015)] rounded-full p-1">
          {tabs.map(({ key, icon, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                tab === key
                  ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
              }`}
            >
              {icon}
              {label}
              {count > 0 && (
                <span className={`text-[0.65rem] ${tab === key ? "opacity-70" : "text-[var(--fg-faint)]"}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative flex items-center flex-1 min-w-[200px]">
          <svg className="absolute left-3 w-4 h-4 text-[var(--fg-faint)] pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <Input
            className="pl-9 bg-card border-[var(--blue-015)] focus:border-[var(--blue-035)] h-9 text-sm"
            placeholder="Search venues, worlds…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20">
          <Radio className="h-10 w-10 text-muted-foreground opacity-30 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">
            {tab === "open"
              ? "No venues open right now."
              : tab === "tonight"
              ? "No venues scheduled for tonight."
              : "No venues found."}
          </p>
          {search && (
            <button
              className="mt-2 text-xs text-[var(--xiv-blue)] hover:underline"
              onClick={() => setSearch("")}
            >
              Clear search
            </button>
          )}
        </div>
      )}

      {/* Featured hero */}
      {featured && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              Featured tonight
            </span>
            <div className="flex-1 h-px bg-[var(--blue-008)]" />
          </div>

          <div
            className="rounded-xl border border-[var(--blue-018)] overflow-hidden transition-all hover:border-[var(--blue-035)]"
            style={{ background: "linear-gradient(135deg, rgba(0,180,255,0.06) 0%, rgba(7,11,20,0.95) 60%)" }}
          >
            <div className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="h-16 w-16 rounded-xl bg-[var(--blue-010)] border border-[var(--blue-018)] flex items-center justify-center shrink-0 text-2xl font-cinzel font-bold text-[var(--xiv-blue)]">
                  {featured.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="font-cinzel text-2xl md:text-3xl font-bold tracking-[0.02em] mb-1">
                        {featured.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {featured.dataCenter} · {featured.world}
                        {featured.location && ` · ${featured.location}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {featured.isOpenNow ? (
                        <Badge variant="live">Live Now</Badge>
                      ) : featured.isTonightOpen ? (
                        <Badge variant="tag">Opening Soon</Badge>
                      ) : (
                        <Badge variant="status-closed">Closed</Badge>
                      )}
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" /> {featured.followCount}
                      </span>
                    </div>
                  </div>

                  {(featured.activeEvent || featured.upcomingEvent) && (
                    <div className="mt-4 pt-4 border-t border-[var(--blue-008)] grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="stat-label mb-0.5">Tonight</p>
                        <p className="text-sm font-medium text-[var(--xiv-blue)]">
                          {(featured.activeEvent ?? featured.upcomingEvent)!.title}
                        </p>
                      </div>
                      {featured.isOpenNow && (
                        <div>
                          <p className="stat-label mb-0.5">Status</p>
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            <span className="xiv-live-dot scale-75" /> Active
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {featured.description && (
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                      {featured.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-4">
                    <Button asChild variant="cta" size="sm">
                      <Link href={`/venues/${featured.slug}`}>
                        Visit Venue <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    {isAuthed && (
                      <VenueFollowButton
                        venueId={featured.id}
                        isFollowing={featured.isFollowed}
                        followCount={featured.followCount}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Browse list */}
      {rest.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              All venues
            </span>
            <div className="flex-1 h-px bg-[var(--blue-008)]" />
            <span className="text-xs text-muted-foreground">
              {openVenueCount > 0 && `${openVenueCount} open`}
              {openVenueCount > 0 && closedVenueCount > 0 && " · "}
              {closedVenueCount > 0 && `${closedVenueCount} closed`}
            </span>
          </div>

          <div className="space-y-2">
            {rest.map((venue) => (
              <div
                key={venue.id}
                className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[var(--blue-008)] hover:border-[var(--blue-018)] hover:bg-[var(--blue-004)] transition-all"
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-sm font-cinzel font-bold shrink-0 ${
                  venue.isOpenNow
                    ? "bg-[var(--blue-010)] text-[var(--xiv-blue)] border border-[var(--blue-018)]"
                    : "bg-[rgba(108,112,134,0.10)] text-[var(--fg-faint)] border border-[var(--border)]"
                }`}>
                  {venue.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-semibold text-sm truncate ${!venue.isOpenNow ? "text-[var(--fg-subtle)]" : ""}`}>
                      {venue.name}
                    </span>
                    {venue.activeEvent && (
                      <span className="text-[0.68rem] text-[var(--xiv-blue)] bg-[var(--blue-010)] px-2 py-0.5 rounded-full border border-[var(--blue-018)] hidden sm:inline">
                        {venue.activeEvent.title}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {venue.dataCenter} · {venue.world}
                    {venue.location && ` · ${venue.location}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {venue.isOpenNow ? (
                    <Badge variant="status-open" className="text-[10px]">Open</Badge>
                  ) : venue.isTonightOpen ? (
                    <Badge variant="tag" className="text-[10px]">Soon</Badge>
                  ) : (
                    <Badge variant="status-closed" className="text-[10px]">Closed</Badge>
                  )}
                  <Button
                    asChild
                    variant="outline-blue"
                    size="sm"
                    className={!venue.isOpenNow && !venue.isTonightOpen ? "opacity-40 pointer-events-none" : ""}
                  >
                    <Link href={`/venues/${venue.slug}`}>
                      Visit <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
