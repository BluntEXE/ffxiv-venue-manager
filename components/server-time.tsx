"use client"

import { useMemo } from "react"

// All times displayed in UTC = FFXIV Server Time (ST)
const TZ = "Etc/UTC"
const LABEL = "ST"

export function ServerTime({
  date,
  formatStr = "time",
  className,
}: {
  date: string | Date
  formatStr?: "time" | "datetime" | "date"
  className?: string
}) {
  const formatted = useMemo(() => {
    const d = new Date(date)
    const opts: Intl.DateTimeFormatOptions = { timeZone: TZ }

    if (formatStr === "time") {
      opts.hour = "numeric"
      opts.minute = "2-digit"
    } else if (formatStr === "datetime") {
      opts.month = "short"
      opts.day = "numeric"
      opts.hour = "numeric"
      opts.minute = "2-digit"
    } else {
      opts.month = "short"
      opts.day = "numeric"
    }

    return d.toLocaleString("en-US", opts)
  }, [date, formatStr])

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
