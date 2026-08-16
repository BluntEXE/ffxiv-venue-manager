# Local Time Conversion — Phase B (primitive additions + transactions/chart/dashboard-header) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the 3 remaining medium-complexity Server-Time surfaces to viewer-local time: `transactions-list.tsx` (including its CSV export), `event-attendance-chart.tsx` (a deliberate shared-chart design choice the user explicitly overrode — convert anyway), and `app/dashboard/[slug]/page.tsx`'s header date line + two `ServerTimeRange` usages. Requires two new primitives first: a real local-timezone ISO formatter (the existing `formatLocalTime` silently falls back to UTC for ISO kinds — a bug for this use case, not something to work around) and a `LocalTimeRange` component to replace `ServerTimeRange`.

**Architecture:** Extends the same `components/server-time.tsx`/`lib/server-time.ts` primitives Phase A used. One new small client component (`components/today-date-label.tsx`) handles the one spot that computes "now" itself rather than formatting an existing timestamp — Server Components can't use `useState`/`useEffect`, so this can't be inlined into `app/dashboard/[slug]/page.tsx` directly.

**Explicitly out of scope for this phase**: the `isToday` boolean at `app/dashboard/[slug]/page.tsx:105` (used only to highlight a bar in the revenue chart, computed server-side against `now` — a cosmetic highlight, not displayed text; converting it requires passing viewer-local "today" into a chart component and is lower-value than the rest of this phase). Files 5, 7, 12 (day-grouping rewrites) remain Phase C.

**Tech Stack:** Next.js App Router (Server + Client Components), React, TypeScript, `date-fns`, Recharts.

---

## Ground truth (verified against actual source before writing this plan)

- `lib/server-time.ts`'s `formatServerTime` special-cases `isoDate`/`isoDateTime` to bypass `Intl`/`opts` entirely (`d.toISOString().slice(0,10)` / `.replace("T"," ").slice(0,19)`), and `components/server-time.tsx`'s `formatLocalTime` currently delegates straight back to `formatServerTime` for those two kinds — meaning today, calling `formatLocalTime(x, "isoDateTime")` silently returns a **UTC** string, not a local one. This is the bug Task 1 fixes.
- `components/transactions-list.tsx` has exactly 4 `formatServerTime`/`SERVER_TIME_LABEL` occurrences (verified via grep, not the higher count an earlier pass estimated): the import, the CSV row date (`isoDateTime`), the CSV filename date (`isoDate`), and the transaction row display (`datetimelong` + label). There is no event-filter-dropdown `formatServerTime` call in this file.
- `components/event-attendance-chart.tsx` is 100% client-rendered (fetches via `useEffect`, no server-provided initial data) — no SSR/hydration-mismatch risk for this file at all, simpler than the other Phase B/C files.
- `app/dashboard/[slug]/page.tsx` is a Server Component. `getServerTimeLabel`/`tzLabel` is used in exactly one place (line 198) outside its own declaration (line 51) — becomes fully dead code once that line converts.

---

## Task 1: Add local-timezone ISO formatting + `LocalTimeRange` primitives

**Files:**
- Modify: `apps/web/lib/server-time.ts`
- Modify: `apps/web/components/server-time.tsx`

**Context:** Two additions needed before any call site can use them. Both mirror an existing UTC/ST counterpart exactly, just without the `timeZone: ST_TZ` override (so they use whatever timezone the JS engine is actually running in — the browser's local zone, once these are only ever called client-side after mount, same guarantee `LocalTime`/`formatLocalTime` already rely on for every other kind).

- [ ] **Step 1: Fix `formatLocalTime`'s ISO kinds in `components/server-time.tsx`**

Current code:
```ts
export function formatLocalTime(date: string | Date, kind: ServerTimeKind = "time"): string {
  const d = new Date(date)
  if (kind === "isoDate" || kind === "isoDateTime") return formatServerTime(date, kind)
  const { opts, locale } = getServerTimeIntlOptions(kind)
  return d.toLocaleString(locale, opts)
}
```

Change to:
```ts
export function formatLocalTime(date: string | Date, kind: ServerTimeKind = "time"): string {
  const d = new Date(date)
  if (kind === "isoDate" || kind === "isoDateTime") {
    const pad = (n: number) => String(n).padStart(2, "0")
    const isoDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    if (kind === "isoDate") return isoDate
    return `${isoDate} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const { opts, locale } = getServerTimeIntlOptions(kind)
  return d.toLocaleString(locale, opts)
}
```

`Date`'s non-`UTC`-prefixed getters (`getFullYear`, `getMonth`, `getDate`, `getHours`, `getMinutes`, `getSeconds`) already reflect the *local* system timezone wherever this code runs — no explicit timezone argument needed, same as every other branch in this function already relies on implicitly via `toLocaleString` with no `timeZone` option.

- [ ] **Step 2: Add `formatLocalTimeRange` to `lib/server-time.ts`**

Add this function directly below the existing `formatServerTimeRange` (same file, so it stays a pure server-safe function callable from Server Components if ever needed, matching the existing pattern):

```ts
export function formatLocalTimeRange(start: string | Date, end: string | Date): string {
  const s = new Date(start)
  const e = new Date(end)
  const dateStr = s.toLocaleString("en-US", { month: "short", day: "numeric" })
  const startTime = s.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
  const endTime = e.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
  return `${dateStr} · ${startTime} — ${endTime}`
}
```

Identical to `formatServerTimeRange` except no `timeZone: ST_TZ` on any of the three `toLocaleString` calls, and no trailing `${SERVER_TIME_LABEL}` (a local time doesn't need a "ST" suffix, matching every other converted call site in this project).

- [ ] **Step 3: Add `LocalTimeRange` component to `components/server-time.tsx`**

Add this directly below the existing `LocalTime` component:

```tsx
export function LocalTimeRange({
  start,
  end,
  className,
}: {
  start: string | Date
  end: string | Date
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const formatted = useMemo(
    () => (mounted ? formatLocalTimeRange(start, end) : formatServerTimeRange(start, end)),
    [mounted, start, end]
  )
  return <span className={className}>{formatted}</span>
}
```

Also update the file's existing import line to pull in `formatLocalTimeRange` alongside `formatServerTimeRange` — find:
```ts
import {
  formatServerTime,
  formatServerTimeRange,
  getServerTimeIntlOptions,
  SERVER_TIME_LABEL,
  type ServerTimeKind,
} from "@/lib/server-time"
```
and add `formatLocalTimeRange` to that list.

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Add a unit test for the ISO fix, since it's the one behavior change in this task that isn't a pure UI swap**

Find the existing test file for `lib/server-time.ts` (check with `find apps/web -iname "*server-time*.test.*"` — if one exists, add to it; if not, create `apps/web/lib/server-time.test.ts` following this repo's existing vitest conventions, e.g. `import { describe, it, expect } from "vitest"`).

```ts
import { describe, it, expect } from "vitest"
import { formatServerTime } from "./server-time"

describe("formatServerTime ISO kinds stay UTC", () => {
  it("isoDateTime always reflects UTC regardless of system timezone", () => {
    const d = new Date("2026-08-15T23:30:00.000Z")
    expect(formatServerTime(d, "isoDateTime")).toBe("2026-08-15 23:30:00")
  })
})
```

This test locks down that `formatServerTime`'s ISO output is unaffected by this change (it should be — only `formatLocalTime` changed) — a regression guard, not a test of the new local behavior (testing the local behavior deterministically would require mocking the system timezone, out of scope for a one-line primitive fix; the manual live-check in Task 5 covers the actual local-output verification).

- [ ] **Step 6: Run the test**

```bash
npx vitest run
```
Expected: previous 54 tests + 1 new test, all passing.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/server-time.ts apps/web/components/server-time.tsx apps/web/lib/server-time.test.ts
git commit -m "feat: add local-timezone ISO formatting and LocalTimeRange primitive (local-time phase B)

formatLocalTime previously fell back to formatServerTime (UTC) for the
isoDate/isoDateTime kinds - a real bug for anything wanting a genuinely
local-timezone ISO-ish string (the transactions-list CSV export, Task 2 of
this phase). Fixed using Date's local (non-UTC-prefixed) getters, same
approach every other formatLocalTime branch already relies on implicitly.

LocalTimeRange mirrors ServerTimeRange's mount-guard pattern, needed by
Task 4's dashboard page conversion."
```

(If Step 5's test file path differs because an existing `server-time.test.ts` was found and extended instead of created, adjust the `git add` path accordingly — but the file added to `git add` must be the one actually touched.)

---

## Task 2: `components/transactions-list.tsx`

**Files:**
- Modify: `apps/web/components/transactions-list.tsx`

**Context:** Client Component. 3 call sites: CSV export row date, CSV export filename date, transaction row display. All 3 convert to local — the CSV export decision was confirmed explicitly (convert, don't leave deterministic/UTC).

- [ ] **Step 1: Swap the import**

Change:
```tsx
import { formatServerTime, SERVER_TIME_LABEL } from "@/components/server-time"
```
to:
```tsx
import { formatLocalTime } from "@/components/server-time"
```

- [ ] **Step 2: Swap the 3 call sites**

Change:
```tsx
const date = formatServerTime(transaction.createdAt, "isoDateTime")
```
to:
```tsx
const date = formatLocalTime(transaction.createdAt, "isoDateTime")
```

Change:
```tsx
link.setAttribute("download", `transactions-${formatServerTime(new Date(), "isoDate")}.csv`)
```
to:
```tsx
link.setAttribute("download", `transactions-${formatLocalTime(new Date(), "isoDate")}.csv`)
```

Change:
```tsx
<span>{formatServerTime(transaction.createdAt, "datetimelong")} {SERVER_TIME_LABEL}</span>
```
to:
```tsx
<span>{formatLocalTime(transaction.createdAt, "datetimelong")}</span>
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/transactions-list.tsx
git commit -m "chore: show transaction times and CSV export in viewer-local time (local-time phase B)"
```

---

## Task 3: `components/event-attendance-chart.tsx`

**Files:**
- Modify: `apps/web/components/event-attendance-chart.tsx`

**Context:** Client Component, 100% client-rendered (no SSR data), so no hydration-guard needed here at all — this file never renders server-provided timestamps before mount. The existing code comment documents a deliberate "shared chart, same axis for every viewer" design choice; the user explicitly confirmed converting anyway.

- [ ] **Step 1: Swap the import and helper function**

Change:
```tsx
import { formatServerTime, SERVER_TIME_LABEL } from "@/components/server-time"

// Format an ISO timestamp as Server Time (UTC). All viewers see the
// same axis label regardless of browser timezone.
const fmtST = (iso: string) => formatServerTime(iso, "time")
```
to:
```tsx
import { formatLocalTime } from "@/components/server-time"

// Format an ISO timestamp in the viewer's own local time.
const fmtLocal = (iso: string) => formatLocalTime(iso, "time")
```

- [ ] **Step 2: Update the `CardDescription` text**

Change:
```tsx
<CardDescription>Live count tracking over time (Server Time)</CardDescription>
```
to:
```tsx
<CardDescription>Live count tracking over time</CardDescription>
```

- [ ] **Step 3: Swap the 3 remaining `fmtST` references**

Change the `XAxis` tick formatter:
```tsx
<XAxis
    dataKey="time"
    tickFormatter={fmtST}
```
to:
```tsx
<XAxis
    dataKey="time"
    tickFormatter={fmtLocal}
```

Change the tooltip:
```tsx
{typeof label === "string" ? fmtST(label) : label} {SERVER_TIME_LABEL}
```
to:
```tsx
{typeof label === "string" ? fmtLocal(label) : label}
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/event-attendance-chart.tsx
git commit -m "chore: show attendance chart axis/tooltip in viewer-local time (local-time phase B)

Deliberate override of this file's original 'shared chart, same clock for
every viewer' design comment - confirmed with the user, converting for
consistency with the rest of the app rather than keeping this one
exception."
```

---

## Task 4: `app/dashboard/[slug]/page.tsx`

**Files:**
- Create: `apps/web/components/today-date-label.tsx`
- Modify: `apps/web/app/dashboard/[slug]/page.tsx`

**Context:** Server Component. Three things change: the header "day • ST" line (needs a new tiny client component, since it computes "now" itself rather than formatting an existing timestamp prop, and Server Components can't use `useState`/`useEffect`), and the two `ServerTimeRange` JSX call sites (simple tag swap to the `LocalTimeRange` built in Task 1, same reasoning as Phase A's Server-Component-importing-a-Client-Component pattern).

- [ ] **Step 1: Create the new client component**

```tsx
"use client"

import { useEffect, useState } from "react"
import { formatLocalTime, formatServerTime } from "@/components/server-time"

/**
 * "Tuesday, 15 Aug" header label in the viewer's local time. Can't be a
 * prop-driven <LocalTime date=... /> since there's no fixed timestamp to
 * format - this needs to read "now" itself, which requires being a client
 * component (Server Components can't useState/useEffect).
 */
export function TodayDateLabel() {
  const [now] = useState(() => new Date())
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return <>{mounted ? formatLocalTime(now, "dayheader") : formatServerTime(now, "dayheader")}</>
}
```

`dayheader` (`"Tuesday 28 Apr"`, `en-GB` locale, no comma) is the closest existing `ServerTimeKind` to the original `date-fns` `"EEEE, d MMM"` format (`"Tuesday, 15 Aug"`) — a trivial punctuation-only difference (no comma), not worth adding a brand-new kind to the shared enum for. `now` is captured once via `useState(() => ...)` so it stays stable across this component's own re-renders rather than silently ticking forward.

- [ ] **Step 2: Wire it into the dashboard page**

Add the import near the top of `app/dashboard/[slug]/page.tsx`, alongside the other component imports:
```tsx
import { TodayDateLabel } from "@/components/today-date-label"
```

Change:
```tsx
<p className="text-sm text-muted-foreground mt-0.5">
  {format(now, "EEEE, d MMM")} &middot; {tzLabel}
</p>
```
to:
```tsx
<p className="text-sm text-muted-foreground mt-0.5">
  <TodayDateLabel />
</p>
```

- [ ] **Step 3: Swap the `ServerTimeRange` import and the 2 call sites**

Change:
```tsx
import { ServerTimeRange } from "@/components/server-time"
```
to:
```tsx
import { LocalTimeRange } from "@/components/server-time"
```

Change:
```tsx
<ServerTimeRange start={nextEvent.startTime} end={nextEvent.endTime ?? nextEvent.startTime} />
```
to:
```tsx
<LocalTimeRange start={nextEvent.startTime} end={nextEvent.endTime ?? nextEvent.startTime} />
```

Change:
```tsx
<ServerTimeRange start={shift.scheduledStart} end={shift.scheduledEnd} />
```
to:
```tsx
<LocalTimeRange start={shift.scheduledStart} end={shift.scheduledEnd} />
```

- [ ] **Step 4: Remove the now-dead `tzLabel`/`getServerTimeLabel`**

After Step 2, `tzLabel` has zero remaining usages in this file (confirm with `grep -n "tzLabel" "apps/web/app/dashboard/[slug]/page.tsx"` — expected only its own declaration line before this step, zero after). Remove:
```ts
const tzLabel = getServerTimeLabel(venue.dataCenter)
```
and remove `getServerTimeLabel` from wherever it's imported (`import { getServerTimeLabel } from "@/lib/server-time"` — check if `SERVER_TIME_LABEL` or anything else from that same import line is still needed elsewhere in the file before deleting the whole line versus just trimming one name from it).

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/today-date-label.tsx "apps/web/app/dashboard/[slug]/page.tsx"
git commit -m "chore: show dashboard header date and event/shift ranges in viewer-local time (local-time phase B)"
```

---

## Task 5: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck and test suite**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```
Expected: 0 errors, 55 tests passing (54 from before this phase + Task 1's new ISO regression test).

- [ ] **Step 2: Live check against the local dev server**

With the local dev server running (`docs/LOCAL_DEV.md`):

- `/dashboard/<venue>/sales` — transaction row timestamps show local time, no "ST" text. Click "Export to CSV", open the downloaded file, confirm the `Date` column and the filename's date stamp are both in local time, not UTC (compare against the transaction's on-screen local timestamp — they should match, whereas before this phase the CSV date would have been several hours off from the on-screen ST-labelled time whenever the viewer isn't in UTC).
- An event detail page with attendance data (log a few patron visits against a test event first if none exist) — the "Patron Attendance" chart's X-axis and tooltip show local time, card description no longer says "(Server Time)".
- `/dashboard/<venue>` (main overview) — header shows "{Weekday}, {day} {month}" with no "ST"/timezone suffix; if there's a next upcoming event or an active shift, confirm the time range shown is local, not ST. Specifically watch for a hydration-mismatch console warning on this page, since `TodayDateLabel` is the first *fully self-computed* client-side "now" component added across both phases (everything else formatted an already-known timestamp) — confirm the mount-guard actually prevents a server/client text mismatch rather than assuming it does.

- [ ] **Step 3: Report completion**

Phase C (the 3 day-grouping structural rewrites) remains a separate follow-up plan.

---

## Self-review

**Spec coverage:** All 3 files from Phase B's scope (`transactions-list.tsx`, `event-attendance-chart.tsx`, `app/dashboard/[slug]/page.tsx`) have a task. Both new primitives (`LocalTimeRange`, the `formatLocalTime` ISO fix) are built before anything depends on them (Task 1 before Tasks 2 and 4). The `isToday` chart-highlight exclusion is explicitly named, not silently dropped. ✅

**Placeholder scan:** No "add appropriate handling" phrasing; every code block is the actual diff. The one deliberately-approximate spot (`dayheader` kind vs the exact original `date-fns` format string) is explained, not hidden. ✅

**Type consistency:** `formatLocalTime`, `formatLocalTimeRange`, `LocalTimeRange`, `TodayDateLabel` — each name introduced once (Task 1 or Task 4) and referenced consistently afterward, matching Phase A's established `LocalTime`/`formatLocalTime` naming. ✅
