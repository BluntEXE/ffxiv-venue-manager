"use client"

import { format, formatDistanceToNow } from "date-fns"

interface LocalTimeProps {
  date: string | Date
  formatStr?: string
  className?: string
}

export function LocalTime({ date, formatStr = "h:mm a", className }: LocalTimeProps) {
  return <span className={className}>{format(new Date(date), formatStr)}</span>
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
  const s = new Date(start)
  const e = new Date(end)
  return (
    <span className={className}>
      {format(s, "MMM d")} &middot; {format(s, "h:mm a")} - {format(e, "h:mm a")}
    </span>
  )
}

export function LocalRelativeTime({ date, className }: LocalTimeProps) {
  return (
    <span className={className}>
      {formatDistanceToNow(new Date(date), { addSuffix: true })}
    </span>
  )
}
