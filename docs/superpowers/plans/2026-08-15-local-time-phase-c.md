# Local Time Phase C — Day-Grouping Schedule Displays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the remaining ST-only day-grouping schedule/event displays to viewer-local time, completing the local-time policy started in Phase A/B (`docs/superpowers/plans/2026-08-15-local-time-phase-a.md`, `-phase-b.md`).

**Architecture:** Two weekly-recurring schedule widgets (`VenueScheduleDisplay`, `FfxivvenuesScheduleDisplay`) currently bucket entries by UTC weekday computed server-side — these become client components using the existing `mounted` guard pattern (pre-mount renders the old ST-bucketed table as a stable fallback, post-mount swaps to a local-bucketed table), because which local weekday an entry falls under can only be known in the viewer's browser. A new pure helper `utcWeeklyToLocal` in `lib/schedule-utils.ts` converts a `(weekday, hour, minute)` triple to its local equivalent by anchoring to the nearest real occurrence of that weekday and reading `Date.prototype.getDay/getHours/getMinutes`. Two event-list pages (`events/page.tsx`, `venues/[slug]/page.tsx`) get simpler per-row swaps — each event already has a concrete UTC `Date`, so no day-shifting logic is needed there, just replacing `formatServerTime`/raw `getUTCDate()` calls with the existing `<LocalTime>`/`<LocalTimeRange>` client components (adding two new `ServerTimeKind` cases, `monthShort` and `dayOfMonth`, so the calendar "date box" tiles can render local month/day without hydration-risk string splitting).

**Tech Stack:** Next.js 16 App Router (Server + Client Components), TypeScript strict, `Intl.DateTimeFormat` via existing `lib/server-time.ts`, Vitest.

**Known ceiling (documented, not fixed here):** `utcWeeklyToLocal` computes the local day/time for a *recurring* weekly slot using the current UTC↔local offset. During the ~1 week a schedule entry straddles a DST transition, the displayed local day/time may be off by the DST delta (e.g. 1 hour) until the offset stabilizes. This matches how the rest of the app already treats DST (no special-casing anywhere), and affects only a cosmetic weekly-hours display, not bookings or financial data.

**Explicitly out of scope:** the legacy free-text "hours" fallback path in `app/venues/[slug]/page.tsx` (`openDays`/`defaultHours`/`openNights`, used only when a venue has no structured `scheduleEntries`) stays ST-labeled — it has no structured start/end times to convert, only a day-open bitset and a free-text string. The `isOpenNow`/`matchesInterval`/`getWeekdayOccurrence` business-logic functions in `lib/schedule-utils.ts` stay UTC — they're backend logic (compute a boolean), not user-facing display, per the original Phase A/B policy ("only use ST on the backend, non user facing").

---

## File Structure

- Modify: `apps/web/lib/server-time.ts` — add `monthShort`/`dayOfMonth` `ServerTimeKind` cases.
- Modify: `apps/web/lib/server-time.test.ts` — cover the two new kinds.
- Modify: `apps/web/lib/schedule-utils.ts` — add `utcWeeklyToLocal`, `localDayOf`, `formatLocalEntryTime`.
- Create: `apps/web/lib/schedule-utils.test.ts` — cover the new local-time helpers, including a day-shift-across-midnight case.
- Modify: `apps/web/components/venue-schedule-display.tsx` — client component, local-bucketed with ST fallback pre-mount.
- Modify: `apps/web/components/ffxivvenues-schedule-display.tsx` — client component, local-bucketed with ST fallback pre-mount.
- Modify: `apps/web/app/dashboard/[slug]/events/page.tsx` — date-box + time swaps (drafts/past/upcoming sections).
- Modify: `apps/web/app/venues/[slug]/page.tsx` — live-strip end time + upcoming-events time swap.

---

### Task 1: Add `monthShort`/`dayOfMonth` kinds to `lib/server-time.ts`

**Files:**
- Modify: `apps/web/lib/server-time.ts:12-26`
- Test: `apps/web/lib/server-time.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the end of `apps/web/lib/server-time.test.ts` (before the final closing of the file):

```ts
describe("formatServerTime new kinds for date-box tiles", () => {
  it("formats 'monthShort' as a 3-letter month abbreviation", () => {
    expect(formatServerTime("2026-04-28T20:54:00Z", "monthShort")).toBe("Apr")
  })

  it("formats 'dayOfMonth' as a bare day number, no leading zero", () => {
    expect(formatServerTime("2026-04-05T20:54:00Z", "dayOfMonth")).toBe("5")
    expect(formatServerTime("2026-04-28T20:54:00Z", "dayOfMonth")).toBe("28")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run lib/server-time.test.ts`
Expected: FAIL — `formatServerTime("2026-04-28T20:54:00Z", "monthShort")` returns `""` (empty `Intl.DateTimeFormatOptions` fall through), not `"Apr"`.

- [ ] **Step 3: Implement**

In `apps/web/lib/server-time.ts`, add the two new kinds to the `ServerTimeKind` union (after `"monthyear"`, line 25):

```ts
  | "monthyear"     // April 2026
  | "monthShort"    // Apr
  | "dayOfMonth"    // 28
```

Then add matching branches in `getServerTimeIntlOptions` (after the `"monthyear"` branch, around line 58-59):

```ts
  } else if (kind === "monthyear") {
    opts.month = "long"; opts.year = "numeric"
  } else if (kind === "monthShort") {
    opts.month = "short"
  } else if (kind === "dayOfMonth") {
    opts.day = "numeric"
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run lib/server-time.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/server-time.ts apps/web/lib/server-time.test.ts
git commit -m "Add monthShort/dayOfMonth ServerTimeKind for date-box tiles"
```

---

### Task 2: Add local weekly-schedule conversion helpers to `lib/schedule-utils.ts`

**Files:**
- Modify: `apps/web/lib/schedule-utils.ts`
- Create: `apps/web/lib/schedule-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/schedule-utils.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run lib/schedule-utils.test.ts`
Expected: FAIL — `utcWeeklyToLocal`, `localDayOf`, `formatLocalEntryTime` are not exported yet.

- [ ] **Step 3: Implement**

In `apps/web/lib/schedule-utils.ts`, add after the existing `formatHHMM` function (after line 25, before `formatEntryTime`):

```ts
export type LocalDayTime = { day: number; hour: number; minute: number }

/**
 * Converts a weekly-recurring UTC (weekday, hour, minute) slot to its local
 * equivalent, anchored to the nearest real occurrence of that weekday. Local
 * day can differ from the UTC day when the local offset pushes the time
 * across midnight. See the Phase C plan header for the DST-week ceiling.
 */
export function utcWeeklyToLocal(day: number, hour: number, minute: number): LocalDayTime {
  const now = new Date()
  const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0))
  ref.setUTCDate(ref.getUTCDate() + (day - now.getUTCDay()))
  return { day: ref.getDay(), hour: ref.getHours(), minute: ref.getMinutes() }
}
```

Then add after `formatEntryTime` (after line 32):

```ts
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
```

`formatHHMM` is currently unexported (module-private) — change its declaration from `function formatHHMM` to `export function formatHHMM` since `ffxivvenues-schedule-display.tsx` will need an identical formatter in Task 4 and should reuse this one instead of keeping its own duplicate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run lib/schedule-utils.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `cd apps/web && pnpm vitest run`
Expected: all test files pass (this adds one new file to the existing 7).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/schedule-utils.ts apps/web/lib/schedule-utils.test.ts
git commit -m "Add utcWeeklyToLocal/localDayOf/formatLocalEntryTime schedule helpers"
```

---

### Task 3: Convert `VenueScheduleDisplay` to local-bucketed client component

**Files:**
- Modify: `apps/web/components/venue-schedule-display.tsx` (full rewrite, 59 lines)

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `apps/web/components/venue-schedule-display.tsx` with:

```tsx
"use client"

import { useEffect, useState } from "react"
import { DAY_NAMES, DAY_SHORT, formatEntryTime, formatLocalEntryTime, formatIntervalLabel, localDayOf, type ScheduleEntry } from "@/lib/schedule-utils"

type Props = {
  entries: ScheduleEntry[]
  compact?: boolean  // true = short day names, no interval label
}

export function VenueScheduleDisplay({ entries, compact = false }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (entries.length === 0) {
    return (
      <>
        {[0,1,2,3,4,5,6].map(i => (
          <div key={i} className="hours-row closed">
            <span className="day">{compact ? DAY_SHORT[i] : DAY_NAMES[i]}</span>
            <span className="hrs">—</span>
          </div>
        ))}
        <p className="px-5 pb-3 pt-1 text-[0.72rem] text-[var(--fg-faint)]">Hours not set by owner.</p>
      </>
    )
  }

  const byDay = new Map<number, ScheduleEntry[]>()
  for (const e of entries) {
    const day = mounted ? localDayOf(e) : e.day
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(e)
  }

  const todayDay = mounted ? new Date().getDay() : new Date().getUTCDay()

  return (
    <>
      {[0,1,2,3,4,5,6].map(i => {
        const dayEntries = byDay.get(i)
        const isToday = i === todayDay
        if (!dayEntries || dayEntries.length === 0) {
          return (
            <div key={i} className={`hours-row closed${isToday ? " today" : ""}`}>
              <span className="day">{compact ? DAY_SHORT[i] : DAY_NAMES[i]}</span>
              <span className="hrs">—</span>
            </div>
          )
        }
        return dayEntries.map((entry, idx) => (
          <div key={entry.id} className={`hours-row${isToday ? " today" : ""}`}>
            <span className="day">{idx === 0 ? (compact ? DAY_SHORT[i] : DAY_NAMES[i]) : ""}</span>
            <span className="hrs">
              {entry.label && <span className="mr-1 text-[var(--fg-faint)] text-[0.78em]">{entry.label} · </span>}
              {mounted ? formatLocalEntryTime(entry) : formatEntryTime(entry)}
              {!compact && entry.interval !== "WEEKLY" && (
                <span className="ml-1 text-[0.75em] text-[var(--fg-faint)]">({formatIntervalLabel(entry)})</span>
              )}
            </span>
          </div>
        ))
      })}
    </>
  )
}
```

Note this component has no existing "day" prop key collision risk: `key={entry.id}` (stable per-entry) is unchanged, so React won't remount rows on the pre-mount → post-mount bucket swap, it'll just re-render them in their new bucket position.

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: no errors referencing `venue-schedule-display.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/venue-schedule-display.tsx
git commit -m "Convert VenueScheduleDisplay to local-time day-bucketed client component"
```

---

### Task 4: Convert `FfxivvenuesScheduleDisplay` to local-bucketed client component

**Files:**
- Modify: `apps/web/components/ffxivvenues-schedule-display.tsx` (full rewrite, 83 lines)

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `apps/web/components/ffxivvenues-schedule-display.tsx` with:

```tsx
"use client"

import { useEffect, useState } from "react"
import type { FfxivVenueData } from "@/lib/ffxivvenues"
import { LocalTime } from "@/components/server-time"
import { utcWeeklyToLocal, formatHHMM } from "@/lib/schedule-utils"

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

type Props = {
  data: FfxivVenueData
  syncedAt: Date | string
}

export function FfxivvenuesScheduleDisplay({ data, syncedAt }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const schedule = data.schedule ?? []
  const todayDay = mounted ? new Date().getDay() : new Date().getUTCDay()

  const byDay = new Map<number, typeof schedule>()
  for (const entry of schedule) {
    const utcDay = entry.utc?.day ?? entry.day
    const day = mounted ? utcWeeklyToLocal(utcDay, entry.utc.start.hour, entry.utc.start.minute).day : utcDay
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(entry)
  }

  return (
    <div className="dcard">
      <div className="dh">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        Schedule
        <span className="ml-auto text-[0.7rem] text-[var(--fg-faint)] font-normal">via ffxivvenues.com</span>
      </div>

      {schedule.length === 0 ? (
        <p className="px-5 py-3 text-[0.82rem] text-[var(--fg-faint)]">No schedule published on ffxivvenues.com.</p>
      ) : (
        <>
          {[0,1,2,3,4,5,6].map(i => {
            const entries = byDay.get(i)
            const isToday = i === todayDay
            if (!entries || entries.length === 0) {
              return (
                <div key={i} className={`hours-row closed${isToday ? " today" : ""}`}>
                  <span className="day">{DAY_NAMES[i]}</span>
                  <span className="hrs">—</span>
                </div>
              )
            }
            return entries.map((entry, idx) => {
              const utc = entry.utc
              let timeStr: string
              if (mounted) {
                const start = utcWeeklyToLocal(utc.day, utc.start.hour, utc.start.minute)
                const startStr = formatHHMM(start.hour, start.minute)
                if (!utc.end) {
                  timeStr = startStr
                } else {
                  const endDay = utc.end.nextDay ? (utc.day + 1) % 7 : utc.day
                  const end = utcWeeklyToLocal(endDay, utc.end.hour, utc.end.minute)
                  timeStr = `${startStr} – ${formatHHMM(end.hour, end.minute)}`
                }
              } else {
                const startStr = formatHHMM(utc.start.hour, utc.start.minute)
                timeStr = utc.end ? `${startStr} – ${formatHHMM(utc.end.hour, utc.end.minute)} ST` : `${startStr} ST`
              }
              return (
                <div key={idx} className={`hours-row${isToday ? " today" : ""}`}>
                  <span className="day">{idx === 0 ? DAY_NAMES[i] : ""}</span>
                  <span className="hrs">{timeStr}</span>
                </div>
              )
            })
          })}
        </>
      )}

      <div className="px-5 py-2 flex items-center justify-between">
        <a
          href={`https://ffxivvenues.com/venue/${data.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.75rem] text-[var(--xiv-blue)] hover:opacity-80 transition-opacity"
        >
          Schedule via ffxivvenues.com →
        </a>
        <span className="text-[0.7rem] text-[var(--fg-faint)]">Synced <LocalTime date={syncedAt} formatStr="datetime" /></span>
      </div>
    </div>
  )
}
```

This drops the file's own private `formatUtcTime` in favor of the shared `formatHHMM` exported from `lib/schedule-utils.ts` in Task 2 — same implementation, now deduplicated. Also swaps the "Synced ..." line from `<ServerTime>` + trailing " ST" text to `<LocalTime>` with no suffix, consistent with Phase A/B's policy for user-facing timestamps.

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: no errors referencing `ffxivvenues-schedule-display.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ffxivvenues-schedule-display.tsx
git commit -m "Convert FfxivvenuesScheduleDisplay to local-time day-bucketed client component"
```

---

### Task 5: Local-time date-box and time swaps in `app/dashboard/[slug]/events/page.tsx`

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/events/page.tsx`

- [ ] **Step 1: Update imports**

Replace line 11:

```ts
import { formatServerTime, SERVER_TIME_LABEL } from "@/lib/server-time"
```

with:

```ts
import { LocalTime } from "@/components/server-time"
```

(`SERVER_TIME_LABEL` and `formatServerTime` become unused after this task's swaps — confirmed by the remaining steps below removing every call site in this file.)

- [ ] **Step 2: Fix the drafts-view date box and time line**

Replace lines 160-161:

```tsx
                    <div className="text-[0.58rem] font-semibold uppercase tracking-wide text-[var(--fg-faint)]">{formatServerTime(event.startTime, "date").split(" ")[0]}</div>
                    <div className="font-cinzel text-xl font-bold leading-none mt-0.5 text-[var(--fg-faint)]">{new Date(event.startTime).getUTCDate()}</div>
```

with:

```tsx
                    <div className="text-[0.58rem] font-semibold uppercase tracking-wide text-[var(--fg-faint)]"><LocalTime date={event.startTime} formatStr="monthShort" /></div>
                    <div className="font-cinzel text-xl font-bold leading-none mt-0.5 text-[var(--fg-faint)]"><LocalTime date={event.startTime} formatStr="dayOfMonth" /></div>
```

Replace line 171:

```tsx
                    <p className="text-xs text-muted-foreground mt-0.5">{formatServerTime(event.startTime, "datelong")} · {formatServerTime(event.startTime, "time")} {SERVER_TIME_LABEL}</p>
```

with:

```tsx
                    <p className="text-xs text-muted-foreground mt-0.5"><LocalTime date={event.startTime} formatStr="datelong" /> · <LocalTime date={event.startTime} formatStr="time" /></p>
```

- [ ] **Step 3: Fix the past-events date box and time line**

Replace lines 210-211:

```tsx
                              <div className="mo">{formatServerTime(event.startTime, "date").split(" ")[0]}</div>
                              <div className="dy">{new Date(event.startTime).getUTCDate()}</div>
```

with:

```tsx
                              <div className="mo"><LocalTime date={event.startTime} formatStr="monthShort" /></div>
                              <div className="dy"><LocalTime date={event.startTime} formatStr="dayOfMonth" /></div>
```

Replace line 216:

```tsx
                                  <span className="meta">{formatServerTime(event.startTime, "time")} {SERVER_TIME_LABEL}</span>
```

with:

```tsx
                                  <span className="meta"><LocalTime date={event.startTime} formatStr="time" /></span>
```

- [ ] **Step 4: Fix the upcoming-events date box and time line**

Replace lines 246-247:

```tsx
                    <div className="mo">{formatServerTime(event.startTime, "date").split(" ")[0]}</div>
                    <div className="dy">{new Date(event.startTime).getUTCDate()}</div>
```

with:

```tsx
                    <div className="mo"><LocalTime date={event.startTime} formatStr="monthShort" /></div>
                    <div className="dy"><LocalTime date={event.startTime} formatStr="dayOfMonth" /></div>
```

Replace lines 258-261:

```tsx
                        <span className="meta">
                          {format(new Date(event.startTime), "EEE")} · {formatServerTime(event.startTime, "time")}
                          {event.endTime ? ` – ${formatServerTime(event.endTime, "time")} ${SERVER_TIME_LABEL}` : ` ${SERVER_TIME_LABEL}`}
                        </span>
```

with:

```tsx
                        <span className="meta">
                          {format(new Date(event.startTime), "EEE")} · <LocalTime date={event.startTime} formatStr="time" />
                          {event.endTime && <> – <LocalTime date={event.endTime} formatStr="time" /></>}
                        </span>
```

(`format(new Date(event.startTime), "EEE")` is `date-fns`'s `format`, which is already local-time by default — left unchanged. It was previously showing a local weekday next to a Server-Time hour, a pre-existing mismatch this task incidentally fixes since the time next to it is now local too.)

- [ ] **Step 5: Type-check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: no errors — confirms `formatServerTime`/`SERVER_TIME_LABEL` have no remaining call sites in this file (the removed import would otherwise cause unused-import warnings, not hard errors, so also grep to be sure):

Run: `grep -n "formatServerTime\|SERVER_TIME_LABEL" apps/web/app/dashboard/\[slug\]/events/page.tsx`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/events/page.tsx"
git commit -m "Show local time in dashboard events list date boxes and time lines"
```

---

### Task 6: Local-time swaps in `app/venues/[slug]/page.tsx`

**Files:**
- Modify: `apps/web/app/venues/[slug]/page.tsx`

- [ ] **Step 1: Add the `LocalTime` import and drop the now-unused `formatServerTime`**

Replace line 30:

```ts
import { getServerTimeLabel, formatServerTime } from "@/lib/server-time"
```

with:

```ts
import { getServerTimeLabel } from "@/lib/server-time"
import { LocalTime } from "@/components/server-time"
```

(`formatServerTime` has exactly two call sites in this file, both replaced by this task in Steps 2-3 below — confirmed by the grep in Step 4. `getServerTimeLabel` stays: it feeds `tzLabel`, still used by the out-of-scope legacy hours fallback.)

- [ ] **Step 2: Fix the live-strip "open until" time**

Replace line 247:

```tsx
              {" · "}open until {liveEvent.endTime ? `${formatServerTime(liveEvent.endTime.toISOString(), "time")} ${tzLabel}` : "late"}
```

with:

```tsx
              {" · "}open until {liveEvent.endTime ? <LocalTime date={liveEvent.endTime} formatStr="time" /> : "late"}
```

- [ ] **Step 3: Fix the upcoming-events time line**

Replace line 293:

```tsx
                              {format(ev.startTime, "EEE")} · {formatServerTime(ev.startTime.toISOString(), "time")}{ev.endTime ? `–${formatServerTime(ev.endTime.toISOString(), "time")}` : ""} {tzLabel}
```

with:

```tsx
                              {format(ev.startTime, "EEE")} · <LocalTime date={ev.startTime} formatStr="time" />{ev.endTime && <>–<LocalTime date={ev.endTime} formatStr="time" /></>}
```

(The date-box `format(ev.startTime, "MMM")`/`format(ev.startTime, "d")` two lines above are untouched — `date-fns` `format` is already local-time by default, so those were already correct.)

- [ ] **Step 4: Confirm `tzLabel` is still needed**

`tzLabel` (from `getServerTimeLabel(venue.dataCenter)`, line 85) is still used by the legacy free-text hours fallback further down the file (the `defaultHours ST` line, out of scope per this plan's header) — leave the `tzLabel` declaration and its `getServerTimeLabel` import as-is. Confirm with:

Run: `grep -n "tzLabel" "apps/web/app/venues/[slug]/page.tsx"`
Expected: two remaining matches, both inside the legacy-hours-fallback branch (not the two lines this task removed).

- [ ] **Step 5: Type-check and confirm no dangling references**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: no errors.

Run: `grep -n "formatServerTime" "apps/web/app/venues/[slug]/page.tsx"`
Expected: no output (confirms the import removal in Step 1 didn't leave an unused-but-still-imported symbol).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/venues/[slug]/page.tsx"
git commit -m "Show local time in public venue page live-strip and upcoming events"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: clean (the two pre-existing unrelated errors in `attendance-overview.tsx`/`event-attendance-chart.tsx` from Phase B, TS7031 implicit-any on recharts Tooltip props, are not part of this diff — confirm they're still the *only* remaining output).

- [ ] **Step 2: Full test suite**

Run: `cd apps/web && pnpm vitest run`
Expected: all test files pass, including the new `schedule-utils.test.ts` and the extended `server-time.test.ts`.

- [ ] **Step 3: Live verification against the local dev stack**

Using the local Postgres-backed dev server (`docs/LOCAL_DEV.md`), seed a `ScheduleEntry` whose UTC start time is within ~1 hour of local midnight for the current system timezone (so the day-shift path is actually exercised, not just the identity path), and check:
- `/dashboard/<slug>` "Hours" card (`VenueScheduleDisplay`) — the entry appears under the correct *local* weekday row, with the correct local time and no " ST" suffix, and the "today" highlight lands on the correct local weekday.
- `/venues/<slug>` public page — same check for both `VenueScheduleDisplay` (Hours card) and, if the test venue has `ffxivvenuesId` data with a synced schedule, `FfxivvenuesScheduleDisplay`.
- `/dashboard/<slug>/events` — Upcoming, Past, and Drafts tabs all show local date-box month/day and local times; weekday text next to the time now matches the time shown.
- `/venues/<slug>` — the "Upcoming events" card and, if a `liveEvent` exists, the "Happening now" live strip's "open until" time — both local, no " ST" suffix.
- Confirm no hydration-mismatch warnings in the browser console on a genuinely fresh reload of each page (matches the verification approach used in Phase B).

- [ ] **Step 4: Clean up any seeded test data used for Step 3**

If you inserted a temporary `ScheduleEntry` (or reused the `local-test-venue` DST-adjacent test row), delete it after verification — don't leave synthetic rows in the local dev DB.
