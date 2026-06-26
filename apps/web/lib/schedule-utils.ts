// Utility functions for venue opening schedule entries.
// All times are UTC (= FFXIV Server Time). No timezone conversion needed.

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
export const DAY_SHORT  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function formatHHMM(h: number, m: number): string {
  const period   = h >= 12 ? "PM" : "AM"
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  const displayM = m === 0 ? "" : `:${String(m).padStart(2, "0")}`
  return `${displayH}${displayM} ${period}`
}

export function formatEntryTime(entry: ScheduleEntry): string {
  const start = formatHHMM(entry.startHour, entry.startMin)
  if (entry.endHour == null) return `${start} ST`
  const end = formatHHMM(entry.endHour, entry.endMin ?? 0)
  return `${start} – ${end} ST`
}

export function formatIntervalLabel(entry: ScheduleEntry): string {
  if (entry.interval === "WEEKLY")   return "Weekly"
  if (entry.interval === "BIWEEKLY") return "Every 2 weeks"
  if (entry.interval === "MONTHLY") {
    const ordinals = ["", "1st", "2nd", "3rd", "4th", "Last"]
    return `${ordinals[entry.weekOfMonth ?? 1] ?? "Monthly"} of month`
  }
  return entry.interval
}

export function isOpenNow(entries: ScheduleEntry[]): boolean {
  return entries.some(isEntryActiveNow)
}

function isEntryActiveNow(entry: ScheduleEntry): boolean {
  const now        = new Date()
  const todayDay   = now.getUTCDay()
  const currentMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  const startMin   = entry.startHour * 60 + entry.startMin
  const endMin     = entry.endHour != null ? entry.endHour * 60 + (entry.endMin ?? 0) : null

  if (!matchesInterval(entry, now)) return false

  // Direct day match
  if (entry.day === todayDay) {
    if (endMin == null)              return currentMin >= startMin
    if (!entry.crossesMidnight)      return currentMin >= startMin && currentMin < endMin
    return currentMin >= startMin    // crosses midnight: today's portion is start → midnight
  }

  // Crosses-midnight: are we in the "after midnight" window (next calendar day)?
  if (entry.crossesMidnight && endMin != null) {
    const prevDay = (todayDay + 6) % 7
    if (entry.day === prevDay) return currentMin < endMin
  }

  return false
}

function matchesInterval(entry: ScheduleEntry, now: Date): boolean {
  if (entry.interval === "WEEKLY") return true

  if (entry.interval === "BIWEEKLY") {
    if (!entry.commencing) return true
    const anchor    = new Date(entry.commencing)
    const diffMs    = now.getTime() - anchor.getTime()
    const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000))
    return diffWeeks >= 0 && diffWeeks % 2 === 0
  }

  if (entry.interval === "MONTHLY" && entry.weekOfMonth != null) {
    if (entry.weekOfMonth === 5) return isLastWeekdayOfMonth(now, entry.day)
    return getWeekdayOccurrence(now, entry.day) === entry.weekOfMonth
  }

  return true
}

function getWeekdayOccurrence(date: Date, weekday: number): number {
  const year   = date.getUTCFullYear()
  const month  = date.getUTCMonth()
  const target = date.getUTCDate()
  let count = 0
  for (let d = 1; d <= target; d++) {
    if (new Date(Date.UTC(year, month, d)).getUTCDay() === weekday) count++
  }
  return count
}

function isLastWeekdayOfMonth(date: Date, weekday: number): boolean {
  if (date.getUTCDay() !== weekday) return false
  const year  = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const days  = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const target = date.getUTCDate()
  for (let d = target + 1; d <= days; d++) {
    if (new Date(Date.UTC(year, month, d)).getUTCDay() === weekday) return false
  }
  return true
}
