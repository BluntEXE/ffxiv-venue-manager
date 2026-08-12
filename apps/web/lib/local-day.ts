/** "2026-01-15" for the given date, as a calendar day in the given IANA timezone. */
export function localDayKey(d: Date | string, timeZone: string): string {
  const date = new Date(d)
  // en-CA gives YYYY-MM-DD directly, no manual reformatting needed.
  return date.toLocaleDateString("en-CA", { timeZone })
}

/** "10PM" or "10:30PM", read in the given IANA timezone. */
export function localHourLabel(d: Date | string, timeZone: string): string {
  const date = new Date(d)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date)
  const hour = parts.find((p) => p.type === "hour")?.value ?? ""
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00"
  const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toUpperCase()
  return minute === "00" ? `${hour}${dayPeriod}` : `${hour}:${minute}${dayPeriod}`
}

/** The viewer's IANA timezone, e.g. "Europe/London". Client-only. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** "HH:mm" (24h) for a date in the given timezone, for form input prefill. */
export function localTimeInput(d: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d))
}
