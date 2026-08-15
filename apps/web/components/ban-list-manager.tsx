"use client"

import { useState } from "react"
import { formatLocalTime } from "@/components/server-time"
import { DataTable } from "@/components/ui/data-table"

export type BannedPatron = {
  id: string
  characterName: string
  world: string
  banReason: string | null
  bannedAt: string | null
  bannedBy: { id: string; name: string | null } | null
}

export function BanListManager({
  venueId,
  patrons,
}: {
  venueId: string
  patrons: BannedPatron[]
}) {
  const [localPatrons, setLocalPatrons] = useState(patrons)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  async function unban(patron: BannedPatron) {
    if (pendingIds.has(patron.id)) return
    setPendingIds((prev) => new Set(prev).add(patron.id))
    setLocalPatrons((prev) => prev.filter((p) => p.id !== patron.id))
    try {
      const res = await fetch(`/api/venues/${venueId}/patrons/${patron.id}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBanned: false }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalPatrons((prev) => (prev.some((p) => p.id === patron.id) ? prev : [...prev, patron]))
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(patron.id)
        return next
      })
    }
  }

  return (
    <div className="panel">
      <DataTable
        columns={[
          { label: "Patron" },
          { label: "World", hideOnMobile: true },
          { label: "Reason" },
          { label: "Banned by", hideOnMobile: true },
          { label: "Banned at", hideOnMobile: true },
          { label: "" },
        ]}
        isEmpty={localPatrons.length === 0}
        emptyMessage="No patrons currently banned."
      >
        {localPatrons.map((p) => (
          <tr key={p.id}>
            <td className="t-name">{p.characterName}</td>
            <td className="hide t-muted">{p.world || "—"}</td>
            <td>{p.banReason || <span className="t-muted">—</span>}</td>
            <td className="hide t-muted">{p.bannedBy?.name ?? "—"}</td>
            <td className="hide t-muted">{p.bannedAt ? formatLocalTime(p.bannedAt, "datetime") : "—"}</td>
            <td>
              <button
                type="button"
                onClick={() => unban(p)}
                disabled={pendingIds.has(p.id)}
                className="tag neutral"
                style={{ cursor: pendingIds.has(p.id) ? "default" : "pointer", opacity: pendingIds.has(p.id) ? 0.6 : 1 }}
              >
                Unban
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}
