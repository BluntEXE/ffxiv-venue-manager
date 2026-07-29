"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { Trash2, Repeat } from "lucide-react"

interface DeleteShiftButtonProps {
  venueSlug: string
  shiftId: string
  hasPayroll: boolean
  isRecurring?: boolean
}

export function DeleteShiftButton({ venueSlug, shiftId, hasPayroll, isRecurring }: DeleteShiftButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (isRecurring) {
      if (!confirm("Cancel this entire recurring series? All future instances will be cancelled. This cannot be undone.")) return
      setDeleting(true)
      try {
        const res = await fetch(`/api/venues/${venueSlug}/shifts/${shiftId}/cancel-series`, {
          method: "POST",
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          alert(body.error || `Cancel failed (${res.status})`)
          return
        }
        router.refresh()
      } catch (err) {
        alert("Network error cancelling series.")
      } finally {
        setDeleting(false)
      }
      return
    }

    const warning = hasPayroll
      ? "Delete this shift and its linked payroll entry? This cannot be undone."
      : "Delete this shift? This cannot be undone."
    if (!confirm(warning)) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/shifts/${shiftId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || `Delete failed (${res.status})`)
        return
      }
      router.refresh()
    } catch (err) {
      alert("Network error deleting shift.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={isRecurring ? "text-amber-400 hover:text-amber-400" : "text-destructive hover:text-destructive"}
      onClick={handleDelete}
      disabled={deleting}
      aria-label={isRecurring ? "Cancel series" : "Delete shift"}
    >
      {deleting ? "..." : isRecurring ? <Repeat className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  )
}
