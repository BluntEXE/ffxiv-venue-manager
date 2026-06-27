"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface CancelSeriesButtonProps {
  venueId: string
  eventId: string
  venueSlug: string
}

export function CancelSeriesButton({ venueId, eventId, venueSlug }: CancelSeriesButtonProps) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const handleCancel = async () => {
    setIsPending(true)
    try {
      const response = await fetch(`/api/venues/${venueId}/events/${eventId}/cancel-series`, {
        method: "POST",
      })
      if (!response.ok) throw new Error("Failed to cancel series")
      router.push(`/dashboard/${venueSlug}/events`)
      router.refresh()
    } catch (error) {
      console.error("Error cancelling series:", error)
      alert("Failed to cancel series. Please try again.")
      setIsPending(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
          Cancel Series
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel recurring series?</AlertDialogTitle>
          <AlertDialogDescription>
            All future instances of this recurring event will be cancelled. Past and active events are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep series</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancel}
            disabled={isPending}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            {isPending ? "Cancelling..." : "Cancel all future events"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
