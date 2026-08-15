"use client"

import { useEffect, useState } from "react"
import { formatLocalTime, formatServerTime } from "@/components/server-time"

/**
 * "Tuesday, 15 Aug" header label in the viewer's local time. Can't be a
 * prop-driven <LocalTime date=... /> since there's no fixed timestamp to
 * format - this needs to read "now" itself, which requires being a client
 * component (Server Components can't useState/useEffect).
 */
export function TodayDateLabel() {
  const [now] = useState(() => new Date())
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return <>{mounted ? formatLocalTime(now, "dayheader") : formatServerTime(now, "dayheader")}</>
}
