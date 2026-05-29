"use client"

import { useState, useEffect, useRef } from "react"
import { formatServerTime, SERVER_TIME_LABEL } from "@/lib/server-time"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Coins, UserPlus, UserMinus } from "lucide-react"


function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return hours + "h " + String(minutes).padStart(2, "0") + "m"
  }
  return minutes + "m " + String(seconds).padStart(2, "0") + "s"
}

interface LiveEvent {
  id: string
  title: string
  eventType: string
  startTime: string
  endTime: string
  status: string
}

interface ActivityItem {
  id: string
  type: "sale" | "patron_enter" | "patron_exit"
  timestamp: string
  text: string
}

interface LiveDashboardProps {
  venueId: string
  event: LiveEvent
  isUpcoming: boolean
  initialPatronCount: number
  initialRevenue: number | null
  initialSaleCount: number
  showRevenue: boolean
  revenueLabel: string
}

export function LiveDashboard({
  venueId,
  event,
  isUpcoming,
  initialPatronCount,
  initialRevenue,
  initialSaleCount,
  showRevenue,
  revenueLabel,
}: LiveDashboardProps) {
  const [patronCount, setPatronCount] = useState(initialPatronCount)
  const [revenue, setRevenue] = useState(initialRevenue ?? 0)
  const [saleCount, setSaleCount] = useState(initialSaleCount)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [elapsed, setElapsed] = useState("")
  const [connected, setConnected] = useState(false)

  // Elapsed timer
  useEffect(() => {
    if (isUpcoming) return
    const tick = () => {
      const ms = Date.now() - new Date(event.startTime).getTime()
      setElapsed(formatDuration(Math.max(0, ms)))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [event.startTime, isUpcoming])

  // Load historical activity for this event on mount
  useEffect(() => {
    if (isUpcoming || !event.id) return
    fetch(`/api/venues/${venueId}/timeline?eventId=${event.id}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data.items)) return
        const historical: ActivityItem[] = data.items
          .map((item: any) => ({
            id: item.id,
            type: item.type as ActivityItem["type"],
            timestamp: item.timestamp,
            text:
              item.type === "sale"
                ? `${item.data?.customerName || "Someone"} - ${Number(item.data?.amount || 0).toLocaleString()} gil${item.data?.staff?.name ? " (by " + item.data.staff.name + ")" : ""}`
                : item.type === "patron_enter"
                ? `${item.data?.characterName || "Unknown"} entered`
                : `${item.data?.characterName || "Unknown"} left`,
          }))
        setActivity(historical)
      })
      .catch(() => {})
  }, [venueId, event.id, isUpcoming])

  // SSE subscription
  useEffect(() => {
    const eventSource = new EventSource("/api/stream/" + venueId)

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === "connected") {
          setConnected(true)
          return
        }

        if (data.type === "sale") {
          const amt = Number(data.data.amount || 0)
          if (showRevenue) setRevenue((prev) => prev + amt)
          setSaleCount((prev) => prev + 1)
          const name = data.data.customerName || "Someone"
          const staffName = data.data.staff?.name
          setActivity((prev) => {
            if (prev.some((a) => a.id === data.id)) return prev
            return [{ id: data.id, type: "sale" as const, timestamp: data.timestamp, text: name + " - " + amt.toLocaleString() + " gil" + (staffName ? " (by " + staffName + ")" : "") }, ...prev].slice(0, 50)
          })
        }

        if (data.type === "patron_enter") {
          setPatronCount((prev) => prev + 1)
          setActivity((prev) => {
            if (prev.some((a) => a.id === data.id)) return prev
            return [{ id: data.id, type: "patron_enter" as const, timestamp: data.timestamp, text: (data.data.characterName || "Unknown") + " entered" }, ...prev].slice(0, 50)
          })
        }

        if (data.type === "patron_exit") {
          setPatronCount((prev) => Math.max(0, prev - 1))
          setActivity((prev) => {
            if (prev.some((a) => a.id === data.id)) return prev
            return [{ id: data.id, type: "patron_exit" as const, timestamp: data.timestamp, text: (data.data.characterName || "Unknown") + " left" }, ...prev].slice(0, 50)
          })
        }
      } catch {}
    }

    eventSource.onerror = () => {
      setConnected(false)
    }

    return () => eventSource.close()
  }, [venueId, showRevenue])

  const typeLabels: Record<string, string> = {
    PERFORMANCE: "Performance",
    GAME_NIGHT: "Game Night",
    SPECIAL: "Special",
    SOCIAL: "Social",
    PRIVATE: "Private",
    OTHER: "Other",
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold">{event.title}</h1>
            <Badge
              variant="outline"
              className={
                isUpcoming
                  ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                  : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              }
            >
              {isUpcoming ? "Starting Soon" : "Live"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {typeLabels[event.eventType] || event.eventType} &middot;{" "}
            {formatServerTime(event.startTime, "time") + " " + SERVER_TIME_LABEL} - {formatServerTime(event.endTime, "time") + " " + SERVER_TIME_LABEL}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              "inline-block w-2 h-2 rounded-full " +
              (connected ? "bg-emerald-500" : "bg-zinc-500")
            }
          />
          <span className="text-xs text-muted-foreground">
            {connected ? "Live" : "Connecting..."}
          </span>
          {!isUpcoming && elapsed && (
            <span className="text-xs text-muted-foreground ml-2">
              {elapsed}
            </span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div
        className={
          "grid gap-4 md:gap-6 mb-6 md:mb-8 " +
          (showRevenue ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3")
        }
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Patrons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{patronCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently inside</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{saleCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Transactions</p>
          </CardContent>
        </Card>

        {showRevenue && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {revenueLabel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {revenue.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">gil</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {isUpcoming ? "--" : elapsed || "--"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isUpcoming ? "Not started" : "Elapsed"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live activity feed */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Live Activity</h2>
        {activity.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                {isUpcoming
                  ? "Activity will appear here once the event starts."
                  : "Waiting for activity..."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {activity.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div
                    className={
                      "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center " +
                      (item.type === "sale"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : item.type === "patron_enter"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-zinc-500/10 text-zinc-400")
                    }
                    aria-label={
                      item.type === "sale"
                        ? "Sale"
                        : item.type === "patron_enter"
                          ? "Patron entered"
                          : "Patron left"
                    }
                  >
                    {item.type === "sale" ? (
                      <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : item.type === "patron_enter" ? (
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{item.text}</span>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatServerTime(item.timestamp, "time") + " " + SERVER_TIME_LABEL}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
