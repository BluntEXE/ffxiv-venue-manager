"use client"

import { useState } from "react"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ChevronDown, Check } from "lucide-react"

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

  // Extract unique custom role names for additional filter tabs
  const customRoleNames = Array.from(
    new Set(members.map(m => m.customRole?.name).filter(Boolean) as string[])
  ).sort()

  const counts = {
    all:     members.length,
    owner:   members.filter(m => m.role === "OWNER").length,
    manager: members.filter(m => m.role === "MANAGER").length,
    staff:   members.filter(m => m.role === "STAFF").length,
    ...Object.fromEntries(customRoleNames.map(name => [name, members.filter(m => m.customRole?.name === name).length])),
  }

  const visible = members
    .filter(m => {
      if (filter === "owner"   && m.role !== "OWNER")   return false
      if (filter === "manager" && m.role !== "MANAGER") return false
      if (filter === "staff"   && m.role !== "STAFF")   return false
      // Custom role filter
      if (customRoleNames.includes(filter) && m.customRole?.name !== filter) return false
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
    // Add custom role tabs matching prototype (Hosts, Bar, DJ, etc.)
    ...customRoleNames.map(name => ({ key: name as Filter, label: name })),
  ]

  return (
    <div>
      {/* Filter bar — role select + search on one line */}
      <div className="flex items-center gap-3 mb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 h-9 px-3 rounded-[var(--radius-md)] border border-[var(--blue-015)] bg-[var(--card)] text-sm font-medium text-foreground hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] transition-colors flex-shrink-0">
              <span className="max-w-[120px] truncate">
                {tabs.find(t => t.key === filter)?.label ?? "All"}
              </span>
              <span className="text-[0.68rem] text-[var(--fg-faint)]">{counts[filter] ?? 0}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--fg-faint)] flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-[200px] border-[var(--blue-018)] bg-[rgba(7,11,20,0.97)] backdrop-blur-2xl"
          >
            {/* System roles */}
            {tabs.filter(t => ["all","owner","manager","staff"].includes(t.key)).map(({ key, label }) => (
              <DropdownMenuItem
                key={key}
                onClick={() => setFilter(key)}
                className={`flex items-center justify-between gap-2 cursor-pointer ${filter === key ? "text-[var(--xiv-blue)]" : ""}`}
              >
                <span>{label}</span>
                <span className="text-[0.68rem] text-[var(--fg-faint)]">{counts[key] ?? 0}</span>
                {filter === key && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              </DropdownMenuItem>
            ))}
            {/* Custom roles — only shown if any exist */}
            {tabs.some(t => !["all","owner","manager","staff"].includes(t.key)) && (
              <>
                <DropdownMenuSeparator className="bg-[var(--blue-008)]" />
                {tabs.filter(t => !["all","owner","manager","staff"].includes(t.key)).map(({ key, label }) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`flex items-center justify-between gap-2 cursor-pointer ${filter === key ? "text-[var(--xiv-blue)]" : ""}`}
                  >
                    <span>{label}</span>
                    <span className="text-[0.68rem] text-[var(--fg-faint)]">{counts[key] ?? 0}</span>
                    {filter === key && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="relative flex items-center flex-1 min-w-0 max-w-xs">
          <svg className="absolute left-3 w-4 h-4 text-[var(--fg-faint)] pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <Input
            className="pl-9 bg-[var(--card)] border-[var(--blue-015)] focus:border-[var(--blue-035)] h-9 text-sm"
            placeholder="Search staff…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
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
