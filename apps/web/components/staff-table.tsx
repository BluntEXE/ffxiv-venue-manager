"use client"

import { useState } from "react"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type StaffMember = {
  id: string
  role: "OWNER" | "MANAGER" | "STAFF"
  customRole: { name: string; color: string } | null
  joinedAt: string
  isOnShift: boolean
  user: { id: string; name: string | null; image: string | null } | null
}

const ROLE_ORDER: Record<string, number> = { OWNER: 0, MANAGER: 1, STAFF: 2 }

const rolePill: Record<string, string> = {
  OWNER:   "bg-[rgba(249,226,175,0.10)] text-[var(--warning)] border border-[rgba(249,226,175,0.28)]",
  MANAGER: "bg-[rgba(0,180,255,0.10)] text-[var(--xiv-blue)] border border-[rgba(0,180,255,0.28)]",
  STAFF:   "bg-[rgba(108,112,134,0.12)] text-muted-foreground border border-[var(--border)]",
}

type Filter = "all" | "owner" | "manager" | "staff"

export function StaffTable({
  members,
  slug,
  canManage,
}: {
  members: StaffMember[]
  slug: string
  canManage: boolean
}) {
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")

  const counts = {
    all:     members.length,
    owner:   members.filter(m => m.role === "OWNER").length,
    manager: members.filter(m => m.role === "MANAGER").length,
    staff:   members.filter(m => m.role === "STAFF").length,
  }

  const visible = members
    .filter(m => {
      if (filter === "owner"   && m.role !== "OWNER")   return false
      if (filter === "manager" && m.role !== "MANAGER") return false
      if (filter === "staff"   && m.role !== "STAFF")   return false
      if (search) {
        const q = search.toLowerCase()
        if (!(m.user?.name ?? "").toLowerCase().includes(q) &&
            !(m.customRole?.name ?? "").toLowerCase().includes(q)) return false
      }
      return true
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])

  const tabs: { key: Filter; label: string }[] = [
    { key: "all",     label: "All" },
    { key: "owner",   label: "Owners" },
    { key: "manager", label: "Managers" },
    { key: "staff",   label: "Staff" },
  ]

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-card border border-[var(--blue-015)] rounded-full p-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors ${
                filter === key
                  ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
              }`}
            >
              {label}
              <span className={`ml-1.5 text-[0.68rem] ${filter === key ? "opacity-70" : "text-[var(--fg-faint)]"}`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex items-center flex-1 min-w-[160px] max-w-xs">
          <svg className="absolute left-3 w-4 h-4 text-[var(--fg-faint)] pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <Input
            className="pl-9 bg-card border-[var(--blue-015)] focus:border-[var(--blue-035)] h-9 text-sm"
            placeholder="Search staff…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
        {visible.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">No staff found.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Staff", "Role", "Status", "Joined", ""].map((h, i) => (
                  <th
                    key={h || i}
                    className={`text-left text-[0.68rem] font-medium uppercase tracking-[0.06em] text-[var(--xiv-blue)] px-5 py-3 border-b border-[var(--blue-008)] whitespace-nowrap ${
                      i === 2 || i === 3 ? "hidden sm:table-cell" : ""
                    } ${i === 4 ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(member => (
                <tr
                  key={member.id}
                  className="border-b border-[var(--blue-008)] last:border-0 hover:bg-[var(--blue-004)] transition-colors"
                >
                  {/* Name */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarImage src={member.user?.image ?? undefined} />
                        <AvatarFallback className="text-[0.65rem] font-bold bg-gradient-to-br from-[var(--xiv-blue)] to-blue-700 text-white">
                          {member.user?.name?.slice(0, 2).toUpperCase() ?? "??"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{member.user?.name ?? "Unknown"}</span>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[0.7rem] font-medium px-2.5 py-0.5 rounded-full ${rolePill[member.role]}`}>
                        {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
                      </span>
                      {member.customRole && (
                        <span
                          className="text-[0.7rem] font-medium px-2.5 py-0.5 rounded-full border"
                          style={{
                            color: member.customRole.color,
                            borderColor: member.customRole.color + "55",
                            background: member.customRole.color + "18",
                          }}
                        >
                          {member.customRole.name}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* On-shift status */}
                  <td className="px-5 py-3.5 hidden sm:table-cell">
                    {member.isOnShift ? (
                      <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 relative">
                          <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                        </span>
                        On shift
                      </span>
                    ) : (
                      <span className="text-[0.72rem] text-[var(--fg-faint)]">Off shift</span>
                    )}
                  </td>

                  {/* Joined */}
                  <td className="px-5 py-3.5 text-sm text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                    {new Date(member.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5 text-right">
                    {canManage && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/dashboard/${slug}/staff/${member.id}`}>Edit</Link>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
