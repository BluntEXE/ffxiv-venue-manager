"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { formatServerTime, SERVER_TIME_LABEL } from "@/lib/server-time"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { LogIn, LogOut } from "lucide-react"

type TimelineFilter = "all" | "sales" | "patrons"

interface TimelineItem {
  id: string
  type: "sale" | "patron_enter" | "patron_exit"
  timestamp: string
  data: Record<string, any>
}

interface TimelineFeedProps {
  venueId: string
  initialFilter?: TimelineFilter
}

const filterLabels: Record<TimelineFilter, string> = {
  all: "All Activity",
  sales: "Sales",
  patrons: "Patrons",
}


function matchesFilter(item: TimelineItem, filter: TimelineFilter): boolean {
  if (filter === "all") return true
  if (filter === "sales") return item.type === "sale"
  return item.type === "patron_enter" || item.type === "patron_exit"
}

export function TimelineFeed({ venueId, initialFilter = "all" }: TimelineFeedProps) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [filter, setFilter] = useState<TimelineFilter>(initialFilter)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [liveCount, setLiveCount] = useState(0)
  const filterRef = useRef(filter)
  filterRef.current = filter

  const fetchItems = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ limit: "50" })
    if (filter !== "all") params.set("type", filter)
    if (cursor) params.set("cursor", cursor)

    const res = await fetch("/api/venues/" + venueId + "/timeline?" + params)
    if (!res.ok) return null
    return res.json()
  }, [venueId, filter])

  useEffect(() => {
    setLoading(true)
    setLiveCount(0)
    fetchItems().then((data) => {
      if (data) {
        setItems(data.items)
        setNextCursor(data.nextCursor)
        setHasMore(data.hasMore)
      }
      setLoading(false)
    })
  }, [fetchItems])

  // SSE subscription
  useEffect(() => {
    const eventSource = new EventSource("/api/stream/" + venueId)

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.type === "connected") return

        const item: TimelineItem = {
          id: event.id,
          type: event.type,
          timestamp: event.timestamp,
          data: event.data,
        }

        setItems((prev) => [item, ...prev])
        if (matchesFilter(item, filterRef.current)) {
          setLiveCount((c) => c + 1)
        }
      } catch {}
    }

    eventSource.onerror = () => {
      // EventSource auto-reconnects
    }

    return () => eventSource.close()
  }, [venueId])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const data = await fetchItems(nextCursor)
    if (data) {
      setItems((prev) => [...prev, ...data.items])
      setNextCursor(data.nextCursor)
      setHasMore(data.hasMore)
    }
    setLoadingMore(false)
  }

  const visibleItems = items.filter((item) => matchesFilter(item, filter))

  return (
    <div>
      {/* Filter chips */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-1 bg-card border border-[var(--blue-015)] rounded-full p-1">
          {(Object.keys(filterLabels) as TimelineFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setLiveCount(0) }}
              className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                filter === f
                  ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>
        {liveCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <span className="xiv-live-dot scale-75" />+{liveCount} live
          </span>
        )}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : visibleItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No activity yet.{filter !== "all" ? " Try a different filter." : ""}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <TimelineRow key={item.id} item={item} />
          ))}

          {hasMore && (
            <div className="text-center pt-4">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const time = formatServerTime(item.timestamp, "datetime") + " " + SERVER_TIME_LABEL

  if (item.type === "sale") {
    const { amount, customerName, service, staff, notes } = item.data
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--blue-008)] hover:border-[var(--blue-018)] hover:bg-[var(--blue-004)] transition-all">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-emerald-400">{Number(amount).toLocaleString()} gil</span>
            {service && (
              <span className="text-[0.68rem] font-medium px-2 py-0.5 rounded-full bg-[var(--blue-010)] text-[var(--xiv-blue)] border border-[var(--blue-018)]">
                {(service as { name: string }).name}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {customerName && <span>{String(customerName)} &middot; </span>}
            {staff && (staff as { name?: string }).name && <span>by {(staff as { name: string }).name} &middot; </span>}
            {time}
          </p>
          {notes && <p className="text-xs text-[var(--fg-faint)] mt-0.5">{String(notes)}</p>}
        </div>
      </div>
    )
  }

  const { characterName, world } = item.data
  const isEnter = item.type === "patron_enter"

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border hover:bg-[var(--blue-004)] transition-all ${
      isEnter ? "border-[rgba(0,180,255,0.15)]" : "border-[var(--blue-008)]"
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isEnter
          ? "bg-[rgba(0,180,255,0.10)] border border-[rgba(0,180,255,0.25)]"
          : "bg-[rgba(108,112,134,0.10)] border border-[var(--border)]"
      }`}>
        {isEnter
          ? <LogIn className="h-4 w-4 text-[var(--xiv-blue)]" />
          : <LogOut className="h-4 w-4 text-muted-foreground" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {characterName ? String(characterName) : "Unknown"}
          {world ? <span className="text-muted-foreground font-normal"> · {String(world)}</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">{isEnter ? "Entered" : "Left"} · {time}</p>
      </div>
      <span className={`text-[0.68rem] font-semibold uppercase tracking-[0.05em] px-2.5 py-1 rounded-full ${
        isEnter
          ? "bg-[rgba(0,180,255,0.10)] text-[var(--xiv-blue)] border border-[rgba(0,180,255,0.28)]"
          : "bg-[rgba(108,112,134,0.10)] text-[var(--fg-faint)] border border-[var(--border)]"
      }`}>
        {isEnter ? "Enter" : "Exit"}
      </span>
    </div>
  )
}
