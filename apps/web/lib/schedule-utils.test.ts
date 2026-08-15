import { describe, it, expect, afterEach } from "vitest"
import { utcWeeklyToLocal, localDayOf, formatLocalEntryTime, type ScheduleEntry } from "./schedule-utils"

const originalTZ = process.env.TZ

afterEach(() => {
  process.env.TZ = originalTZ
})

describe("utcWeeklyToLocal", () => {
  it("keeps the same weekday/time when local offset is UTC+0", () => {
    process.env.TZ = "Etc/UTC"
    expect(utcWeeklyToLocal(2, 14, 30)).toEqual({ day: 2, hour: 14, minute: 30 })
  })

  it("shifts to the next local weekday when a late UTC time crosses local midnight", () => {
    // Saturday 23:30 UTC, Europe/London is UTC+1 in August (BST) -> Sunday 00:30 local
    process.env.TZ = "Europe/London"
    expect(utcWeeklyToLocal(6, 23, 30)).toEqual({ day: 0, hour: 0, minute: 30 })
  })

  it("shifts to the previous local weekday when a negative offset crosses local midnight backwards", () => {
    // Sunday 00:15 UTC, Pacific/Honolulu is UTC-10 -> Saturday 14:15 local
    process.env.TZ = "Pacific/Honolulu"
    expect(utcWeeklyToLocal(0, 0, 15)).toEqual({ day: 6, hour: 14, minute: 15 })
  })
})

describe("localDayOf", () => {
  it("returns the local weekday an entry's start time falls on", () => {
    process.env.TZ = "Europe/London"
    const entry: ScheduleEntry = {
      id: "1", venueId: "v1", day: 6, startHour: 23, startMin: 30,
      endHour: null, endMin: null, crossesMidnight: false,
      interval: "WEEKLY", weekOfMonth: null, commencing: null, label: null,
    }
    expect(localDayOf(entry)).toBe(0)
  })
})

describe("formatLocalEntryTime", () => {
  it("formats a same-day entry with no ST suffix", () => {
    process.env.TZ = "Etc/UTC"
    const entry: ScheduleEntry = {
      id: "1", venueId: "v1", day: 2, startHour: 20, startMin: 0,
      endHour: 22, endMin: 30, crossesMidnight: false,
      interval: "WEEKLY", weekOfMonth: null, commencing: null, label: null,
    }
    expect(formatLocalEntryTime(entry)).toBe("8 PM – 10:30 PM")
  })

  it("resolves the end time's local weekday separately for a crossesMidnight entry", () => {
    // Saturday 23:00 -> Sunday 01:00 UTC. In Europe/London (BST, +1) both shift
    // to Sunday 00:00 -> Sunday 02:00 local, so the end stays same-day.
    process.env.TZ = "Europe/London"
    const entry: ScheduleEntry = {
      id: "1", venueId: "v1", day: 6, startHour: 23, startMin: 0,
      endHour: 1, endMin: 0, crossesMidnight: true,
      interval: "WEEKLY", weekOfMonth: null, commencing: null, label: null,
    }
    expect(formatLocalEntryTime(entry)).toBe("12 AM – 2 AM")
  })
})
