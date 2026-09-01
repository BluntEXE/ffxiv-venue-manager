// Utility functions for venue opening schedule entries.
// All times are UTC (= FFXIV Server Time). No timezone conversion needed.

import type { HoursRow } from "@/lib/api/xvm-api"

export type ScheduleEntry = {
  id: string
  venueId: string
  day: number
  startHour: number
  startMin: number
  endHour: number | null
  endMin: number | null
  crossesMidnight: boolean
  interval: string
  weekOfMonth: number | null
  commencing: Date | string | null
  label: string | null
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function formatHHMM(h: number, m: number): string {
  const period = h >= 12 ? "PM" : "AM"
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  const displayM = m === 0 ? "" : `:${String(m).padStart(2, "0")}`
  return `${displayH}${displayM} ${period}`
}

export type LocalDayTime = { day: number; hour: number; minute: number }

/**
 * Converts a weekly-recurring UTC (weekday, hour, minute) slot to its local
 * equivalent, anchored to the nearest real occurrence of that weekday. Local
 * day can differ from the UTC day when the local offset pushes the time
 * across midnight. During the ~1 week a slot straddles a DST transition the
 * result may be off by the DST delta until the offset stabilizes — accepted,
 * documented ceiling (this file has no DST special-casing anywhere).
 */
export function utcWeeklyToLocal(day: number, hour: number, minute: number): LocalDayTime {
  const now = new Date()
  const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0))
  let offset = day - now.getUTCDay()
  if (offset > 3) offset -= 7
  else if (offset < -3) offset += 7
  ref.setUTCDate(ref.getUTCDate() + offset)
  return { day: ref.getDay(), hour: ref.getHours(), minute: ref.getMinutes() }
}

export function formatEntryTime(entry: ScheduleEntry): string {
  const start = formatHHMM(entry.startHour, entry.startMin)
  if (entry.endHour == null) return `${start} ST`
  const end = formatHHMM(entry.endHour, entry.endMin ?? 0)
  return `${start} – ${end} ST`
}

export function localDayOf(entry: ScheduleEntry): number {
  return utcWeeklyToLocal(entry.day, entry.startHour, entry.startMin).day
}

export function formatLocalEntryTime(entry: ScheduleEntry): string {
  const start = utcWeeklyToLocal(entry.day, entry.startHour, entry.startMin)
  const startStr = formatHHMM(start.hour, start.minute)
  if (entry.endHour == null) return startStr
  const endDay = entry.crossesMidnight ? (entry.day + 1) % 7 : entry.day
  const end = utcWeeklyToLocal(endDay, entry.endHour, entry.endMin ?? 0)
  return `${startStr} – ${formatHHMM(end.hour, end.minute)}`
}

export function formatIntervalLabel(entry: ScheduleEntry): string {
  if (entry.interval === "WEEKLY") return "Weekly"
  if (entry.interval === "BIWEEKLY") return "Every 2 weeks"
  if (entry.interval === "MONTHLY") {
    const ordinals = ["", "1st", "2nd", "3rd", "4th", "Last"]
    return `${ordinals[entry.weekOfMonth ?? 1] ?? "Monthly"} of month`
  }
  return entry.interval
}

// xvm-api's Interval vocabulary is lowercase and includes monthly_by_date,
// which ScheduleEntry has no field for (only weekOfMonth, used by
// monthly_by_weekday) - those rules are filtered out of the display rather
// than rendered with a wrong/missing day, a narrow known gap until
// ScheduleEntry (or its display) grows a day-of-month field.
const XVM_INTERVAL_LABEL: Record<string, string> = {
  weekly: "WEEKLY",
  biweekly: "BIWEEKLY",
  monthly_by_weekday: "MONTHLY",
}

export function xvmHoursToScheduleEntries(rows: HoursRow[]): ScheduleEntry[] {
  return rows
    .filter((r) => r.rule.interval !== "monthly_by_date")
    .map((r) => {
      const rule = r.rule
      // xvm-api's weekday is 0=Monday; ScheduleEntry.day is 0=Sunday (JS getUTCDay()).
      const day = rule.weekday != null ? (rule.weekday + 1) % 7 : 0
      const endTotal = rule.start_minute_of_day + rule.duration_minutes
      const endMinuteOfDay = endTotal % 1440
      return {
        id: String(r.id),
        venueId: "",
        day,
        startHour: Math.floor(rule.start_minute_of_day / 60),
        startMin: rule.start_minute_of_day % 60,
        endHour: Math.floor(endMinuteOfDay / 60),
        endMin: endMinuteOfDay % 60,
        crossesMidnight: endTotal >= 1440,
        interval: XVM_INTERVAL_LABEL[rule.interval] ?? rule.interval.toUpperCase(),
        weekOfMonth: rule.week_of_month,
        commencing: rule.anchor_date,
        label: r.label,
      }
    })
}

