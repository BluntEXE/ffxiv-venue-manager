"use client"

import { useEffect } from "react"

export function ActiveVenueTracker({ slug }: { slug: string }) {
  useEffect(() => {
    document.cookie = `xiv-active-venue=${slug}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
  }, [slug])

  return null
}
