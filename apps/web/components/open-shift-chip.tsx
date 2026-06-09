"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface OpenShiftChipProps {
  shiftId: string
  venueId: string
  timeLabel: string
  canClaim: boolean
}

export function OpenShiftChip({ shiftId, venueId, timeLabel, canClaim }: OpenShiftChipProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClaim() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/venues/${venueId}/shifts/${shiftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim" }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Failed to claim shift")
      setLoading(false)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="shift-chip op">{timeLabel}</span>
      {canClaim && (
        <button
          onClick={handleClaim}
          disabled={loading}
          className="text-[0.62rem] font-semibold px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50 self-start"
        >
          {loading ? "Claiming..." : "Claim"}
        </button>
      )}
      {error && <p className="text-[0.6rem] text-red-400">{error}</p>}
    </div>
  )
}
