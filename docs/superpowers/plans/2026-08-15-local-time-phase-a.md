# Local Time Conversion — Phase A (mechanical swaps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert 8 user-facing time displays from Server Time (ST) to viewer-local time, using the already-existing `<LocalTime>`/`formatLocalTime` hydration-safe primitives — no structural changes, one-line-per-site swaps only.

**Architecture:** `components/server-time.tsx` already exports `<LocalTime date formatStr />` (mount-guarded: renders ST during SSR/first paint, switches to local after mount — the exact pattern already proven in `components/timeline-feed.tsx`) and a bare `formatLocalTime(date, kind)` function for non-JSX string contexts (e.g. an HTML `title` attribute). Every file in this phase either already imports `<ServerTime>`/`formatServerTime` and just needs the import + call site swapped, or is a Server Component rendering `<ServerTime>` as JSX (fine to swap directly — Next.js only requires the "use client" boundary at the component itself, not the importer, same reasoning already validated in this repo for `session-provider.tsx`). Every `SERVER_TIME_LABEL`/literal `" ST"` adjacent to a converted time is removed, since "ST" next to a local time would be misleading.

**Explicitly out of scope for this phase** (separate follow-up plans): `transactions-list.tsx`, `event-attendance-chart.tsx`, `app/dashboard/[slug]/page.tsx` (Phase B — need a new `LocalTimeRange` primitive and/or copy changes), and `components/ffxivvenues-schedule-display.tsx`, `app/dashboard/[slug]/events/page.tsx`, `app/venues/[slug]/page.tsx` + `components/venue-schedule-display.tsx` (Phase C — day-of-week/day-number grouping logic needs a client-side rewrite, not a text-formatter swap, since localizing a time can shift which calendar day it falls on).

**Tech Stack:** Next.js App Router (Server + Client Components), React, TypeScript.

---

## Ground truth (verified against actual source before writing this plan)

- `components/server-time.tsx` already has `LocalTime`, `formatLocalTime`, and re-exports `formatServerTime`/`SERVER_TIME_LABEL` — no new primitives needed for this phase.
- All 8 files below were read directly; snippets in each task are the actual current content, not paraphrased.

---

## Task 1: `app/dashboard/[slug]/analytics/page.tsx`

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/analytics/page.tsx`

**Context:** Client Component (`"use client"` at line 1). Followers-by-month card label.

- [ ] **Step 1: Swap the import**

Find the import of `ServerTime` from `@/components/server-time` near the top of the file and change `ServerTime` to `LocalTime` in that import list (keep any other names on the same line unchanged).

- [ ] **Step 2: Swap the call site**

Change:
```tsx
<StatReadout label={<ServerTime date={`${month}-01`} formatStr="monthyear" />} value={`+${count as number}`} subtext="new followers" />
```
to:
```tsx
<StatReadout label={<LocalTime date={`${month}-01`} formatStr="monthyear" />} value={`+${count as number}`} subtext="new followers" />
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/analytics/page.tsx"
git commit -m "chore: show follower-month label in viewer-local time (local-time phase A)"
```

---

## Task 2: `app/dashboard/[slug]/events/[eventId]/page.tsx`

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/events/[eventId]/page.tsx`

**Context:** Server Component (no `"use client"`). Event detail sidebar "Date & Time" card. `<ServerTime>`/`<LocalTime>` are themselves client components, so swapping the JSX tag works fine from this Server Component.

- [ ] **Step 1: Swap the import**

Find the import of `ServerTime` and `SERVER_TIME_LABEL` from `@/components/server-time` (or wherever they're imported from in this file) and change `ServerTime` to `LocalTime`. Remove `SERVER_TIME_LABEL` from the import if nothing else in the file uses it (grep the file for other `SERVER_TIME_LABEL` occurrences first — per the earlier research pass, both remaining usages in this file are the two being removed in Step 2 below, so it should be safe to drop entirely, but verify before removing the import).

- [ ] **Step 2: Swap the 4 call sites**

Change:
```tsx
<div>
  <p className="text-sm text-muted-foreground">Start</p>
  <p className="font-semibold">
    <ServerTime date={event.startTime} formatStr="datelong" />
  </p>
  <p className="text-sm">
    <ServerTime date={event.startTime} formatStr="time" /> {SERVER_TIME_LABEL}
  </p>
</div>
<div>
  <p className="text-sm text-muted-foreground">End</p>
  <p className="font-semibold">
    <ServerTime date={event.endTime} formatStr="datelong" />
  </p>
  <p className="text-sm">
    <ServerTime date={event.endTime} formatStr="time" /> {SERVER_TIME_LABEL}
  </p>
</div>
```
to:
```tsx
<div>
  <p className="text-sm text-muted-foreground">Start</p>
  <p className="font-semibold">
    <LocalTime date={event.startTime} formatStr="datelong" />
  </p>
  <p className="text-sm">
    <LocalTime date={event.startTime} formatStr="time" />
  </p>
</div>
<div>
  <p className="text-sm text-muted-foreground">End</p>
  <p className="font-semibold">
    <LocalTime date={event.endTime} formatStr="datelong" />
  </p>
  <p className="text-sm">
    <LocalTime date={event.endTime} formatStr="time" />
  </p>
</div>
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/events/[eventId]/page.tsx"
git commit -m "chore: show event start/end time in viewer-local time (local-time phase A)"
```

---

## Task 3: `app/dashboard/[slug]/settings/page.tsx`

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

**Context:** Client Component. "Last synced" line under the ffxivvenues.com integration toggle. Note: the "ST" here is a **literal hardcoded string**, not `SERVER_TIME_LABEL` — confirm with `grep -n "SERVER_TIME_LABEL" apps/web/app/dashboard/\[slug\]/settings/page.tsx` (expected: no matches) before editing, so you don't go looking for an import that isn't there.

- [ ] **Step 1: Swap the import**

Find the import of `ServerTime` from `@/components/server-time` and change it to `LocalTime`.

- [ ] **Step 2: Swap the call site**

Change:
```tsx
Schedule synced every 2 hours.{ffxivVenueSyncedAt && <> Last synced: <ServerTime date={ffxivVenueSyncedAt} /> ST</>}
```
to:
```tsx
Schedule synced every 2 hours.{ffxivVenueSyncedAt && <> Last synced: <LocalTime date={ffxivVenueSyncedAt} /></>}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/settings/page.tsx"
git commit -m "chore: show ffxivvenues last-synced time in viewer-local time (local-time phase A)"
```

---

## Task 4: `components/generate-pot-payroll-button.tsx`

**Files:**
- Modify: `apps/web/components/generate-pot-payroll-button.tsx`

**Context:** Client Component. Pot payroll generation confirmation text on the event detail page.

- [ ] **Step 1: Swap the import**

Change:
```tsx
import { ServerTime, SERVER_TIME_LABEL } from "@/components/server-time"
```
to:
```tsx
import { LocalTime } from "@/components/server-time"
```

- [ ] **Step 2: Swap the call site**

Change:
```tsx
Generated <ServerTime date={existingDistribution.generatedAt} formatStr="datetimelong" /> {SERVER_TIME_LABEL} —{" "}
```
to:
```tsx
Generated <LocalTime date={existingDistribution.generatedAt} formatStr="datetimelong" /> —{" "}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/generate-pot-payroll-button.tsx
git commit -m "chore: show pot payroll generated-at time in viewer-local time (local-time phase A)"
```

---

## Task 5: `components/live-dashboard.tsx`

**Files:**
- Modify: `apps/web/components/live-dashboard.tsx`

**Context:** Client Component. Live event session bar ("Started HH:MM ST") and activity feed item timestamps. Currently imports the bare functions from `@/lib/server-time` (not the JSX component) — both usages are inside plain template-literal-adjacent JSX text, not attribute strings, so they can become `<LocalTime>` JSX instead of staying as bare function calls; that's the more idiomatic fix and matches how other files in this phase do it.

- [ ] **Step 1: Swap the import**

Change:
```tsx
import { formatServerTime, SERVER_TIME_LABEL } from "@/lib/server-time"
```
to:
```tsx
import { LocalTime } from "@/components/server-time"
```

- [ ] **Step 2: Swap the 2 call sites**

Change:
```tsx
Started {formatServerTime(event.startTime, "time")} {SERVER_TIME_LABEL}
```
to:
```tsx
Started <LocalTime date={event.startTime} formatStr="time" />
```

Change:
```tsx
{formatServerTime(item.timestamp, "time")} {SERVER_TIME_LABEL}
```
to:
```tsx
<LocalTime date={item.timestamp} formatStr="time" />
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/live-dashboard.tsx
git commit -m "chore: show live-dashboard event/activity times in viewer-local time (local-time phase A)"
```

---

## Task 6: `components/patron-logs-manager.tsx`

**Files:**
- Modify: `apps/web/components/patron-logs-manager.tsx`

**Context:** Client Component. Event filter dropdown label, log table timestamp column, and a hover tooltip built as an HTML `title` attribute string (must use the bare `formatLocalTime` function here, not JSX, since `title` attributes can't contain React elements).

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
{e.title} ({formatServerTime(e.startTime, "datelong")})
```
to:
```tsx
{e.title} ({formatLocalTime(e.startTime, "datelong")})
```

Change:
```tsx
{formatServerTime(l.timestamp, "datetimelong")} {SERVER_TIME_LABEL}
```
to:
```tsx
{formatLocalTime(l.timestamp, "datetimelong")}
```

Change:
```tsx
title={`Reclassified by ${l.reclassifiedBy?.name ?? "?"} on ${formatServerTime(l.reclassifiedAt, "datetimelong")} ${SERVER_TIME_LABEL}${l.reclassifyReason ? ` - ${l.reclassifyReason}` : ""}`}
```
to:
```tsx
title={`Reclassified by ${l.reclassifiedBy?.name ?? "?"} on ${formatLocalTime(l.reclassifiedAt, "datetimelong")}${l.reclassifyReason ? ` - ${l.reclassifyReason}` : ""}`}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/patron-logs-manager.tsx
git commit -m "chore: show patron-log times in viewer-local time (local-time phase A)"
```

---

## Task 7: `components/ban-list-manager.tsx`

**Files:**
- Modify: `apps/web/components/ban-list-manager.tsx`

**Context:** Client Component. Ban list table "Banned at" column. No `SERVER_TIME_LABEL` used (column has its own header label).

- [ ] **Step 1: Swap the import**

Change:
```tsx
import { formatServerTime } from "@/lib/server-time"
```
to:
```tsx
import { formatLocalTime } from "@/components/server-time"
```

- [ ] **Step 2: Swap the call site**

Change:
```tsx
<td className="hide t-muted">{p.bannedAt ? formatServerTime(p.bannedAt, "datetime") : "—"}</td>
```
to:
```tsx
<td className="hide t-muted">{p.bannedAt ? formatLocalTime(p.bannedAt, "datetime") : "—"}</td>
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ban-list-manager.tsx
git commit -m "chore: show ban-list banned-at time in viewer-local time (local-time phase A)"
```

---

## Task 8: `components/patron-profiles-table.tsx`

**Files:**
- Modify: `apps/web/components/patron-profiles-table.tsx`

**Context:** Client Component. Patron table "Last seen" column. Same pattern as Task 7.

- [ ] **Step 1: Swap the import**

Change:
```tsx
import { formatServerTime } from "@/lib/server-time"
```
to:
```tsx
import { formatLocalTime } from "@/components/server-time"
```

- [ ] **Step 2: Swap the call site**

Change:
```tsx
<td className="hide t-muted">{formatServerTime(p.lastSeen, "datetime")}</td>
```
to:
```tsx
<td className="hide t-muted">{formatLocalTime(p.lastSeen, "datetime")}</td>
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/patron-profiles-table.tsx
git commit -m "chore: show patron last-seen time in viewer-local time (local-time phase A)"
```

---

## Task 9: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck and test suite**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```
Expected: 0 errors, 54/54 tests passing (same baseline as before this plan).

- [ ] **Step 2: Live check every changed surface against the local dev server**

With the local dev server running (`docs/LOCAL_DEV.md`), for each of the 8 changed files, load the real page in a browser and confirm: (a) the time displayed is now in the browser's local time, not ST, (b) no "ST" text remains next to any converted time, (c) no console errors — specifically watch for React hydration-mismatch warnings, since this exact class of bug has hit this codebase before (`components/server-time.tsx`'s mount-guard exists precisely to prevent it, but confirm it's actually working, don't just assume):

- `/dashboard/<venue>/analytics` — a follower-by-month card label (only visible if `followers.byMonth` has data — create a follower via the `/venues/<slug>` follow button first if needed)
- `/dashboard/<venue>/events/<eventId>` — Date & Time card, Start and End rows
- `/dashboard/<venue>/settings` — ffxivvenues.com integration section, "Last synced" line (only visible if a schedule has been synced at least once)
- Event detail page's pot payroll section, if pot mode is enabled and a distribution has been generated — "Generated ... —" line
- `/dashboard/<venue>` live event view (if an event is currently live) — "Started HH:MM" line, and the activity feed items
- `/dashboard/<venue>/patron-logs` — event filter dropdown, log table timestamp column, and hover over the reclassify-history icon (🕐) on a reclassified row to check the tooltip text
- `/dashboard/<venue>/ban-list` — "Banned at" column (log/create a ban first if the list is empty)
- Patron profiles table (wherever `patron-profiles-table.tsx` is rendered — check with `grep -rn "PatronProfilesTable\|patron-profiles-table" apps/web/app` to find the actual page) — "Last seen" column

- [ ] **Step 3: Report completion**

This phase's commits stay local until reviewed — Phase B and Phase C are separate follow-up plans, not part of this one.

---

## Self-review

**Spec coverage:** All 8 files from the mechanical-swap tier of the earlier research pass have a task. `SERVER_TIME_LABEL`/literal `" ST"` removed everywhere it was adjacent to a converted time (Tasks 2, 3, 4, 5, 6). Files requiring structural rewrites (day-grouping logic) are explicitly out of scope and named, not silently dropped. ✅

**Placeholder scan:** Every step shows exact before/after code, sourced directly from reading each file — no paraphrased "update the time display" steps. ✅

**Type consistency:** `LocalTime`/`formatLocalTime` are the two primitive names used throughout, matching their actual exports in `components/server-time.tsx` — no invented function/prop names. ✅
