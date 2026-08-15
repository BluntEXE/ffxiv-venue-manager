"use client"

import { useEffect, useState } from "react"
import { formatLocalTime, formatServerTime } from "@/components/server-time"

/**
 * "Tuesday, 15 Aug" header label in the viewer's local time.
 *
 * Takes the server's own `now` as a prop rather than calling `new Date()`
 * itself - a self-computed timestamp would run its initializer separately
 * on the server (request time) and the client (hydration time), which are
 * different instants. That's normally harmless, but this component only
 * shows day-granularity text, so the rare case where those two instants
 * land on opposite sides of a UTC midnight boundary would render different
 * text server vs. client-pre-mount - a real hydration mismatch, not just
 * the expected post-mount ST-to-local flip every other LocalTime-pattern
 * component here relies on. Passing the same Date down as a prop keeps
 * this component's pre-mount render identical to the server's, exactly
 * like every other formatter in this file already assumes.
 */
export function TodayDateLabel({ now }: { now: Date }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return <>{mounted ? formatLocalTime(now, "dayheader") : formatServerTime(now, "dayheader")}</>
}
