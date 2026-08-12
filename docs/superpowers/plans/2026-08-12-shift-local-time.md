# Shift Times: Viewer-Local Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch shift times and day-bucketing across the shifts feature (week grid, month calendar, day-detail dialog) from Server Time (ST/UTC) to each viewer's own local time, using the same hydration-safe mount-guard pattern `<LocalTime>` already established, and fix a real latent bug in the "duplicate shift" prefill flow along the way.

**Architecture:** Server Components keep fetching raw shift rows (with a widened UTC query window so no shift near a local-day boundary gets excluded before local bucketing sees it) and pass them to new/updated Client Components. Those components render an ST-bucketed view on first paint (matching what SSR produced, avoiding a hydration mismatch) and swap to a local-bucketed view after mount — the same `useState(false) + useEffect(() => setMounted(true))` pattern as `<LocalTime>` in `components/server-time.tsx`, just applied to day-bucketing logic as well as time-label text.

**Tech Stack:** TypeScript, Next.js App Router (Server + Client Components), Prisma, Vitest.

---

## Task 0: Scope decisions (no code — read and accept before starting)

Three judgment calls made while planning this. Each has a reasoned default; flagging them explicitly rather than silently deciding, since they're genuinely novel UX questions for this codebase.

**1. Week navigation stays anchored to Server-Time weeks (Monday–Sunday UTC); only the grid's day-columns and their contents become viewer-local.**

The `?w=` URL param that selects which week's data to fetch is set server-side, before the server knows the viewer's timezone. Making "this week" fully viewer-relative would mean the server can't know which week to fetch on first load, and the Prisma query window itself would need to be viewer-timezone-aware — a much bigger change (cookie-based timezone storage, or a client-side redirect-on-mount). Default: keep `prevWeekParam`/`nextWeekParam`/`isCurrentWeek`/the "This week" label ST-based exactly as today (nothing changes there), but each day-column's date and the shifts bucketed into it are computed from the viewer's local calendar day. At extreme offsets (UTC-12 or UTC+14) the 7 visible columns may not line up with that viewer's own "this calendar week" — accepted as a near-term compromise, not solved here.

**2. Notification body text (`PendingNotification`, plugin claim/cancel/reminder routes) stays Server Time. Do not touch it.**

`app/api/plugin/shifts/claim/route.ts` and `app/api/venues/[venueId]/shifts/[shiftId]/route.ts` call `formatServerTime(shift.scheduledStart, "shiftdate")` to build a `body: string` baked into a `PendingNotification` row at write time. That string is read later by whichever manager opens their notification dropdown — there is no single "viewer" at write time, and the string is already flattened into stored text, not a live-rendered `Date`. Making it per-viewer-local would require restructuring notifications to store the raw timestamp and template the body at read time instead — out of scope for this plan. This matches the original Phase 1 server-time-consolidation decision: broadcast/pre-composed text stays ST.

**3. The widened Prisma query buffer is ±14 hours on each side of the ST week window.**

Real-world UTC offsets range from UTC-12 to UTC+14. A shift at the very edge of the ST week window could belong to a different local day for a viewer at either extreme. ±14 hours on both ends covers the full range with margin. This only affects which rows are *fetched* — the bucketing logic (Task 2) still places each shift in the correct local day-column, or drops it from the visible grid if its local day falls outside the 7 displayed columns (rare, only possible at the two extreme-offset edges of the window).

- [ ] **Step 1: No action needed** — decisions above are the plan's baseline; implement against them.

---

## Task 1: Local-day-bucketing utilities, hydration-safe

**Files:**
- Create: `apps/web/lib/local-day.ts`
- Test: `apps/web/lib/local-day.test.ts`

Mirrors the existing `utcDayKey`/`fmtHour` shape (both the copy in `app/dashboard/[slug]/shifts/page.tsx:36-52` and the shared one in `lib/shift-format.ts`) but keyed by the *viewer's* local calendar day instead of UTC. No React/hydration-guard logic lives here — that's Task 2's job, wrapping these pure functions.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/lib/local-day.test.ts
import { describe, it, expect } from "vitest"
import { localDayKey, localHourLabel } from "./local-day"

describe("localDayKey", () => {
  it("returns YYYY-MM-DD for the given date in the given IANA timezone", () => {
    // 2026-01-15T23:30:00Z is still 2026-01-15 in UTC, but 2026-01-16 in UTC+1
    const d = new Date("2026-01-15T23:30:00Z")
    expect(localDayKey(d, "UTC")).toBe("2026-01-15")
    expect(localDayKey(d, "Europe/Paris")).toBe("2026-01-16")
  })

  it("returns the earlier day for a negative offset near midnight UTC", () => {
    const d = new Date("2026-01-15T01:00:00Z")
    expect(localDayKey(d, "America/Los_Angeles")).toBe("2026-01-14")
  })
})

describe("localHourLabel", () => {
  it("formats a time as h:mmAM/PM in the given timezone, omitting :00", () => {
    const d = new Date("2026-01-15T22:00:00Z") // 22:00 UTC
    expect(localHourLabel(d, "UTC")).toBe("10PM")
    expect(localHourLabel(d, "Pacific/Auckland")).toBe("11AM") // next day, +13 in Jan (DST)
  })

  it("includes minutes when non-zero", () => {
    const d = new Date("2026-01-15T22:30:00Z")
    expect(localHourLabel(d, "UTC")).toBe("10:30PM")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run lib/local-day.test.ts
```

Expected: FAIL — `Cannot find module './local-day'`.

- [ ] **Step 3: Implement**

```typescript
// apps/web/lib/local-day.ts

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run lib/local-day.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/local-day.ts apps/web/lib/local-day.test.ts
git commit -m "feat(web): add viewer-local day/hour formatting utilities"
```

---

## Task 2: Widen the week-grid's Prisma query window

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx:104-141`

Currently `weekShifts` is fetched with `scheduledStart: { gte: weekStart, lt: weekEnd }` — an exact ST Monday-to-Monday window. Widen by 14 hours on each side so shifts near the boundary are fetched even if a viewer's local day places them outside the ST week; bucketing (Task 3) will place or drop them correctly.

- [ ] **Step 1: Add the padded fetch window**

Current (`apps/web/app/dashboard/[slug]/shifts/page.tsx:104-106`):

```typescript
  const base = w ? new Date(w + "T00:00:00Z") : new Date()
  const weekStart = getWeekMonday(base)
  const weekEnd = addUTCDays(weekStart, 7) // exclusive upper bound
```

Add directly below it:

```typescript
  // Widen the fetch window so shifts near the ST week boundary are still
  // fetched even if a viewer's local day places them outside it — bucketing
  // in ShiftsWeekView (Task 3) assigns each shift to the viewer's actual
  // local day, or drops it if that day falls outside the 7 displayed columns.
  const FETCH_PADDING_MS = 14 * 60 * 60 * 1000 // covers UTC-12..UTC+14
  const fetchWindowStart = new Date(weekStart.getTime() - FETCH_PADDING_MS)
  const fetchWindowEnd = new Date(weekEnd.getTime() + FETCH_PADDING_MS)
```

- [ ] **Step 2: Use the padded window in the query**

Current (`apps/web/app/dashboard/[slug]/shifts/page.tsx:118-123`):

```typescript
    prisma.shift.findMany({
      where: {
        venueId: venue.id,
        scheduledStart: { gte: weekStart, lt: weekEnd },
      },
```

Replace with:

```typescript
    prisma.shift.findMany({
      where: {
        venueId: venue.id,
        scheduledStart: { gte: fetchWindowStart, lt: fetchWindowEnd },
      },
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/[slug]/shifts/page.tsx
git commit -m "fix(web): widen shifts week-grid fetch window to cover all local-day offsets"
```

(Note: at this point `weekShifts` may include a few extra rows outside the exact ST week — harmless until Task 3 lands, since the existing ST-based bucketing in page.tsx will simply place them in the extra days some viewers won't see rendered. Task 3 replaces that bucketing entirely.)

---

## Task 3: New `ShiftsWeekView` client component — local-day bucketing with mount guard

**Files:**
- Create: `apps/web/components/shifts-week-view.tsx`
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx`

This is the core of the plan. Move the KPI header, week-nav label, weekly grid, and action-items list out of the server-rendered page body into a new Client Component that receives the padded raw shift rows and renders them twice: once ST-bucketed (matches SSR, avoids hydration mismatch), then swaps to local-bucketed after mount.

- [ ] **Step 1: Define the props shape and copy over the existing pure helpers**

`ShiftRow` (the shape already used in `page.tsx` — check its current type alias near the top of the file, e.g. `type ShiftRow = ...`, and reuse it verbatim as the prop type; don't redefine a new shape). Read `apps/web/app/dashboard/[slug]/shifts/page.tsx` in full before starting this task so the exact `ShiftRow` type, `resolveDisplayName` usage, and `staffForDialog`/`venueRoles`/`potModeEnabled`/`eventsForDialog` prop shapes passed to `CreateShiftDialog` are copied exactly as they exist today — do not guess at field names.

```typescript
// apps/web/components/shifts-week-view.tsx
"use client"

import { Fragment, useEffect, useState } from "react"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CreateShiftDialog } from "@/components/create-shift-dialog"
import { ClaimedShiftChip } from "@/components/claimed-shift-chip"
import { OpenShiftChip } from "@/components/open-shift-chip"
import { DeleteShiftButton } from "@/components/delete-shift-button"
import { ClockShiftButton } from "@/components/clock-shift-button"
import { localDayKey, localHourLabel, browserTimeZone } from "@/lib/local-day"
import { resolveDisplayName } from "@/lib/display-name"

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const ST_TZ = "Etc/UTC"

// Same UTC helpers page.tsx already has (Task 0's decision: week-nav anchor
// stays ST-based) — kept local to this component rather than re-importing
// from page.tsx, since Server Components can't be imported into Client ones.
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Write the component skeleton with the mount guard**

```typescript
export interface ShiftsWeekViewProps {
  weekShifts: ShiftRow[]        // padded-window rows from Task 2's query
  activeShifts: ShiftRow[]      // venue-wide ACTIVE shifts, unchanged by this task
  weekStartISO: string          // ST Monday, from page.tsx's weekStart.toISOString()
  isCurrentWeek: boolean
  fmtWeekLabelST: string        // pre-formatted "Mon 2 Jun" for the ST week label
  slug: string
  venueId: string
  canManage: boolean
  staffForDialog: unknown       // exact type from page.tsx's existing prop — copy verbatim
  venueRoles: unknown
  potModeEnabled: boolean
  eventsForDialog: unknown
}

export function ShiftsWeekView(props: ShiftsWeekViewProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const timeZone = mounted ? browserTimeZone() : ST_TZ
  const dayKeyOf = (d: Date | string) =>
    mounted ? localDayKey(d, timeZone) : utcDayKey(new Date(d))
  const hourLabelOf = (d: Date | string) =>
    mounted ? localHourLabel(d, timeZone) : /* ST fallback, same shape as before */ (() => {
      const date = new Date(d)
      const h = date.getUTCHours()
      const m = date.getUTCMinutes()
      const ampm = h >= 12 ? "PM" : "AM"
      const h12 = h % 12 || 12
      return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
    })()

  const weekStart = new Date(props.weekStartISO)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(d.getUTCDate() + i)
    return d
  })
  const weekDayKeys = weekDays.map((d) => (mounted ? dayKeyOf(d) : utcDayKey(d)))
  const todayKey = dayKeyOf(new Date())

  // Bucket weekShifts (padded) into only the local days actually shown in
  // this week's 7 columns — a shift whose local day falls outside
  // weekDayKeys (possible at extreme offsets, see Task 0 note 1 and 3) is
  // simply not rendered in this grid. It's still fetched (Task 2) so a
  // future "jump to your week" affordance could surface it later.
  const staffMap = new Map<string, {
    membershipId: string
    name: string
    cells: Map<string, ShiftRow[]>
  }>()
  for (const shift of props.weekShifts) {
    if (!shift.membershipId) continue
    const key = dayKeyOf(shift.scheduledStart)
    if (!weekDayKeys.includes(key)) continue
    const mid = shift.membershipId
    if (!staffMap.has(mid)) {
      staffMap.set(mid, {
        membershipId: mid,
        name: resolveDisplayName({
          characterName: shift.membership?.user?.characters?.[0]?.characterName,
          nickname: shift.membership?.nickname,
          displayName: shift.membership?.user?.displayName,
          discordName: shift.membership?.user?.name,
        }),
        cells: new Map(),
      })
    }
    const member = staffMap.get(mid)!
    if (!member.cells.has(key)) member.cells.set(key, [])
    member.cells.get(key)!.push(shift)
  }
  const staffRows = [...staffMap.values()]

  const openShiftsByDay = new Map<string, ShiftRow[]>()
  for (const shift of props.weekShifts) {
    if (shift.status !== "OPEN") continue
    const key = dayKeyOf(shift.scheduledStart)
    if (!weekDayKeys.includes(key)) continue
    if (!openShiftsByDay.has(key)) openShiftsByDay.set(key, [])
    openShiftsByDay.get(key)!.push(shift)
  }
  const hasOpenShifts = openShiftsByDay.size > 0

  // KPI counts, scoped to shifts actually shown in this week's local-day columns.
  const shownWeekShifts = props.weekShifts.filter((s) => weekDayKeys.includes(dayKeyOf(s.scheduledStart)))
  const activeWeekShifts = shownWeekShifts.filter((s) => s.status !== "CANCELLED")
  const scheduledCount = shownWeekShifts.filter((s) => s.status === "SCHEDULED").length
  const openSlots = shownWeekShifts.filter((s) => s.status === "OPEN" || s.status === "CLAIMED").length
  const missedCount = shownWeekShifts.filter((s) => s.status === "MISSED").length
  const coverPct = activeWeekShifts.length === 0 ? 100 : Math.round(((activeWeekShifts.length - openSlots) / activeWeekShifts.length) * 100)
  const reliabilityPct = activeWeekShifts.length === 0 ? 100 : Math.round(((activeWeekShifts.length - missedCount) / activeWeekShifts.length) * 100)
  const activeCount = props.activeShifts.length

  const actionShifts = shownWeekShifts.filter((s) => s.status === "SCHEDULED" || s.status === "ACTIVE")
  const tomorrowDate = new Date()
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
  const tomorrowKey = dayKeyOf(tomorrowDate)
  function dayLabel(key: string): string {
    if (key === todayKey) return "Today"
    if (key === tomorrowKey) return "Tomorrow"
    const parts = key.split("-").map(Number)
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
    return d.toLocaleString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
  }
  const actionShiftsByDay = new Map<string, ShiftRow[]>()
  for (const shift of actionShifts) {
    const key = dayKeyOf(shift.scheduledStart)
    if (!actionShiftsByDay.has(key)) actionShiftsByDay.set(key, [])
    actionShiftsByDay.get(key)!.push(shift)
  }
  const actionDayKeys = [...actionShiftsByDay.keys()].sort()

  return (
    <>
      {/* KPIs */}
      <div className="kpis mb-6">
        {[
          { k: "Shifts this week", v: activeWeekShifts.length, sub: mounted ? "your local time" : props.fmtWeekLabelST, icon: "M12 2a10 10 0 1 1 0 20A10 10 0 0 1 12 2zm0 2v8l4 2" },
          { k: "Open shifts", v: openSlots, sub: "needs cover", icon: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01" },
          { k: "Active now", v: activeCount, sub: "on shift", icon: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" },
          { k: "Coverage", v: `${coverPct}%`, sub: "shifts filled", icon: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0" },
          { k: "Reliability", v: `${reliabilityPct}%`, sub: "no-shows excl.", icon: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0" },
        ].map(({ k, v, sub, icon }) => (
          <div key={k} className="stat">
            <div className="top"><span className="sb"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={icon} /></svg></span></div>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
            <div className="delta flat">{sub}</div>
          </div>
        ))}
      </div>

      {/* Week nav toolbar label only — prev/next Links stay in page.tsx (server-rendered, ST-anchored per Task 0) */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="px-3 text-sm font-semibold min-w-[90px] text-center">
          {props.isCurrentWeek ? "This week" : props.fmtWeekLabelST}
        </span>
        {!props.isCurrentWeek && (
          <a href={`/dashboard/${props.slug}/shifts`} className="text-xs text-[var(--xiv-blue)] hover:underline">
            Back to current week
          </a>
        )}
      </div>

      {/* Weekly grid */}
      <div className="panel mb-6 sched">
        <div className="sched-grid">
          <div className="sg-h staffcol">Staff</div>
          {weekDayKeys.map((key, i) => (
            <div key={i} className={`sg-h${key === todayKey ? " today-col" : ""}`}>
              {DAY_SHORT[i]} <span className="dnum">{Number(key.slice(8, 10))}</span>
            </div>
          ))}

          {staffRows.map((member) => (
            <Fragment key={member.membershipId}>
              <div key={`${member.membershipId}-name`} className="sg-staff">
                <span className="av-sm flex-shrink-0">
                  {member.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <span className="truncate">{member.name}</span>
              </div>
              {weekDayKeys.map((key) => {
                const dayShifts = member.cells.get(key) ?? []
                return (
                  <div key={`${member.membershipId}-${key}`} className={`sg-cell${key === todayKey ? " today-col" : ""}`}>
                    {dayShifts.map((shift) =>
                      shift.status === "CLAIMED" ? (
                        <ClaimedShiftChip
                          key={shift.id}
                          shiftId={shift.id}
                          venueId={props.venueId}
                          timeLabel={`${hourLabelOf(shift.scheduledStart)}–${hourLabelOf(shift.scheduledEnd)}${shift.role?.name ? ` · ${shift.role.name}` : ""}`}
                          canManage={props.canManage}
                        />
                      ) : (
                        <div key={shift.id} className="flex items-center gap-1">
                          <span className={`shift-chip${shift.status === "ACTIVE" ? " em" : shift.status === "MISSED" ? " am" : ""}`}>
                            {hourLabelOf(shift.scheduledStart)}–{hourLabelOf(shift.scheduledEnd)}
                            {shift.role?.name ? ` · ${shift.role.name}` : ""}
                          </span>
                          {props.canManage && (
                            <CreateShiftDialog
                              venueSlug={props.slug}
                              staff={props.staffForDialog as never}
                              roles={props.venueRoles as never}
                              potModeEnabled={props.potModeEnabled}
                              events={props.eventsForDialog as never}
                              trigger={<Button variant="ghost" size="sm" aria-label="Duplicate shift" className="h-6 w-6 p-0"><Copy className="h-3.5 w-3.5" /></Button>}
                              prefill={{
                                mode: "assign",
                                membershipId: shift.membershipId ?? undefined,
                                // Local time now, matching CreateShiftDialog's "your local time"
                                // input model — fixes the pre-existing prefill bug (see plan intro).
                                date: mounted ? localDayKey(shift.scheduledStart, timeZone) : utcDayKey(new Date(shift.scheduledStart)),
                                startTime: mounted
                                  ? new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(shift.scheduledStart))
                                  : new Date(shift.scheduledStart).toISOString().slice(11, 16),
                                endTime: mounted
                                  ? new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(shift.scheduledEnd))
                                  : new Date(shift.scheduledEnd).toISOString().slice(11, 16),
                                notes: shift.notes ?? undefined,
                              }}
                            />
                          )}
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </Fragment>
          ))}

          {hasOpenShifts && (
            <>
              <div key="open-shifts-name" className="sg-staff">
                <span className="av-sm flex-shrink-0 border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-400">!</span>
                <span className="truncate text-amber-400">Open shifts</span>
              </div>
              {weekDayKeys.map((key) => {
                const dayShifts = openShiftsByDay.get(key) ?? []
                return (
                  <div key={`open-${key}`} className={`sg-cell${key === todayKey ? " today-col" : ""}`}>
                    {dayShifts.map((shift) => (
                      <div key={shift.id} className="flex items-center gap-1">
                        <OpenShiftChip
                          shiftId={shift.id}
                          venueId={props.venueId}
                          timeLabel={`${hourLabelOf(shift.scheduledStart)}–${hourLabelOf(shift.scheduledEnd)}${shift.role?.name ? ` · ${shift.role.name}` : ""}`}
                          canClaim={!props.canManage}
                        />
                      </div>
                    ))}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      {/* Action items — read the current page.tsx's action-items JSX (below the
          grid, uses actionDayKeys/actionShiftsByDay/dayLabel/DeleteShiftButton/
          ClockShiftButton) and move it here verbatim, swapping utcDayKey/fmtHour
          call sites for dayKeyOf/hourLabelOf exactly as done above. Not reproduced
          in full here — same mechanical substitution pattern as the grid above. */}
    </>
  )
}
```

**Note to implementer:** the "Action items" section's exact JSX was not reproduced above (it wasn't shown during planning) — read `apps/web/app/dashboard/[slug]/shifts/page.tsx`'s current content below the weekly grid (search for `actionDayKeys`) and move it into this component using the exact same `dayKeyOf`/`hourLabelOf` substitution pattern applied everywhere else in this task. Every other section is complete, working code — only this one requires reading the current file first.

- [ ] **Step 3: Wire `ShiftsWeekView` into `page.tsx`, removing the migrated JSX/logic**

In `apps/web/app/dashboard/[slug]/shifts/page.tsx`:
- Remove the local `fmtHour`, `utcTimeKey` functions (lines 41-52) — no longer used in this file (grid/action-item rendering moved out). Keep `utcDayKey`, `getWeekMonday`, `addUTCDays`, `fmtWeekLabel` — still used for the fetch window and prev/next nav (Task 0 decision 1).
- Remove the KPI computation block, `staffMap`/`staffRows` building, `openShiftsByDay` building, `actionShifts`/`actionShiftsByDay`/`dayLabel` (all now live in `ShiftsWeekView`).
- Remove the KPIs JSX block, the week-nav label + "Back to current week" link (kept in `ShiftsWeekView`, prev/next `<Link>`s stay here), the Weekly grid JSX block, and the Action items JSX block.
- In their place, inside the `view === "week"` branch, render:

```tsx
<ShiftsWeekView
  weekShifts={weekShifts}
  activeShifts={activeShifts}
  weekStartISO={weekStart.toISOString()}
  isCurrentWeek={isCurrentWeek}
  fmtWeekLabelST={fmtWeekLabel(weekStart)}
  slug={slug}
  venueId={venue.id}
  canManage={canManage}
  staffForDialog={staffForDialog}
  venueRoles={venueRoles}
  potModeEnabled={potModeEnabled}
  eventsForDialog={eventsForDialog}
/>
```

- Add the import: `import { ShiftsWeekView } from "@/components/shifts-week-view"`
- Keep the prev/next-week `<Link>` arrows (currently inside the same toolbar div as the label) in `page.tsx` — only the label and "Back to current week" moved.

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Fix any prop-type mismatches by copying the exact types page.tsx already uses for `staffForDialog`/`venueRoles`/`eventsForDialog`/`ShiftRow` into `ShiftsWeekViewProps` (replacing the `unknown` placeholders from Step 2) rather than leaving them as `unknown`/`as never` — those were planning-time placeholders because this task was written without direct sight of page.tsx's own type aliases; look them up and use them.

- [ ] **Step 5: Manual verify**

```bash
cd apps/web && pnpm dev
```

- Load the shifts week view. Confirm no hydration warning in the browser console (per today's Sentry/GlitchTip fix, a real one would now also show up at errors.xivvenuemanager.com — check there too).
- Confirm shift times display in your own local time (not ST) once the page has settled (compare against a shift's known ST time).
- Confirm the grid briefly shows ST-bucketed content on first paint, then (imperceptibly, same tick) swaps to local — this is expected, matches `<LocalTime>`'s existing behavior elsewhere in the app.
- Click "Duplicate shift" on an existing shift, confirm the prefilled date/time in the dialog matches what's shown on the chip (this is the prefill-bug fix — before this task, for a non-UTC viewer, the prefilled values would have been silently wrong by their offset).
- Confirm prev/next week navigation still works.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/shifts-week-view.tsx apps/web/app/dashboard/[slug]/shifts/page.tsx
git commit -m "feat(web): render shifts week grid in viewer-local time"
```

---

## Task 4: Migrate `lib/shift-format.ts`, `shifts-calendar.tsx`, `shift-day-dialog.tsx`

**Files:**
- Modify: `apps/web/lib/shift-format.ts`
- Modify: `apps/web/components/shifts-calendar.tsx`
- Modify: `apps/web/components/shift-day-dialog.tsx`

Same mount-guard pattern as Task 3, applied to the calendar tab. `ShiftsCalendar` is already a Client Component receiving pre-fetched rows, so this is a smaller change than Task 3 — no data-fetching-window change needed here (the existing 6-month rolling window in `page.tsx:165-208` already has wide enough margin that local-day shifting within it is never going to push a shift outside the window).

- [ ] **Step 1: Add mount-guarded local variants to `lib/shift-format.ts`**

Read the current file in full first (65 lines). Add, without removing the existing `utcDayKey`/`fmtHour` (Task 0 decision 1 means week-grid nav elsewhere may still reference UTC forms, and `ShiftsWeekView` from Task 3 does not import from this file — it has its own copies per Task 3 Step 1's note about Server/Client import boundaries):

```typescript
// Appended to apps/web/lib/shift-format.ts
import { localDayKey, localHourLabel } from "./local-day"

/** Local-timezone day key, or the UTC one if `mounted` is false (SSR/first paint). */
export function dayKeyFor(d: Date | string, timeZone: string | null): string {
  return timeZone ? localDayKey(d, timeZone) : utcDayKey(new Date(d))
}

/** Local-timezone hour label, or the UTC one if `mounted` is false (SSR/first paint). */
export function hourLabelFor(d: Date | string, timeZone: string | null): string {
  return timeZone ? localHourLabel(d, timeZone) : fmtHour(d)
}
```

(`timeZone: string | null` — callers pass `null` before mount, the real IANA zone after. This lets both call sites in Steps 2-3 share one mount-guard `useState`/`useEffect` pair each, rather than duplicating the ternary at every call site.)

- [ ] **Step 2: Update `shifts-calendar.tsx`**

Read the current file in full (171 lines) before editing. Add the mount guard near the top of the component function:

```typescript
import { useEffect, useState } from "react"
import { browserTimeZone } from "@/lib/local-day"
import { dayKeyFor, hourLabelFor, utcDayKey } from "@/lib/shift-format"
// ... existing imports stay
```

```typescript
export function ShiftsCalendar({ /* existing props */ }: ShiftsCalendarProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const timeZone = mounted ? browserTimeZone() : null
  // existing code below unchanged except:
  // - every `utcDayKey(x)` call becomes `dayKeyFor(x, timeZone)`
  // - every `fmtHour(x)` call becomes `hourLabelFor(x, timeZone)`
  // (existing local `todayKey = utcDayKey(new Date())` at line 51 becomes
  // `dayKeyFor(new Date(), timeZone)`, etc. — same substitution pattern as Task 3.)
```

Apply the same `utcDayKey` → `dayKeyFor(x, timeZone)` and `fmtHour` → `hourLabelFor(x, timeZone)` substitution at every call site found in the earlier grep of this file (lines 51, 68, 120-145 per the file as read during planning — re-grep before editing in case line numbers shifted).

- [ ] **Step 3: Update `shift-day-dialog.tsx`**

Same pattern. Read the current file in full (211 lines) before editing. Add the mount guard, substitute every `utcDayKey`/`fmtHour` call site found in the earlier grep (lines 56, 90, 97, 113-115, 148, 161, 205) with `dayKeyFor(x, timeZone)`/`hourLabelFor(x, timeZone)`.

For the duplicate-prefill call site specifically (`startTime: fmtHour(shift.scheduledStart)`, `endTime: fmtHour(shift.scheduledEnd)` around lines 114-115) — same prefill-format bug as Task 3's grid: `CreateShiftDialog` expects `startTime`/`endTime` as `"HH:MM"` 24-hour strings (see `apps/web/components/create-shift-dialog.tsx`'s `startTime`/`endTime` state, defaulted to `"19:00"`/`"23:00"`), not the `fmtHour`-produced `"10PM"` 12-hour display format. Reading the current file's exact prefill object during implementation, replace those two fields with:

```typescript
startTime: mounted
  ? new Intl.DateTimeFormat("en-GB", { timeZone: browserTimeZone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(shift.scheduledStart))
  : new Date(shift.scheduledStart).toISOString().slice(11, 16),
endTime: mounted
  ? new Intl.DateTimeFormat("en-GB", { timeZone: browserTimeZone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(shift.scheduledEnd))
  : new Date(shift.scheduledEnd).toISOString().slice(11, 16),
date: dayKeyFor(shift.scheduledStart, timeZone),
```

(This same `"HH:MM"` shape mismatch — `fmtHour`'s 12-hour display format being passed where a 24-hour input string is expected — likely already existed as a bug in the ORIGINAL `fmtHour`-based prefill too, predating this plan. Confirm by checking `create-shift-dialog.tsx`'s `startTime` input parsing during implementation; if it already tolerated the old format somehow, note that in the commit message rather than assuming.)

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 5: Manual verify**

```bash
cd apps/web && pnpm dev
```

- Open the Calendar tab, confirm shift chips show local time and the day cells they're grouped under match your local calendar day for a shift you know is near a ST day boundary (create a test shift at 11:30 PM ST or similar, if easy to do safely — otherwise verify with an existing shift and manual timezone math).
- Open the day-detail dialog from a calendar cell, confirm times match.
- Duplicate a shift from the day dialog, confirm the prefilled form matches the displayed time.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/shift-format.ts apps/web/components/shifts-calendar.tsx apps/web/components/shift-day-dialog.tsx
git commit -m "feat(web): render shifts calendar tab and day dialog in viewer-local time"
```

---

## Task 5: Full regression pass + deploy

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual QA — repeat Task 3 Step 5 and Task 4 Step 5's checks together in one sitting**, plus:
  - Switch your OS/browser timezone (or use browser devtools' sensor/locale override) to a non-UTC zone, reload, confirm times shift accordingly and no hydration warnings appear in console or GlitchTip.
  - Confirm the plugin-facing notification text (shift claim/cancel/reminder) is unchanged — still reads in ST, per Task 0 decision 2. This is a regression check, not a new feature — nothing in this plan should have touched those 4 route call sites; confirm they're untouched by re-reading them.

- [ ] **Step 3: Push and deploy**

```bash
cd apps/web/../.. && git push origin main
~/bin/deploy-xiv-web.sh --green
```

- [ ] **Step 4: Post-deploy spot check on the live domain**, following the same pattern as prior deploys in this project — load the shifts week view and calendar tab on `https://xivvenuemanager.com`, confirm no new GlitchTip issues appear for this feature area in the minutes after deploy.

---

## Deferred, not in this plan's scope
- Fully viewer-local week navigation (the `?w=` anchor and Monday-Sunday boundary itself becoming timezone-aware) — Task 0 decision 1's compromise. Would need either a timezone cookie set on first client visit + server-side redirect, or moving the week-selection logic client-side entirely.
- `PendingNotification` body text becoming per-viewer-local — Task 0 decision 2. Needs notification storage to keep raw timestamps and template at render time, a schema-level change.
