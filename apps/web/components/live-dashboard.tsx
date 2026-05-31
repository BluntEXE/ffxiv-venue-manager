"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { formatServerTime, SERVER_TIME_LABEL } from "@/lib/server-time"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatReadout } from "@/components/ui/stat-readout"
import { Coins, UserPlus, UserMinus, Users, Clock, Pause, StopCircle, Terminal } from "lucide-react"
import { formatDistanceToNowStrict } from "date-fns"

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
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

interface PatronRosterItem { name: string; arrivedAt: string }
interface StaffRosterItem { name: string; role: string }

interface LiveDashboardProps {
  venueId: string
  event: LiveEvent
  isUpcoming: boolean
  initialPatronCount: number
  initialRevenue: number | null
  initialSaleCount: number
  initialNewTonight: number
  showRevenue: boolean
  revenueLabel: string
  patronRoster: PatronRosterItem[]
  onShiftStaff: StaffRosterItem[]
}

export function LiveDashboard({
  venueId,
  event,
  isUpcoming,
  initialPatronCount,
  initialRevenue,
  initialSaleCount,
  initialNewTonight,
  showRevenue,
  revenueLabel,
  patronRoster: initialRoster,
  onShiftStaff,
}: LiveDashboardProps) {
  const [patronCount, setPatronCount] = useState(initialPatronCount)
  const [revenue, setRevenue] = useState(initialRevenue ?? 0)
  const [saleCount, setSaleCount] = useState(initialSaleCount)
  const [newTonight, setNewTonight] = useState(initialNewTonight)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [elapsed, setElapsed] = useState("")
  const [connected, setConnected] = useState(false)
  const [roster, setRoster] = useState<PatronRosterItem[]>(initialRoster)

  // Elapsed timer
  useEffect(() => {
    if (isUpcoming) return
    const tick = () => {
      const ms = Date.now() - new Date(event.startTime).getTime()
      setElapsed(formatDuration(Math.max(0, ms)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [event.startTime, isUpcoming])

  // Load historical activity
  useEffect(() => {
    if (isUpcoming || !event.id) return
    fetch(`/api/venues/${venueId}/timeline?eventId=${event.id}&limit=50`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data.items)) return
        setActivity(data.items
          .filter((item: any) => item.type !== "unknown")
          .map((item: any) => ({
            id: item.id,
            type: item.type as ActivityItem["type"],
            timestamp: item.timestamp,
            text: item.type === "sale"
              ? `${item.data?.customerName || "Someone"} — ${Number(item.data?.amount || 0).toLocaleString()} gil${item.data?.staff?.name ? " · " + item.data.staff.name : ""}`
              : item.type === "patron_enter"
              ? `${item.data?.characterName || "Unknown"} entered`
              : `${item.data?.characterName || "Unknown"} left`,
          })))
      })
      .catch(() => {})
  }, [venueId, event.id, isUpcoming])

  // SSE
  useEffect(() => {
    const es = new EventSource("/api/stream/" + venueId)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === "connected") { setConnected(true); return }

        if (data.type === "sale") {
          const amt = Number(data.data.amount || 0)
          if (showRevenue) setRevenue(prev => prev + amt)
          setSaleCount(prev => prev + 1)
          setActivity(prev => prev.some(a => a.id === data.id) ? prev : [{
            id: data.id, type: "sale" as const, timestamp: data.timestamp,
            text: `${data.data.customerName || "Someone"} — ${amt.toLocaleString()} gil${data.data.staff?.name ? " · " + data.data.staff.name : ""}`,
          }, ...prev].slice(0, 50))
        }
        if (data.type === "patron_enter") {
          setPatronCount(prev => prev + 1)
          setNewTonight(prev => prev + 1)
          const name = data.data.characterName || "Unknown"
          setRoster(prev => [{ name, arrivedAt: data.timestamp }, ...prev].slice(0, 20))
          setActivity(prev => prev.some(a => a.id === data.id) ? prev : [{
            id: data.id, type: "patron_enter" as const, timestamp: data.timestamp,
            text: `${name} entered`,
          }, ...prev].slice(0, 50))
        }
        if (data.type === "patron_exit") {
          setPatronCount(prev => Math.max(0, prev - 1))
          const name = data.data.characterName || "Unknown"
          setRoster(prev => prev.filter(p => p.name !== name))
          setActivity(prev => prev.some(a => a.id === data.id) ? prev : [{
            id: data.id, type: "patron_exit" as const, timestamp: data.timestamp,
            text: `${name} left`,
          }, ...prev].slice(0, 50))
        }
      } catch {}
    }
    es.onerror = () => setConnected(false)
    return () => es.close()
  }, [venueId, showRevenue])

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Session bar */}
      <div className="rounded-xl border border-[var(--blue-018)] overflow-hidden"
        style={{ background: "linear-gradient(to right, rgba(0,180,255,0.06), rgba(7,11,20,0.8))" }}>
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Badge variant={isUpcoming ? "status-soon" : "live"}>
              {isUpcoming ? "Starting Soon" : "Live Now"}
            </Badge>
            <h1 className="font-cinzel text-xl md:text-2xl font-bold tracking-[0.02em] truncate">{event.title}</h1>
          </div>
          <div className="flex items-center gap-4">
            {!isUpcoming && elapsed && (
              <div className="text-right">
                <p className="stat-label">Session elapsed</p>
                <p className="font-mono text-lg font-semibold tabular-nums text-[var(--xiv-blue)]">{elapsed}</p>
              </div>
            )}
            {!isUpcoming && (
              <div className="flex gap-2">
                <Button variant="outline-blue" size="sm">
                  <Pause className="h-3.5 w-3.5" /> Pause
                </Button>
                <Button variant="destructive" size="sm" className="opacity-80 hover:opacity-100">
                  <StopCircle className="h-3.5 w-3.5" /> End
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stat readouts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <StatReadout label="In venue now" value={patronCount} />
            {connected && <span className="xiv-live-dot mt-1 shrink-0" />}
          </div>
        </Card>
        <Card className="p-4">
          <StatReadout label="New tonight" value={newTonight} />
        </Card>
        {showRevenue && (
          <Card className="p-4">
            <StatReadout
              label="Sales tonight"
              value={`${revenue.toLocaleString()} gil`}
              subtext={revenueLabel}
            />
          </Card>
        )}
        <Card className="p-4">
          <StatReadout label="Transactions" value={saleCount} />
        </Card>
        <Card className="p-4">
          <StatReadout
            label="On shift"
            value={onShiftStaff.length}
            icon={<Clock className="h-3.5 w-3.5" />}
          />
        </Card>
      </div>

      {/* Feed + rosters */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Activity feed */}
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="stat-label">Live activity</p>
            <div className="flex items-center gap-1.5">
              {connected ? (
                <>
                  <span className="text-xs text-muted-foreground">Listening</span>
                  <span className="xiv-listening-dot" />
                  <span className="xiv-listening-dot" />
                  <span className="xiv-listening-dot" />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Connecting...</span>
              )}
            </div>
          </div>

          {activity.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              {!isUpcoming && connected && (
                <div className="flex justify-center gap-1.5">
                  <span className="xiv-listening-dot" />
                  <span className="xiv-listening-dot" />
                  <span className="xiv-listening-dot" />
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {isUpcoming ? "Activity will appear once the event starts." : "Waiting for activity..."}
              </p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[420px] overflow-y-auto">
              {activity.map(item => (
                <div key={item.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--blue-008)] last:border-0">
                  <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                    item.type === "sale" ? "bg-[var(--success-soft)] text-[var(--success-text)]"
                    : item.type === "patron_enter" ? "bg-[var(--blue-010)] text-[var(--xiv-blue)]"
                    : "bg-[var(--destructive-soft)] text-[var(--destructive)]"
                  }`}>
                    {item.type === "sale" ? <Coins className="h-3.5 w-3.5" />
                      : item.type === "patron_enter" ? <UserPlus className="h-3.5 w-3.5" />
                      : <UserMinus className="h-3.5 w-3.5" />}
                  </div>
                  <span className="flex-1 text-sm min-w-0 truncate">{item.text}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatServerTime(item.timestamp, "time")} {SERVER_TIME_LABEL}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Roster panels */}
        <div className="space-y-4">

          {/* In venue now */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="stat-label">In venue now</p>
              <span className="text-xs text-muted-foreground">{patronCount} patrons</span>
            </div>
            {roster.length > 0 ? (
              <div className="space-y-2 max-h-[180px] overflow-y-auto">
                {roster.slice(0, 10).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[var(--blue-010)] flex items-center justify-center text-[10px] font-semibold text-[var(--xiv-blue)] shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{p.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {formatDistanceToNowStrict(new Date(p.arrivedAt), { addSuffix: false })}
                    </span>
                  </div>
                ))}
                {roster.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">+{roster.length - 10} more</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No patrons yet</p>
            )}
          </Card>

          {/* On shift */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="stat-label">On shift</p>
              <span className="text-xs text-muted-foreground">{onShiftStaff.length} clocked in</span>
            </div>
            {onShiftStaff.length > 0 ? (
              <div className="space-y-2">
                {onShiftStaff.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-6 h-6 rounded-full bg-[var(--blue-010)] flex items-center justify-center text-[10px] font-semibold text-[var(--xiv-blue)] shrink-0">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 truncate">{s.name}</span>
                    <Badge variant="tag" className="text-[10px] shrink-0">{s.role}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No staff clocked in</p>
            )}
          </Card>

          {/* Command hints */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="h-3.5 w-3.5 text-[var(--xiv-blue)]" />
              <p className="stat-label">In-game commands</p>
            </div>
            <div className="space-y-1.5 font-mono text-xs">
              {[
                ["/xvm sale <amount>", "Log a sale"],
                ["/xvm start", "Start event"],
                ["/xvm end", "End event"],
                ["/xvm help", "Show commands"],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="flex items-center justify-between gap-2">
                  <span className="xiv-command">{cmd}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  )
}
