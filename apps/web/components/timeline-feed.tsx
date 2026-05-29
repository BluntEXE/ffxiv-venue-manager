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
      <div className="flex items-center gap-2 mb-6">
        {(Object.keys(filterLabels) as TimelineFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setLiveCount(0) }}
            className={"px-3 py-1.5 rounded-full text-sm font-medium transition-colors " + (
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {filterLabels[f]}
          </button>
        ))}
        {liveCount > 0 && (
          <span className="text-xs text-emerald-500 ml-2">
            +{liveCount} live
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
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <span className="text-emerald-500 text-sm">G</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{Number(amount).toLocaleString()} gil</span>
                {service && (
                  <Badge variant="outline" className="text-xs">{service.name}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {customerName && <span>{customerName} &middot; </span>}
                {staff?.name && <span>by {staff.name} &middot; </span>}
                {time}
              </p>
              {notes && <p className="text-xs text-muted-foreground mt-0.5">{notes}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Patron enter/exit
  const { characterName, world } = item.data
  const isEnter = item.type === "patron_enter"

  return (
    <Card className={isEnter ? "border-[rgba(0,180,255,0.2)]" : "border-[rgba(255,100,100,0.15)]"}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={"flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center " + (
            isEnter ? "bg-[rgba(0,180,255,0.12)]" : "bg-[rgba(255,100,100,0.1)]"
          )}>
            {isEnter
              ? <LogIn className="h-4 w-4 text-[var(--xiv-blue)]" />
              : <LogOut className="h-4 w-4 text-rose-400" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">
              {characterName || "Unknown"}{world ? " (" + world + ")" : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {isEnter ? "Entered" : "Left"} &middot; {time}
            </p>
          </div>
          <Badge
            variant="outline"
            className={isEnter
              ? "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]"
              : "bg-[rgba(255,100,100,0.1)] text-rose-400 border-rose-500/30"
            }
          >
            {isEnter ? "Entered" : "Left"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
