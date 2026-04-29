// FFXIV Data Center → IANA timezone mapping
// All times displayed as "Server Time" (the DC's local timezone)

const DC_TIMEZONES: Record<string, string> = {
  // NA
  Aether: "America/New_York",
  Primal: "America/New_York",
  Crystal: "America/New_York",
  Dynamis: "America/New_York",
  // EU
  Chaos: "Etc/UTC",
  Light: "Etc/UTC",
  // JP
  Elemental: "Asia/Tokyo",
  Gaia: "Asia/Tokyo",
  Mana: "Asia/Tokyo",
  Meteor: "Asia/Tokyo",
  // OCE
  Materia: "Australia/Sydney",
}

export function getServerTimezone(dataCenter: string | null | undefined): string {
  if (!dataCenter) return "Etc/UTC"
  return DC_TIMEZONES[dataCenter] ?? "Etc/UTC"
}

export function getServerTimeLabel(_dataCenter: string | null | undefined): string {
  return "ST"
}

// All times displayed in UTC = FFXIV Server Time (ST). The formatters below
// are pure functions, deliberately NOT in components/server-time.tsx so they
// can be called from React Server Components.

const ST_TZ = "Etc/UTC"
export const SERVER_TIME_LABEL = "ST"

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

  if (kind === "isoDate") return d.toISOString().slice(0, 10)
  if (kind === "isoDateTime") return d.toISOString().replace("T", " ").slice(0, 19)

  const opts: Intl.DateTimeFormatOptions = { timeZone: ST_TZ }
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

export function formatServerTimeRange(start: string | Date, end: string | Date): string {
  const s = new Date(start)
  const e = new Date(end)
  const dateStr = s.toLocaleString("en-US", { timeZone: ST_TZ, month: "short", day: "numeric" })
  const startTime = s.toLocaleString("en-US", { timeZone: ST_TZ, hour: "numeric", minute: "2-digit" })
  const endTime = e.toLocaleString("en-US", { timeZone: ST_TZ, hour: "numeric", minute: "2-digit" })
  return `${dateStr} · ${startTime} — ${endTime} ${SERVER_TIME_LABEL}`
}
