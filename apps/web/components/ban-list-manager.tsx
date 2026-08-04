"use client"

import { useState } from "react"
import { formatServerTime } from "@/lib/server-time"

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
    const prevList = localPatrons
    setLocalPatrons((prev) => prev.filter((p) => p.id !== patron.id))
    try {
      const res = await fetch(`/api/venues/${venueId}/patrons/${patron.id}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBanned: false }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalPatrons(prevList)
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(patron.id)
        return next
      })
    }
  }

  if (localPatrons.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-12">No patrons currently banned.</p>
  }

  return (
    <div className="panel">
      <table className="dtable">
        <thead>
          <tr>
            <th>Patron</th>
            <th className="hide">World</th>
            <th>Reason</th>
            <th className="hide">Banned by</th>
            <th className="hide">Banned at</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {localPatrons.map((p) => (
            <tr key={p.id}>
              <td className="t-name">{p.characterName}</td>
              <td className="hide t-muted">{p.world || "—"}</td>
              <td>{p.banReason || <span className="t-muted">—</span>}</td>
              <td className="hide t-muted">{p.bannedBy?.name ?? "—"}</td>
              <td className="hide t-muted">{p.bannedAt ? formatServerTime(p.bannedAt, "datetime") : "—"}</td>
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
        </tbody>
      </table>
    </div>
  )
}
