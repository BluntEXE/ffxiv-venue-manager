"use client"

import { useState } from "react"
import { formatServerTime } from "@/lib/server-time"
import { History, Repeat, UserPlus, Crown } from "lucide-react"

export type PatronProfile = {
  id: string
  characterName: string
  world: string
  visits: number
  lastSeen: string // ISO
  totalSpent?: number
  isVip: boolean
  isBanned: boolean
  banReason: string | null
}

export function patronTag(visits: number, isVip: boolean): "vip" | "regular" | "new" {
  if (isVip) return "vip"
  if (visits >= 3) return "regular"
  return "new"
}

type TabKey = "all" | "vip" | "regular" | "new"

export function PatronProfilesTable({
  profiles,
  venueId,
  canSetVip,
}: {
  profiles: PatronProfile[]
  venueId: string
  canSetVip: boolean
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [search, setSearch] = useState("")
  const [localProfiles, setLocalProfiles] = useState(profiles)
  const [pendingVipIds, setPendingVipIds] = useState<Set<string>>(new Set())

  async function toggleVip(patron: PatronProfile) {
    if (!canSetVip || !patron.id || pendingVipIds.has(patron.id)) return
    const nextIsVip = !patron.isVip
    setPendingVipIds((prev) => new Set(prev).add(patron.id))
    setLocalProfiles((prev) =>
      prev.map((p) => (p.id === patron.id ? { ...p, isVip: nextIsVip } : p))
    )
    try {
      const res = await fetch(`/api/venues/${venueId}/patrons/${patron.id}/vip`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVip: nextIsVip }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      // Roll back on failure
      setLocalProfiles((prev) =>
        prev.map((p) => (p.id === patron.id ? { ...p, isVip: patron.isVip } : p))
      )
    } finally {
      setPendingVipIds((prev) => {
        const next = new Set(prev)
        next.delete(patron.id)
        return next
      })
    }
  }

  const counts = {
    all:     localProfiles.length,
    vip:     localProfiles.filter((p) => patronTag(p.visits, p.isVip) === "vip").length,
    regular: localProfiles.filter((p) => patronTag(p.visits, p.isVip) === "regular").length,
    new:     localProfiles.filter((p) => patronTag(p.visits, p.isVip) === "new").length,
  }

  const visible = localProfiles.filter((p) => {
    if (activeTab !== "all" && patronTag(p.visits, p.isVip) !== activeTab) return false
    if (search && !p.characterName.toLowerCase().includes(search.toLowerCase()) &&
        !p.world.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all",     label: "All" },
    { key: "regular", label: "Regulars" },
    { key: "vip",     label: "VIPs" },
    { key: "new",     label: "New" },
  ]

  return (
    <div>
      {/* KPIs */}
      <div className="kpis mb-2">
        <div className="stat">
          <div className="top"><span className="sb"><History /></span></div>
          <div className="k">Unique patrons</div>
          <div className="v">{localProfiles.length}</div>
          <div className="delta flat">all time</div>
        </div>
        <div className="stat">
          <div className="top"><span className="sb"><Repeat /></span></div>
          <div className="k">Regulars</div>
          <div className="v">{counts.regular}</div>
          <div className="delta flat">3+ visits</div>
        </div>
        <div className="stat">
          <div className="top"><span className="sb em"><UserPlus /></span></div>
          <div className="k">New this period</div>
          <div className="v">{counts.new}</div>
          <div className="delta flat">1–2 visits</div>
        </div>
        <div className="stat">
          <div className="top"><span className="sb am"><Crown /></span></div>
          <div className="k">VIPs</div>
          <div className="v">{counts.vip}</div>
          <div className="delta flat">staff-flagged</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="tabs">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`tab${activeTab === key ? " active" : ""}`}
            >
              {label}
              <span style={{ fontSize: "0.68rem", opacity: activeTab === key ? 0.7 : 0.5 }}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
        <div className="search">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder="Search patrons…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="panel">
        {visible.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No patrons found.</p>
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>Patron</th>
                <th className="hide">World</th>
                <th className="t-num">Visits</th>
                <th className="hide">Last seen</th>
                <th className="t-num hide">Total spent</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const t = patronTag(p.visits, p.isVip)
                const initials = p.characterName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                return (
                  <tr key={`${p.characterName}|${p.world}`}>
                    <td>
                      <div className="cellrow">
                        <span className="av-sm">{initials}</span>
                        <span className="t-name">{p.characterName}</span>
                      </div>
                    </td>
                    <td className="hide t-muted">{p.world || "—"}</td>
                    <td className="t-num">{p.visits}</td>
                    <td className="hide t-muted">{formatServerTime(p.lastSeen, "datetime")}</td>
                    <td className="t-num hide">
                      {p.totalSpent && p.totalSpent > 0
                        ? <span className="gil">{p.totalSpent.toLocaleString()}</span>
                        : <span className="t-muted">—</span>
                      }
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {t === "vip" && <span className="tag vip">VIP</span>}
                        {canSetVip && p.id && (
                          <button
                            type="button"
                            onClick={() => toggleVip(p)}
                            disabled={pendingVipIds.has(p.id)}
                            className="tag neutral"
                            style={{ cursor: pendingVipIds.has(p.id) ? "default" : "pointer", opacity: pendingVipIds.has(p.id) ? 0.6 : 1 }}
                          >
                            {t === "vip" ? "Unmark VIP" : "Mark VIP"}
                          </button>
                        )}
                        {(t === "vip" || t === "regular") && <span className="tag neutral">Regular</span>}
                        {t === "new" && <span className="tag em">New</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
