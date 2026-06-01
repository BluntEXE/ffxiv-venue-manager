"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export function SyncPartakeButton({ venueId }: { venueId: string }) {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const sync = async () => {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/sync-partake`, { method: "POST" })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Sync failed")
      }
      const d = await res.json()
      setResult(`${d.results.created} new · ${d.results.updated} updated`)
      setTimeout(() => setResult(null), 4000)
    } catch (err: unknown) {
      setResult(err instanceof Error ? err.message : "Sync failed")
      setTimeout(() => setResult(null), 4000)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline-blue" size="sm" onClick={sync} disabled={syncing}>
        <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        {syncing ? "Syncing…" : "Import from Partake.gg"}
      </Button>
      {result && <span className="text-xs text-emerald-400">{result}</span>}
    </div>
  )
}
