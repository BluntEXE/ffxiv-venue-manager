"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { formatServerTime } from "@/lib/server-time"
import { StatReadout } from "@/components/ui/stat-readout"
import { Card } from "@/components/ui/card"
import { History, Repeat, UserPlus, Crown } from "lucide-react"

export type PatronProfile = {
  characterName: string
  world: string
  visits: number
  lastSeen: string // ISO
  totalSpent?: number
}

function tag(visits: number): "vip" | "regular" | "new" {
  if (visits >= 10) return "vip"
  if (visits >= 3) return "regular"
  return "new"
}

const TAG_STYLES = {
  vip:     "bg-[rgba(249,226,175,0.10)] text-[var(--warning)] border border-[rgba(249,226,175,0.28)]",
  regular: "bg-[rgba(108,112,134,0.12)] text-muted-foreground border border-[var(--border)]",
  new:     "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
}

const TAG_LABELS = { vip: "VIP", regular: "Regular", new: "New" }

type TabKey = "all" | "vip" | "regular" | "new"

export function PatronProfilesTable({ profiles }: { profiles: PatronProfile[] }) {
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [search, setSearch] = useState("")

  const counts = {
    all:     profiles.length,
    vip:     profiles.filter((p) => tag(p.visits) === "vip").length,
    regular: profiles.filter((p) => tag(p.visits) === "regular").length,
    new:     profiles.filter((p) => tag(p.visits) === "new").length,
  }

  const visible = profiles.filter((p) => {
    if (activeTab !== "all" && tag(p.visits) !== activeTab) return false
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-4"><StatReadout label="Unique patrons" value={profiles.length} subtext="all time" icon={<History />} iconVariant="blue" /></Card>
        <Card className="p-4"><StatReadout label="Regulars" value={counts.regular} subtext="3+ visits" icon={<Repeat />} iconVariant="blue" /></Card>
        <Card className="p-4"><StatReadout label="New this period" value={counts.new} subtext="1–2 visits" icon={<UserPlus />} iconVariant="success" /></Card>
        <Card className="p-4"><StatReadout label="VIPs" value={counts.vip} subtext="10+ visits" icon={<Crown />} iconVariant="warning" /></Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-card border border-[var(--blue-015)] rounded-full p-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                activeTab === key
                  ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
              }`}
            >
              {label}
              <span className={`ml-1.5 text-[0.68rem] ${activeTab === key ? "opacity-70" : "text-[var(--fg-faint)]"}`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex items-center flex-1 min-w-[180px] max-w-xs">
          <svg className="absolute left-3 w-4 h-4 text-[var(--fg-faint)] pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <Input
            className="pl-9 bg-card border-[var(--blue-015)] focus:border-[var(--blue-035)] h-9 text-sm"
            placeholder="Search patrons…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
        {visible.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-12">No patrons found.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Patron", "World", "Visits", "Last seen", "Total spent", "Tags"].map((h, i) => (
                  <th
                    key={h}
                    className={`text-left text-[0.68rem] font-medium uppercase tracking-[0.06em] text-[var(--xiv-blue)] px-5 py-3 border-b border-[var(--blue-008)] whitespace-nowrap ${
                      i === 2 || i === 4 ? "text-right" : ""
                    } ${i === 1 || i === 3 || i === 4 ? "hidden md:table-cell" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const t = tag(p.visits)
                const initials = p.characterName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                return (
                  <tr
                    key={`${p.characterName}|${p.world}`}
                    className="border-b border-[var(--blue-008)] last:border-0 hover:bg-[var(--blue-004)] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--xiv-blue)] to-blue-700 flex items-center justify-center text-[0.65rem] font-bold text-white flex-shrink-0">
                          {initials}
                        </span>
                        <span className="text-sm font-medium">{p.characterName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground hidden md:table-cell">
                      {p.world || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-right font-variant-numeric tabular-nums font-semibold text-[var(--xiv-blue)]">
                      {p.visits}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground hidden md:table-cell whitespace-nowrap">
                      {formatServerTime(p.lastSeen, "datetime")}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-right tabular-nums hidden md:table-cell">
                      {p.totalSpent && p.totalSpent > 0
                        ? <span className="text-[var(--xiv-blue)] font-semibold">{p.totalSpent.toLocaleString()} gil</span>
                        : <span className="text-[var(--fg-faint)]">—</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[0.7rem] font-medium px-2.5 py-0.5 rounded-full ${TAG_STYLES[t]}`}>
                          {TAG_LABELS[t]}
                        </span>
                        {t === "vip" && (
                          <span className={`text-[0.7rem] font-medium px-2.5 py-0.5 rounded-full ${TAG_STYLES.regular}`}>
                            Regular
                          </span>
                        )}
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
