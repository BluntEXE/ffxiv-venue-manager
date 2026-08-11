"use client"

import { useEffect, useMemo, useState } from "react"
import {
  formatServerTime,
  formatServerTimeRange,
  getServerTimeIntlOptions,
  SERVER_TIME_LABEL,
  type ServerTimeKind,
} from "@/lib/server-time"

// Re-exports so existing client-side imports (e.g. recharts tick formatters)
// keep working without churning their import paths.
export { formatServerTime, SERVER_TIME_LABEL }
export type { ServerTimeKind }

export function formatLocalTime(date: string | Date, kind: ServerTimeKind = "time"): string {
  const d = new Date(date)
  if (kind === "isoDate" || kind === "isoDateTime") return formatServerTime(date, kind)
  const { opts, locale } = getServerTimeIntlOptions(kind)
  return d.toLocaleString(locale, opts)
}

export function ServerTime({
  date,
  formatStr = "time",
  className,
}: {
  date: string | Date
  formatStr?: ServerTimeKind
  className?: string
}) {
  const formatted = useMemo(() => formatServerTime(date, formatStr), [date, formatStr])
  return <span className={className}>{formatted}</span>
}

export function ServerTimeRange({
  start,
  end,
  className,
}: {
  start: string | Date
  end: string | Date
  className?: string
}) {
  const formatted = useMemo(() => formatServerTimeRange(start, end), [start, end])
  return <span className={className}>{formatted}</span>
}

export function LocalTime({
  date,
  formatStr = "time",
  className,
}: {
  date: string | Date
  formatStr?: ServerTimeKind
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const formatted = useMemo(
    () => (mounted ? formatLocalTime(date, formatStr) : formatServerTime(date, formatStr)),
    [mounted, date, formatStr]
  )
  return <span className={className}>{formatted}</span>
}
