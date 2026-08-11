import { describe, it, expect } from "vitest"
import { formatServerTime } from "./server-time"

describe("formatServerTime", () => {
  it("formats 'weekdatelong' as weekday, month, day, year", () => {
    expect(formatServerTime("2026-04-28T20:54:00Z", "weekdatelong")).toBe(
      "Tuesday, April 28, 2026"
    )
  })

  it("formats 'weekdate' as weekday, month, day (no year)", () => {
    expect(formatServerTime("2026-04-28T20:54:00Z", "weekdate")).toBe(
      "Tuesday, April 28"
    )
  })

  it("formats 'shiftdate' as short weekday, day, short month", () => {
    expect(formatServerTime("2026-04-28T20:54:00Z", "shiftdate")).toBe(
      "Tue, 28 Apr"
    )
  })

  it("formats 'dayheader' as long weekday, day, short month", () => {
    expect(formatServerTime("2026-04-28T20:54:00Z", "dayheader")).toBe(
      "Tuesday, 28 Apr"
    )
  })

  it("formats 'datewithyear' as short month, day, year", () => {
    expect(formatServerTime("2026-04-28T20:54:00Z", "datewithyear")).toBe(
      "Apr 28, 2026"
    )
  })

  it("formats 'monthyear' as short month, year", () => {
    expect(formatServerTime("2026-04-28T20:54:00Z", "monthyear")).toBe(
      "April 2026"
    )
  })

  it("formats 'weekdatelong' correctly across a year rollover", () => {
    expect(formatServerTime("2025-12-31T23:30:00Z", "weekdatelong")).toBe(
      "Wednesday, December 31, 2025"
    )
    expect(formatServerTime("2026-01-01T00:30:00Z", "weekdatelong")).toBe(
      "Thursday, January 1, 2026"
    )
  })

  it("formats 'shiftdate'/'dayheader' with single-digit day, no zero padding", () => {
    expect(formatServerTime("2026-01-01T00:30:00Z", "shiftdate")).toBe(
      "Thu, 1 Jan"
    )
    expect(formatServerTime("2026-01-01T00:30:00Z", "dayheader")).toBe(
      "Thursday, 1 Jan"
    )
  })
})
