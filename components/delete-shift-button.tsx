"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

interface DeleteShiftButtonProps {
  venueSlug: string
  shiftId: string
  hasPayroll: boolean
}

export function DeleteShiftButton({ venueSlug, shiftId, hasPayroll }: DeleteShiftButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
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
      className="text-destructive hover:text-destructive"
      onClick={handleDelete}
      disabled={deleting}
      aria-label="Delete shift"
    >
      {deleting ? "..." : <Trash2 className="h-4 w-4" />}
    </Button>
  )
}
