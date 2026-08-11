# Server-Time Consolidation (Cleanup Roadmap Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-rolled `toLocaleDateString`/`toLocaleString`/`Intl.DateTimeFormat` calls with `lib/server-time.ts` everywhere a date is displayed, so every date in the app renders in FFXIV Server Time (UTC) instead of whatever timezone happens to execute the code.

**Architecture:** `lib/server-time.ts` already exports `formatServerTime(date, kind)` with a `ServerTimeKind` union covering common shapes. This plan adds 6 new kinds to cover shapes found in the audit that don't already exist, then migrates 12 call sites onto the helper. Two call sites found by the original grep sweep are excluded with rationale (see Task 0).

**Tech Stack:** TypeScript, Next.js App Router, Vitest.

**Important — this is not purely cosmetic.** 8 of the 12 target call sites format a date with **no `timeZone` option specified at all**, meaning they currently render in the browser's local timezone (client components) or the server process's local timezone (cron/API routes) — not FFXIV Server Time. That's a real display bug, not just duplication. Expect visible output changes in QA, not just refactor-only diffs.

**Important — locale-order change.** Several target sites use `"en-GB"` (day-before-month order, e.g. "28 Apr 2026"). `formatServerTime` hardcodes `"en-US"` (e.g. "Apr 28, 2026"). Migrating standardizes the whole app on one order. This is intentional (consistency), not a bug, but is a visible change — call out explicitly in QA, don't let it get lost among the timezone fixes.

---

## Amendment (post-Task-1): backend stays UTC, viewer-facing UI renders in the visitor's own local timezone

Decided after Task 1 landed, via direct stakeholder conversation (Ehno + Raine Whatur, venue owner). Confirmed direction, verbatim intent: *"I set the venue schedule for 8pm est. Someone in PST will log into the dashboard and see the venue open time as 5pm PST. The backend server time will be in UTC, no matter what."*

This **does not replace** Task 1's UTC-based `ServerTimeKind`/`formatServerTime` — it adds a second, viewer-local counterpart and splits later tasks by which one applies:

- **Broadcast/generated text with no single viewer** (cron-generated Discord messages, webhook embeds, pre-composed notification-body strings) — stays on `formatServerTime` (UTC, "ST"-labeled), unchanged from the original plan. There's no "the visitor's timezone" for a message posted once to a shared Discord channel.
- **Interactive dashboard/UI pages a specific visitor is looking at** (API keys, staff table, navbar notifications dropdown, analytics, invite page) — switches to a new `formatLocalTime`/`<LocalTime>` that renders in the visitor's own browser timezone.

**Two implementation constraints, both already resolved, not open questions:**

1. **VPN doesn't break this.** `Intl.DateTimeFormat().resolvedOptions().timeZone` reads the OS's configured timezone setting, not IP-derived geolocation. A VPN changes apparent network location, not the system clock's timezone — so plain browser `Intl` already gives "physically move → refresh → time updates" behavior without extra work.
2. **SSR hydration mismatch.** The app server-renders first (Node process — its own local timezone, not the visitor's), then hydrates client-side (visitor's real timezone). If a component renders visitor-local time during the very first render, React's hydration diff can throw or flash the wrong value. Task 1B below builds a mount-guarded client component that renders the *same* UTC-based string during SSR and initial client render, then swaps to local time in a subsequent render once mounted — no mismatch, because the swap happens after hydration completes, not during it.

New Task 1B (below) builds this primitive. Tasks 4, 5, 6 are revised to use it where the display is viewer-facing; the broadcast-text portions of Tasks 2, 3, and 6 are unchanged.

---

## Task 0: Confirm exclusions (no code change)

Two files matched the original grep sweep but are **not** date-formatting bugs — do not touch them in this plan:

- `components/ui/calendar.tsx:196` — `day.date.toLocaleDateString()` populates a `data-day` DOM attribute (a CSS/test selector key), not a user-facing display string. Locale/timezone doesn't matter here.
- `app/dashboard/[slug]/events/new/page.tsx:168` — `Intl.DateTimeFormat().resolvedOptions().timeZone` reads the *browser's own* IANA timezone name (for a form default), it doesn't format a date at all.

- [ ] **Step 1: No action needed** — just confirmed above so a future reader doesn't re-flag these as missed work.

---

## Task 1: Add new `ServerTimeKind` variants to `lib/server-time.ts`

**Files:**
- Modify: `apps/web/lib/server-time.ts:38-46` (the `ServerTimeKind` union) and `apps/web/lib/server-time.ts:47-71` (`formatServerTime`)
- Test: `apps/web/lib/server-time.test.ts` (new file)

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/lib/server-time.test.ts
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
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run lib/server-time.test.ts`
Expected: FAIL — `formatServerTime` returns wrong/undefined output for the new kinds (they don't exist in the `ServerTimeKind` union or the `if` chain yet), TypeScript will also flag the kind strings as invalid.

- [ ] **Step 3: Extend the type and implementation**

In `apps/web/lib/server-time.ts`, replace the `ServerTimeKind` union (lines 38-46):

```typescript
export type ServerTimeKind =
  | "time"          // 8:54 PM
  | "datetime"      // Apr 28, 8:54 PM
  | "date"          // Apr 28
  | "datelong"      // April 28, 2026
  | "datetimelong"  // Apr 28, 2026, 8:54 PM
  | "isoDate"       // 2026-04-28
  | "isoDateTime"   // 2026-04-28 20:54:10
  | "weekdatelong"  // Tuesday, April 28, 2026
  | "weekdate"      // Tuesday, April 28
  | "shiftdate"     // Tue, 28 Apr
  | "dayheader"     // Tuesday, 28 Apr
  | "datewithyear"  // Apr 28, 2026
  | "monthyear"     // April 2026
```

Then replace the `if`/`else if` chain inside `formatServerTime` (lines 56-69) with:

```typescript
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
  } else if (kind === "weekdatelong") {
    opts.weekday = "long"; opts.year = "numeric"; opts.month = "long"; opts.day = "numeric"
  } else if (kind === "weekdate") {
    opts.weekday = "long"; opts.month = "long"; opts.day = "numeric"
  } else if (kind === "shiftdate") {
    opts.weekday = "short"; opts.day = "numeric"; opts.month = "short"
  } else if (kind === "dayheader") {
    opts.weekday = "long"; opts.day = "numeric"; opts.month = "short"
  } else if (kind === "datewithyear") {
    opts.month = "short"; opts.day = "numeric"; opts.year = "numeric"
  } else if (kind === "monthyear") {
    opts.month = "long"; opts.year = "numeric"
  }
  return d.toLocaleString("en-US", opts)
```

Note: `"weekdatelong"` and `"weekdate"` and `"shiftdate"`/`"dayheader"` overlap in shape but differ in weekday length or month length to exactly match existing call sites (see Task 2-6) — don't collapse them further, each maps 1:1 to a real call site's current output shape so the migration is format-preserving except for locale/timezone.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run lib/server-time.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd apps/web && git add lib/server-time.ts lib/server-time.test.ts
git commit -m "feat(server-time): add weekday/date-with-year/month-year format kinds"
```

---

## Task 1B: Add viewer-local time formatting (`formatLocalTime`, `<LocalTime>`)

**Files:**
- Modify: `apps/web/lib/server-time.ts` — extract the kind→options mapping so both UTC and local formatting share it
- Modify: `apps/web/components/server-time.tsx` — add `formatLocalTime` and `<LocalTime>` (mount-guarded)
- Test: `apps/web/lib/server-time.test.ts` (extend existing file)

- [ ] **Step 1: Write the failing test for the extracted options function**

Add to `apps/web/lib/server-time.test.ts`:

```typescript
import { getServerTimeIntlOptions } from "./server-time"

describe("getServerTimeIntlOptions", () => {
  it("returns options for 'datetime' with no timeZone set", () => {
    const opts = getServerTimeIntlOptions("datetime")
    expect(opts.timeZone).toBeUndefined()
    expect(opts.month).toBe("short")
    expect(opts.day).toBe("numeric")
    expect(opts.hour).toBe("numeric")
    expect(opts.minute).toBe("2-digit")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && npx vitest run lib/server-time.test.ts`
Expected: FAIL — `getServerTimeIntlOptions` doesn't exist yet.

- [ ] **Step 3: Refactor `lib/server-time.ts` to extract the options builder**

Replace the body of `formatServerTime` (the `if`/`else if` chain plus the two special-cased `shiftdate`/`dayheader` branches the Task 1 implementer added — read the current file first, since the actual Task 1 implementation deviated from the plan's original snippet for those two kinds) with a new exported function `getServerTimeIntlOptions(kind: ServerTimeKind): Intl.DateTimeFormatOptions` that returns the options **without setting `timeZone`**, and have `formatServerTime` call it and add `timeZone: ST_TZ` on top:

```typescript
export function getServerTimeIntlOptions(kind: ServerTimeKind): Intl.DateTimeFormatOptions {
  const opts: Intl.DateTimeFormatOptions = {}
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
  } else if (kind === "weekdatelong") {
    opts.weekday = "long"; opts.year = "numeric"; opts.month = "long"; opts.day = "numeric"
  } else if (kind === "weekdate") {
    opts.weekday = "long"; opts.month = "long"; opts.day = "numeric"
  } else if (kind === "datewithyear") {
    opts.month = "short"; opts.day = "numeric"; opts.year = "numeric"
  } else if (kind === "monthyear") {
    opts.month = "long"; opts.year = "numeric"
  }
  return opts
}

export function formatServerTime(date: string | Date, kind: ServerTimeKind = "time"): string {
  const d = new Date(date)
  if (kind === "isoDate") return d.toISOString().slice(0, 10)
  if (kind === "isoDateTime") return d.toISOString().replace("T", " ").slice(0, 19)
  if (kind === "shiftdate" || kind === "dayheader") {
    // en-US locale doesn't respect option key order for day-before-month shapes;
    // keep whatever manual-templating approach Task 1 landed for these two kinds,
    // just route it through this function unchanged rather than duplicating it.
  }
  return d.toLocaleString("en-US", { ...getServerTimeIntlOptions(kind), timeZone: ST_TZ })
}
```

**Important:** the `shiftdate`/`dayheader` handling above is a placeholder — before writing this step for real, read what Task 1's implementer actually committed for those two kinds (they deviated from the plan's original single-locale-call approach because en-US ignores option-key order for day-before-month shapes). Preserve that working logic exactly, just make sure `formatServerTime` still produces identical output to before this refactor for every existing kind — that's the regression check in Step 4.

- [ ] **Step 4: Run all existing + new tests, confirm no regressions**

Run: `cd apps/web && npx vitest run lib/server-time.test.ts`
Expected: all 7 tests pass (6 from Task 1 + 1 new), including the 6 Task 1 kind-output tests unchanged — this proves the refactor didn't alter `formatServerTime`'s output.

- [ ] **Step 5: Add `formatLocalTime` and `<LocalTime>` to `components/server-time.tsx`**

```typescript
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  formatServerTime,
  getServerTimeIntlOptions,
  SERVER_TIME_LABEL,
  type ServerTimeKind,
} from "@/lib/server-time"

export { formatServerTime, SERVER_TIME_LABEL }
export type { ServerTimeKind }

export function formatLocalTime(date: string | Date, kind: ServerTimeKind = "time"): string {
  const d = new Date(date)
  if (kind === "isoDate" || kind === "isoDateTime") return formatServerTime(date, kind)
  return d.toLocaleString("en-US", getServerTimeIntlOptions(kind))
}

export function ServerTime({
  date,
  formatStr = "time",
  className,
}: {
  date: string | Date
  formatStr?: ServerTimeKind
  className?: string
}) {
  const formatted = useMemo(() => formatServerTime(date, formatStr), [date, formatStr])
  return <span className={className}>{formatted}</span>
}

export function LocalTime({
  date,
  formatStr = "time",
  className,
}: {
  date: string | Date
  formatStr?: ServerTimeKind
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const formatted = useMemo(
    () => (mounted ? formatLocalTime(date, formatStr) : formatServerTime(date, formatStr)),
    [mounted, date, formatStr]
  )
  return <span className={className}>{formatted}</span>
}
```

Note: `<LocalTime>` renders the UTC (`formatServerTime`) value on the very first render (matches SSR output exactly, so no hydration mismatch), then swaps to `formatLocalTime` once `mounted` flips true after the `useEffect` fires — this is a render *after* hydration, not part of the hydration diff, so it's safe. Visitors will see a one-frame flash from UTC to their local time on first load; that's expected and acceptable (standard tradeoff for this pattern), not a bug to fix.

Keep the existing `ServerTimeRange` function in this file unchanged — it's not used by any call site in this plan's remaining tasks.

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
cd apps/web && git add lib/server-time.ts lib/server-time.test.ts components/server-time.tsx
git commit -m "feat(server-time): add viewer-local time formatting with hydration-safe LocalTime component"
```

---

## Task 2: Migrate cron routes (`daily-sales-summary`, `events-digest-post`)

**Files:**
- Modify: `apps/web/app/api/cron/daily-sales-summary/route.ts:122-127`
- Modify: `apps/web/app/api/cron/events-digest-post/route.ts:41-46`

- [ ] **Step 1: Replace in `daily-sales-summary/route.ts`**

Before (lines 121-127):
```typescript
      // Format date string
      const dateString = yesterday.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
```

After:
```typescript
      const dateString = formatServerTime(yesterday, "weekdatelong")
```

Add the import at the top of the file: `import { formatServerTime } from "@/lib/server-time"`

- [ ] **Step 2: Replace in `events-digest-post/route.ts`**

Before (lines 41-46):
```typescript
    const dayLabel = dayStart.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    })
```

After:
```typescript
    const dayLabel = formatServerTime(dayStart, "weekdate")
```

Add the import at the top of the file: `import { formatServerTime } from "@/lib/server-time"`

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors from either file.

- [ ] **Step 4: Manual verify**

These routes build Discord/summary message text and aren't directly page-renderable. Trigger each locally (check each route's existing dev-invocation approach, e.g. `curl localhost:3000/api/cron/daily-sales-summary` with whatever auth header the route expects — check the route file for a `CRON_SECRET`/auth check first) and confirm the output message reads correctly, e.g. `dateString` produces "Tuesday, April 28, 2026" and `dayLabel` produces "Tuesday, April 28".

- [ ] **Step 5: Commit**

```bash
cd apps/web && git add app/api/cron/daily-sales-summary/route.ts app/api/cron/events-digest-post/route.ts
git commit -m "refactor: use formatServerTime in cron message text"
```

---

## Task 3: Migrate shift-date formatting (true duplicate — 4 call sites)

**Files:**
- Modify: `apps/web/app/api/plugin/shifts/claim/route.ts:96`
- Modify: `apps/web/app/api/venues/[venueId]/shifts/[shiftId]/route.ts:91,142,199`

These 4 call sites are byte-identical today:
```typescript
shift.scheduledStart.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
```

- [ ] **Step 1: Replace all 4 occurrences**

In each of the 2 files, replace every instance of the line above with:
```typescript
formatServerTime(shift.scheduledStart, "shiftdate")
```

Add `import { formatServerTime } from "@/lib/server-time"` to both files if not already present.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 3: Manual verify**

This is the shift-scheduling feature area — per the cleanup roadmap's ground rules, treat as medium risk even though this specific change is format-only. Claim a test shift via the plugin (or hit `POST /api/plugin/shifts/claim` directly) and confirm the returned date string reads e.g. "Tue, 28 Apr" in the response/notification. Check both the claim-confirmation path and the shift-detail `GET`/`PATCH` paths in the `[shiftId]/route.ts` file (3 call sites there — likely claim confirmation, reminder, and cancellation messages; confirm all 3 by reading the surrounding code before testing).

- [ ] **Step 4: Commit**

```bash
cd apps/web && git add app/api/plugin/shifts/claim/route.ts "app/api/venues/[venueId]/shifts/[shiftId]/route.ts"
git commit -m "refactor: dedupe shift-date formatting via formatServerTime"
```

---

## Task 4: Migrate API-key pages (2 files, bare `toLocaleDateString()`) — viewer-local

**Files:**
- Modify: `apps/web/app/dashboard/api-keys/page.tsx:478,482`
- Modify: `apps/web/app/dashboard/[slug]/settings/api-keys/page.tsx:451,453`

**These are visitor-facing dashboard pages — use `<LocalTime>` from `components/server-time.tsx` (Task 1B), not `formatServerTime`.** Both files must already be (or must become) client components (`"use client"` at the top) since `<LocalTime>` uses `useState`/`useEffect`. Check each file's top before editing; if either is currently a Server Component, this task includes converting it to a Client Component (add `"use client"`, verify no server-only APIs are used elsewhere in the file — e.g. no direct `prisma` calls in the component body; if there are, escalate as BLOCKED, that's a bigger restructure than this task covers).

- [ ] **Step 1: Replace in `app/dashboard/api-keys/page.tsx`**

Before (lines 476-483):
```typescript
                        <div className="text-xs text-muted-foreground mt-1">
                          Created:{" "}
                          {new Date(key.createdAt).toLocaleDateString()}
                          {key.lastUsedAt &&
                            ` • Last used: ${new Date(
                              key.lastUsedAt
                            ).toLocaleDateString()}`}
                        </div>
```

After:
```typescript
                        <div className="text-xs text-muted-foreground mt-1">
                          Created:{" "}
                          <LocalTime date={key.createdAt} formatStr="datewithyear" />
                          {key.lastUsedAt && (
                            <>
                              {" • Last used: "}
                              <LocalTime date={key.lastUsedAt} formatStr="datewithyear" />
                            </>
                          )}
                        </div>
```

Add `import { LocalTime } from "@/components/server-time"`.

- [ ] **Step 2: Replace in `app/dashboard/[slug]/settings/api-keys/page.tsx`**

Before (lines 451,453):
```typescript
                      <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                      {key.lastUsedAt && (
                        <><span>·</span><span>Last used: {new Date(key.lastUsedAt).toLocaleDateString()}</span></>
                      )}
```

After:
```typescript
                      <span>Created: <LocalTime date={key.createdAt} formatStr="datewithyear" /></span>
                      {key.lastUsedAt && (
                        <><span>·</span><span>Last used: <LocalTime date={key.lastUsedAt} formatStr="datewithyear" /></span></>
                      )}
```

Add `import { LocalTime } from "@/components/server-time"`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 4: Manual verify**

Load both `/dashboard/api-keys` and `/dashboard/[slug]/settings/api-keys` in a browser with an account that has at least one API key with a `lastUsedAt` set. Confirm "Created"/"Last used" briefly show a UTC value then settle to your browser's local timezone within a frame (expected per Task 1B's mount-guard). Change your OS timezone (or use browser devtools' timezone override) and reload — the displayed date should shift accordingly.

- [ ] **Step 5: Commit**

```bash
cd apps/web && git add app/dashboard/api-keys/page.tsx "app/dashboard/[slug]/settings/api-keys/page.tsx"
git commit -m "refactor: render API key created/last-used dates in visitor's local time"
```

---

## Task 5: Migrate `navbar-client.tsx`, `staff-table.tsx`, `timeline-feed.tsx` — viewer-local

**Files:**
- Modify: `apps/web/components/navbar-client.tsx:180`
- Modify: `apps/web/components/staff-table.tsx:329`
- Modify: `apps/web/components/timeline-feed.tsx:113-131` (grouping logic, not just the display line — see Step 3)

All three are visitor-facing UI — use `<LocalTime>`/`formatLocalTime` from `components/server-time.tsx` (Task 1B), not `formatServerTime`. All three files are already client components (verify `"use client"` at top before editing; if any aren't, that's new information — stop and report NEEDS_CONTEXT rather than guessing why).

- [ ] **Step 1: `navbar-client.tsx`**

Before (line 180):
```typescript
                              {new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
```

After:
```typescript
                              <LocalTime date={n.createdAt} formatStr="datetime" />
```

Note: `"datetime"` uses `hour: "numeric"` not `"2-digit"` — output loses the leading zero (e.g. "8:54 PM" instead of "08:54 PM"). Accepted minor visual difference to avoid a 7th near-duplicate kind for one call site; flag in QA.

Add `import { LocalTime } from "@/components/server-time"`.

- [ ] **Step 2: `staff-table.tsx`**

Before (line 329):
```typescript
                    {new Date(member.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
```

After:
```typescript
                    <LocalTime date={member.joinedAt} formatStr="datewithyear" />
```

Add `import { LocalTime } from "@/components/server-time"`.

This is the staff/shift feature area (medium risk per roadmap) — verify against a real staff roster with known join dates before committing.

- [ ] **Step 3: `timeline-feed.tsx` — grouping logic AND display, not just the label**

This call site is different from the others: `formatServerTime`/`formatLocalTime` produce a *string*, but this code uses that string as a `.reduce()` grouping key to bucket timeline items under day headers (lines 113-124 in the original file — read the current file first since line numbers may have shifted from earlier tasks). Simply swapping the formatter changes what the label *says* but not which items get bucketed together — if bucketing stays on UTC calendar days while the label implies local time, an item at 11pm PST (which is the next UTC day) could show grouped under the wrong local-day header. Fix both together.

Before:
```typescript
  const visibleItems = items.filter((item) => matchesFilter(item, filter))

  // Group by UTC day for day headers
  const grouped = visibleItems.reduce<{ day: string; items: TimelineItem[] }[]>((acc, item) => {
    const day = new Date(item.timestamp).toLocaleDateString("en-GB", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "short",
    })
    const last = acc[acc.length - 1]
    if (last && last.day === day) last.items.push(item)
    // ... (rest of reduce body — read full function before editing, don't truncate)
```

After — add the same mount-guard pattern `<LocalTime>` uses internally, but since this is a plain function (not JSX), do it explicitly in the component body:

```typescript
import { useEffect, useState } from "react"
import { formatServerTime, formatLocalTime } from "@/components/server-time"

// inside the component function, before the grouping logic:
const [mounted, setMounted] = useState(false)
useEffect(() => setMounted(true), [])
const formatDay = mounted ? formatLocalTime : formatServerTime

const visibleItems = items.filter((item) => matchesFilter(item, filter))

const grouped = visibleItems.reduce<{ day: string; items: TimelineItem[] }[]>((acc, item) => {
  const day = formatDay(item.timestamp, "dayheader")
  const last = acc[acc.length - 1]
  if (last && last.day === day) last.items.push(item)
  // ... (rest of reduce body unchanged — copy from the original function, don't rewrite logic you don't have in front of you)
```

Check whether `timeline-feed.tsx` already has its own `mounted`/`useState`/`useEffect` for an unrelated reason before adding a second one — if so, reuse the existing state instead of duplicating it.

Add `import { formatServerTime, formatLocalTime } from "@/components/server-time"` (both needed — UTC before mount, local after).

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 5: Manual verify**

- Navbar: open the notifications dropdown, confirm timestamps render, briefly UTC then local (expected).
- Staff table: view `/dashboard/[slug]/staff`, confirm "Joined" column renders and updates to local time after mount.
- Timeline feed: view the venue timeline with items spanning a UTC-day boundary (e.g. one item at 11:30pm UTC, another at 12:30am UTC the next day). With your browser timezone set behind UTC (e.g. US Pacific), confirm both items now group under the *same* local-day header instead of splitting across the UTC boundary — this is the actual behavior change, not just a label swap. Verify with browser devtools' timezone override if you don't have an easy way to generate boundary-spanning test data.

- [ ] **Step 6: Commit**

```bash
cd apps/web && git add components/navbar-client.tsx components/staff-table.tsx components/timeline-feed.tsx
git commit -m "refactor: render navbar, staff table, timeline feed in visitor's local time"
```

---

## Task 6: Migrate remaining full-datetime call sites (split: 2 viewer-local, 1 stays UTC)

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/analytics/page.tsx:639` — viewer-local
- Modify: `apps/web/app/invite/[token]/page.tsx:223` — viewer-local
- Modify: `apps/web/lib/discord-webhook.ts:303` — **switches to Discord's native `<t:UNIX:F>` timestamp markup, not `formatServerTime` and not `LocalTime`.** Correction from an earlier version of this plan: Discord renders `<t:UNIX:FORMAT>` tags in each reader's own local timezone client-side — this file already uses that exact pattern for event start/end times (`lib/discord-webhook.ts:387-389,433-437` — `Math.floor(date.getTime()/1000)` then `` `<t:${unix}:F>` ``). The task-due-date field at line 303 is the one place in this file that doesn't follow that established pattern. Fix it to match, don't introduce a third approach.

(Task 2's cron summary routes are a different case and are NOT revised here — they label a report's UTC day-boundary, e.g. "yesterday's sales," not an instant. Converting that to a Discord local-timestamp could show the wrong calendar date next to UTC-bucketed data. Task 2 stays on `formatServerTime` as originally planned.)

- [ ] **Step 1: `analytics/page.tsx` — viewer-local**

Before (line 639):
```typescript
                  <StatReadout label={new Date(month + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} value={`+${count as number}`} subtext="new followers" />
```

After:
```typescript
                  <StatReadout label={<LocalTime date={`${month}-01`} formatStr="monthyear" />} value={`+${count as number}`} subtext="new followers" />
```

Add `import { LocalTime } from "@/components/server-time"`. Confirm this file is (or becomes) a client component — check `"use client"` at the top; if it's a Server Component, converting it is in scope for this step (same caveat as Task 4: escalate as BLOCKED if the file has server-only code in the component body, e.g. direct `prisma` calls).

Note: `"monthyear"` uses `month: "long"` (Task 1) producing "April 2026" vs the original `month: 'short'` producing "Apr 2026". If the tighter label is needed for layout (this renders inside a small `Card`), change Task 1B's `getServerTimeIntlOptions` mapping for `"monthyear"` to `opts.month = "short"` instead of `"long"` before running this step — check the rendered card width first, don't guess; this is the one judgment call in this plan.

- [ ] **Step 2: `invite/[token]/page.tsx` — viewer-local**

Before (line 223):
```typescript
              Invite expires: {new Date(inviteDetails.expiresAt).toLocaleString()}
```

After:
```typescript
              Invite expires: <LocalTime date={inviteDetails.expiresAt} formatStr="datetimelong" />
```

Add `import { LocalTime } from "@/components/server-time"`. Same client-component check as Step 1.

- [ ] **Step 3: `lib/discord-webhook.ts` — match the existing `<t:UNIX:F>` pattern already used in this file**

First, read `lib/discord-webhook.ts:380-395` to see the exact existing pattern (`startUnix`/`endUnix` construction and the `<t:${startUnix}:F>` template) before writing this — copy its style, don't invent a new one.

Before (line 303):
```typescript
      value: new Date(task.dueDate).toLocaleString(),
```

After:
```typescript
      value: `<t:${Math.floor(new Date(task.dueDate).getTime() / 1000)}:F>`,
```

No new import needed — this doesn't use `formatServerTime` or `LocalTime` at all, it's Discord's own markup, rendered client-side by each Discord user's app in their own local timezone. This is a behavior change from the original plan (which would have kept it UTC-only text): due dates now render correctly per-Discord-reader, matching how event times already work elsewhere in this file.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 5: Manual verify**

- Analytics: view `/dashboard/[slug]/analytics`, confirm "new followers by month" cards render, aren't visually cramped (resolve the short/long month judgment call from Step 1), and settle to local time after mount.
- Invite page: generate a test invite link, open it, confirm "Invite expires" shows a full date+time that matches your own local clock, not UTC.
- Discord webhook: trigger a task-reminder webhook, check the "Due Date" field in the actual Discord client (not just the raw payload) — it should render as a normal Discord timestamp (e.g. "August 11, 2026 2:00 PM") and match your own local clock, same as event start/end times already do elsewhere in Discord messages from this app.

- [ ] **Step 6: Commit**

```bash
cd apps/web && git add "app/dashboard/[slug]/analytics/page.tsx" "app/invite/[token]/page.tsx" lib/discord-webhook.ts
git commit -m "refactor: render analytics/invite dates in visitor's local time, keep webhook text in UTC"
```

---

## Explicitly out of scope for this plan

Every `.toLocaleString()` (no args) hit found in `analytics/page.tsx`, `payroll/page.tsx`, `sales/page.tsx`, `dashboard-analytics.tsx`, `discover-client.tsx`, `live-dashboard.tsx`, `overview-revenue-chart.tsx`, `patron-profiles-table.tsx`, `transactions-list.tsx`, `stats/page.tsx`, `venues/[slug]/page.tsx`, `discord-webhook.ts` (gil amounts) is **`Number.prototype.toLocaleString()`** (currency/count formatting), not date formatting — the original grep regex matched both. These belong to a separate, already-catalogued cleanup item (roadmap finding #6: `lib/format.ts`'s `formatGil`/`formatGilCompact` exist but are inconsistently used) and should not be touched in this plan.

`patron-profiles-table.tsx`'s one hit (`p.totalSpent.toLocaleString()`) is also a Number call, and that file is in the patron-tracking feature freeze regardless — doubly out of scope here.

**Explicitly flagged and deferred (not fixed in this plan — confirmed with user 2026-08-11), scope as follow-up work once this plan ships:**
- Stored `PendingNotification.body` strings (Task 3 — shift claim/approve/reject) bake a formatted date directly into the sentence at creation time. Making these viewer-local requires storing the raw timestamp separately and re-templating the sentence client-side at render — a schema/architecture change, not a formatting swap. Left on UTC/"ST" text for now.
- The one-frame flash from UTC → local time on first render (Task 1B's `<LocalTime>` mount-guard) is inherent to doing viewer-local rendering in an SSR app without a timezone-detection cookie. Not fixed here; a cookie-based approach could eliminate it later if it becomes a real complaint.
- `daily-sales-summary` cron's "yesterday" boundary is computed once in UTC for all venues at a single fixed UTC cron trigger time — not per-venue local midnight. Making this dynamic (each venue gets its own "yesterday" relative to its own local clock) requires the cron to run per-venue or per-timezone-bucket rather than once globally — a scheduling/trigger architecture change, not a formatting one. Flagged 2026-08-11, scope as a real follow-up task alongside the other deferred items above.

---

## Self-review notes

- All 12 real date-formatting call sites from the original grep sweep are covered (Tasks 2-6); the 2 false-flags are excluded with rationale (Task 0); the ~15 Number.toLocaleString() false-positives are excluded with rationale (final section).
- One open judgment call remains: `monthyear` kind's month length (short vs long) — flagged in Task 6 Step 1, resolve by checking the rendered card, not by guessing here.
- Kind names (`weekdatelong`, `weekdate`, `shiftdate`, `dayheader`, `datewithyear`, `monthyear`) are used identically between Task 1's definition and Tasks 2-6's call sites — verified consistent.
- **Post-amendment:** Tasks 2, 3, and Task 6 Step 3 (discord-webhook) are UNCHANGED from the original UTC-based plan — broadcast/stored text has no single viewer. Tasks 4, 5, and Task 6 Steps 1-2 are revised to use Task 1B's `<LocalTime>`/`formatLocalTime` instead of `formatServerTime` — visitor-facing dashboard/UI pages render in the visitor's own local timezone, backend/storage stays UTC throughout (no schema change anywhere in this plan).
- Task 1B depends on reading what Task 1's implementer actually committed for `shiftdate`/`dayheader` (they deviated from the plan's original snippet) before refactoring `formatServerTime` — the refactor step calls this out explicitly rather than assuming the original snippet is what's on disk.
