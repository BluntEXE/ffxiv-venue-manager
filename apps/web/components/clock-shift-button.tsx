"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { LogIn, LogOut } from "lucide-react"

interface ClockShiftButtonProps {
  venueSlug: string
  shiftId: string
  action: "clock-in" | "clock-out"
  staffName: string
}

export function ClockShiftButton({ venueSlug, shiftId, action, staffName }: ClockShiftButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    const label = action === "clock-in" ? "Clock in" : "Clock out"
    if (!confirm(`${label} ${staffName}?`)) return

    setLoading(true)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/shifts/${shiftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || `Failed (${res.status})`)
        return
      }
      router.refresh()
    } catch {
      alert("Network error.")
    } finally {
      setLoading(false)
    }
  }

  const isClockIn = action === "clock-in"

  return (
    <Button
      variant="ghost"
      size="sm"
      className={isClockIn ? "text-emerald-500 hover:text-emerald-400" : "text-amber-500 hover:text-amber-400"}
      onClick={handleClick}
      disabled={loading}
      aria-label={isClockIn ? "Clock in staff" : "Clock out staff"}
    >
      {loading ? "..." : isClockIn ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
    </Button>
  )
}
