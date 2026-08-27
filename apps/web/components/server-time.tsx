"use client"

import { useMemo } from "react"
import {
  formatServerTime,
  formatServerTimeRange,
  formatLocalTimeRange,
  getServerTimeIntlOptions,
  SERVER_TIME_LABEL,
  type ServerTimeKind,
} from "@/lib/server-time"
import { useMounted } from "@/lib/use-mounted"

// Re-exports so existing client-side imports (e.g. recharts tick formatters)
// keep working without churning their import paths.
export { formatServerTime, SERVER_TIME_LABEL }
export type { ServerTimeKind }

export function formatLocalTime(date: string | Date, kind: ServerTimeKind = "time"): string {
  const d = new Date(date)
  if (kind === "isoDate" || kind === "isoDateTime") {
    const pad = (n: number) => String(n).padStart(2, "0")
    const isoDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    if (kind === "isoDate") return isoDate
    return `${isoDate} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
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

export function LocalTimeRange({
  start,
  end,
  className,
}: {
  start: string | Date
  end: string | Date
  className?: string
}) {
  const mounted = useMounted()
  const formatted = useMemo(
    () => (mounted ? formatLocalTimeRange(start, end) : formatServerTimeRange(start, end)),
    [mounted, start, end]
  )
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
  const mounted = useMounted()
  const formatted = useMemo(
    () => (mounted ? formatLocalTime(date, formatStr) : formatServerTime(date, formatStr)),
    [mounted, date, formatStr]
  )
  return <span className={className}>{formatted}</span>
}
