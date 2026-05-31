"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Heart } from "lucide-react"

interface VenueFollowButtonProps {
  venueId: string
  isFollowing: boolean
  followCount: number
}

export function VenueFollowButton({ venueId, isFollowing: initial, followCount: initialCount }: VenueFollowButtonProps) {
  const [following, setFollowing] = useState(initial)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/follow`, {
        method: following ? "DELETE" : "POST",
      })
      if (res.ok) {
        setFollowing(!following)
        setCount(c => following ? c - 1 : c + 1)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant={following ? "default" : "outline-blue"}
      size="sm"
      onClick={toggle}
      disabled={loading}
      className={following ? "bg-[var(--blue-012)] text-[var(--xiv-blue)] border border-[var(--blue-020)] hover:bg-[var(--destructive-soft)] hover:text-[var(--destructive)] hover:border-[rgba(243,139,168,0.3)]" : ""}
    >
      <Heart className={`h-3.5 w-3.5 ${following ? "fill-current" : ""}`} />
      {following ? `Following · ${count}` : `Follow · ${count}`}
    </Button>
  )
}
