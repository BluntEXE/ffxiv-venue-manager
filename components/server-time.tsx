"use client"

import { useMemo } from "react"

// All times displayed in UTC = FFXIV Server Time (ST)
const TZ = "Etc/UTC"
const LABEL = "ST"

/**
 * Format a date as Server Time (UTC) — non-component variant for use in
 * Recharts tick formatters, CSV exports, anywhere a string is needed.
 * Output matches the <ServerTime> component for consistency.
 */
export type ServerTimeKind =
  | "time"          // 8:54 PM
  | "datetime"      // Apr 28, 8:54 PM
  | "date"          // Apr 28
  | "datelong"      // April 28, 2026
  | "datetimelong"  // Apr 28, 2026, 8:54 PM
  | "isoDate"       // 2026-04-28
  | "isoDateTime"   // 2026-04-28 20:54:10

export function formatServerTime(
  date: string | Date,
  kind: ServerTimeKind = "time"
): string {
  const d = new Date(date)

  // ISO variants are derived from toISOString (always UTC, fixed format).
  if (kind === "isoDate") return d.toISOString().slice(0, 10)
  if (kind === "isoDateTime") return d.toISOString().replace("T", " ").slice(0, 19)

  const opts: Intl.DateTimeFormatOptions = { timeZone: TZ }
  if (kind === "time") {
    opts.hour = "numeric"; opts.minute = "2-digit"
  } else if (kind === "datetime") {
    opts.month = "short"; opts.day = "numeric"
    opts.hour = "numeric"; opts.minute = "2-digit"
  } else if (kind === "date") {
    opts.month = "short"; opts.day = "numeric"
  } else if (kind === "datelong") {
    opts.year = "numeric"; opts.month = "long"; opts.day = "numeric"
  } else if (kind === "datetimelong") {
    opts.year = "numeric"; opts.month = "short"; opts.day = "numeric"
    opts.hour = "numeric"; opts.minute = "2-digit"
  }
  return d.toLocaleString("en-US", opts)
}

export const SERVER_TIME_LABEL = LABEL

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
  // Accept but ignore these for backwards compat with existing call sites
  timezone: _tz,
  tzLabel: _label,
}: {
  start: string | Date
  end: string | Date
  className?: string
  timezone?: string
  tzLabel?: string
}) {
  const formatted = useMemo(() => {
    const s = new Date(start)
    const e = new Date(end)
    const dateStr = s.toLocaleString("en-US", {
      timeZone: TZ,
      month: "short",
      day: "numeric",
    })
    const startTime = s.toLocaleString("en-US", {
      timeZone: TZ,
      hour: "numeric",
      minute: "2-digit",
    })
    const endTime = e.toLocaleString("en-US", {
      timeZone: TZ,
      hour: "numeric",
      minute: "2-digit",
    })
    return `${dateStr} \u00b7 ${startTime} \u2014 ${endTime} ${LABEL}`
  }, [start, end])

  return <span className={className}>{formatted}</span>
}
