"use client"

import { useMemo } from "react"
import {
  formatServerTime,
  formatServerTimeRange,
  SERVER_TIME_LABEL,
  type ServerTimeKind,
} from "@/lib/server-time"

// Re-exports so existing client-side imports (e.g. recharts tick formatters)
// keep working without churning their import paths.
export { formatServerTime, SERVER_TIME_LABEL }
export type { ServerTimeKind }

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
  timezone: _tz,
  tzLabel: _label,
}: {
  start: string | Date
  end: string | Date
  className?: string
  timezone?: string
  tzLabel?: string
}) {
  const formatted = useMemo(() => formatServerTimeRange(start, end), [start, end])
  return <span className={className}>{formatted}</span>
}
