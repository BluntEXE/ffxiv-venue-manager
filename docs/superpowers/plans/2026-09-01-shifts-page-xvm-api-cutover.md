# Shifts Page xvm-api Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish cutting `dashboard/[slug]/shifts` over from Prisma to xvm-api so the page's read side (initial render) and write side (claim/approve/reject/clock/cancel/create, already cut over in `app/api/venues/[venueId]/shifts/*`) agree on the same id space and data store.

**Architecture:** The API routes (`shifts/route.ts`, `shifts/[shiftId]/route.ts`) already call xvm-api and are verified working (typecheck/lint/test clean). This plan rewrites everything upstream of them: the page's server-side data fetch, the shared shift-shape types, and every client component that consumes those types or calls the routes with a Prisma-shaped id. One-off shifts only — xvm-api has no recurrence/pattern endpoints yet (`recurrence_rule_id` is schema-only), so recurring-shift creation, `cancel-series`, and `cancel-group` are explicitly out of scope and their UI gets removed, not adapted.

**Tech Stack:** Next.js 15 App Router (server components + client components), xvm-api FastAPI backend, existing `lib/api/xvm-api.ts` client (shift functions already added), Zod.

---

## Context for the engineer

- xvm-api's shift ids, membership ids, and position ids are all plain integers. Prisma's are cuid strings. Every prop/type currently typed `string` for these needs to become `number`.
- xvm-api's `MembershipPerson` is `{ id: number, display_name: string }` only — no FFXIV character name, no nickname layering. The current `resolveDisplayName` chain (character name → nickname → Discord display name → Discord username) can't be reproduced from xvm-api data alone. This plan ships with `display_name` only (a real, accepted regression, not a placeholder) via a single swappable function (`staffNameOf` in Task 2), so restoring character names later is a one-file change once xvm-api exposes `external_id` on `MembershipPerson` (a separate, already-filed ask — see the migration-status artifact).
- xvm-api's shift status vocabulary is richer than Prisma's: `open | pending_approval | scheduled | active | completed | cancelled | missed | unfilled`. The already-shipped API routes map this to `OPEN | CLAIMED | SCHEDULED | ACTIVE | COMPLETED | CANCELLED | MISSED | UNFILLED` (renaming `pending_approval`→`CLAIMED` to match the existing UI vocabulary, and adding `UNFILLED` as a new value with no Prisma precedent — an open slot whose window passed with nobody claiming it). This plan's components need a `UNFILLED` visual treatment; treat it like `MISSED` styling (amber, "unfilled" label) since nothing existing covers it.
- `requireXvmVenueId` in both already-shipped routes accepts slug-or-id (`OR: [{id},{slug}]`) — several components below call the API with `venueSlug`, not `venue.id`. Don't change that call convention when touching these files.
- Two Prisma domains stay untouched here: pot-payroll `events` (Events cutover is separate, still Prisma) and `venuePotSettings` (Financial domain, no xvm-api router at all yet). Both are read-only id/name lists for dropdowns in `CreateShiftDialog` — leave those two queries in `page.tsx` exactly as they are.
- `canManage`/`currentMembershipId` on the page currently come from `venue.memberships[0]` (Prisma). This plan switches that specific lookup to xvm-api's `listMemberships` (already exists, no gap) so `currentMembershipId` is an xvm-api integer id matching `ShiftRow.membership_id` — using a Prisma-derived id here would silently reintroduce the exact id-mismatch bug this whole cutover fixes.

## File Structure

- Modify: `apps/web/lib/api/xvm-api.ts` — add `listMembershipsAndPositionsBridge` helper (Task 1)
- Modify: `apps/web/lib/shift-format.ts` — replace Prisma-typed `ShiftRow`/`CalendarShift`/`staffNameOf` with xvm-api-shaped equivalents (Task 2)
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx` — swap Prisma shift/staff/role queries for xvm-api calls (Task 3)
- Modify: `apps/web/components/shifts-week-view.tsx` — id types, status vocab, `staffNameOf` call sites (Task 4)
- Modify: `apps/web/components/shifts-calendar.tsx` — id types (Task 5)
- Modify: `apps/web/components/shift-day-dialog.tsx` — id types, status vocab (Task 6)
- Modify: `apps/web/components/claimed-shift-chip.tsx`, `open-shift-chip.tsx`, `clock-shift-button.tsx`, `delete-shift-button.tsx` — `shiftId: string` → `number` (Task 7)
- Modify: `apps/web/components/create-shift-dialog.tsx` — id types, remove repeating-shift UI (Task 8)

---

### Task 1: Bridge helper for staff/role display data

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts`

- [ ] **Step 1: Add the bridge function**

Add this after `listMemberships` (around line 644, right before the `// ── Tasks API` comment):

```typescript
export interface ShiftStaffOption {
  id: number
  name: string
  image: string | null
}

export interface ShiftRoleOption {
  id: number
  name: string
}

// Bridges the two lists CreateShiftDialog/page.tsx need for its staff/role
// pickers into the shape those components already expect. Character-name
// resolution is intentionally not attempted here - MembershipPerson only
// carries display_name, see shift-format.ts's staffNameOf for the same
// constraint on the read side.
export async function listShiftStaffAndRoles(
  personToken: string,
  venueId: string
): Promise<{ staff: ShiftStaffOption[]; roles: ShiftRoleOption[] }> {
  const [memberships, positions] = await Promise.all([
    listMemberships(personToken, venueId),
    listPositions(personToken, venueId),
  ])
  return {
    staff: memberships
      .filter((m) => m.is_employed)
      .map((m) => ({ id: m.person.id, name: m.person.display_name, image: null })),
    roles: positions.map((p) => ({ id: p.id, name: p.name })),
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts
git commit -m "feat(shifts): add staff/role bridge for the create-shift dialog"
```

---

### Task 2: Rewrite `shift-format.ts` off Prisma types

**Files:**
- Modify: `apps/web/lib/shift-format.ts`

The current file imports `Prisma` and defines `ShiftRow`/`CalendarShift` as `Prisma.ShiftGetPayload`-derived types with a nested `membership.user.characters` shape. Replace with xvm-api-shaped equivalents.

- [ ] **Step 1: Replace the type definitions and `staffNameOf`**

Replace lines 1-129 (the whole file) with:

```typescript
// apps/web/lib/shift-format.ts

import { localDayKey, localHourLabel } from "./local-day"
import type { ShiftRow as ApiShiftRow, ShiftApiStatus } from "./api/xvm-api"

// FFXIV server time = UTC (see apps/web/app/dashboard/[slug]/shifts/page.tsx).
// These mirror that page's private utcDayKey/fmtHour helpers so the calendar
// and day-detail dialog group/label shifts identically to the week grid,
// regardless of the viewer's browser timezone.

/** "2026-07-31" in UTC, used as a day-bucket key. */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** "10PM" or "10:30PM", read in UTC. */
export function fmtHour(iso: string | Date): string {
  const d = new Date(iso)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
}

/** Local-timezone day key, or the UTC one if `mounted` is false (SSR/first paint). */
export function dayKeyFor(d: Date | string, timeZone: string | null): string {
  return timeZone ? localDayKey(d, timeZone) : utcDayKey(new Date(d))
}

/** Local-timezone hour label, or the UTC one if `mounted` is false (SSR/first paint). */
export function hourLabelFor(d: Date | string, timeZone: string | null): string {
  return timeZone ? localHourLabel(d, timeZone) : fmtHour(d)
}

export type ShiftUiStatus =
  | "OPEN"
  | "CLAIMED"
  | "SCHEDULED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "MISSED"
  | "UNFILLED"

export const SHIFT_STATUS_SHAPE: Record<ShiftApiStatus, ShiftUiStatus> = {
  open: "OPEN",
  pending_approval: "CLAIMED",
  scheduled: "SCHEDULED",
  active: "ACTIVE",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  missed: "MISSED",
  unfilled: "UNFILLED",
}

export const statusBadgeClass: Record<string, string> = {
  SCHEDULED: "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  MISSED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  UNFILLED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
}

// One membership/name lookup, built once per page render and threaded through
// props, so every row can resolve a name without its own network call.
export type StaffNameLookup = Map<number, string>

export interface ShiftRow {
  id: number
  membershipId: number | null
  roleId: number | null
  roleName: string | null
  payrollEntryId: number | null
  scheduledStart: string
  scheduledEnd: string
  status: ShiftUiStatus
  notes: string | null
}

export interface CalendarShift extends ShiftRow {}

export function toShiftRow(shift: ApiShiftRow, roleName: string | null): ShiftRow {
  return {
    id: shift.id,
    membershipId: shift.membership_id,
    roleId: shift.position_id,
    roleName,
    payrollEntryId: shift.payroll_entry_id,
    scheduledStart: shift.scheduled_start ?? shift.actual_start ?? new Date().toISOString(),
    scheduledEnd: shift.scheduled_end ?? shift.actual_end ?? new Date().toISOString(),
    status: SHIFT_STATUS_SHAPE[shift.status],
    notes: shift.notes,
  }
}

// xvm-api's MembershipPerson only carries display_name - no FFXIV character
// name, no nickname layering like the old Prisma resolveDisplayName chain
// had. Ships with the Discord display name only; swap this one function once
// xvm-api exposes external_id on MembershipPerson and a character-name bridge
// exists (see docs/superpowers/plans/2026-09-01-xvm-migration-status for the
// tracked ask).
export function staffNameOf(membershipId: number | null, names: StaffNameLookup): string {
  if (membershipId === null) return "Unassigned"
  return names.get(membershipId) ?? "Unknown"
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`
Expected: errors in every file that still imports the old shape (`page.tsx`, `shifts-week-view.tsx`, `shifts-calendar.tsx`, `shift-day-dialog.tsx`) - expected at this point, fixed in Tasks 3-6.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/shift-format.ts
git commit -m "refactor(shifts): move shift-format types off Prisma onto xvm-api's shape"
```

---

### Task 3: Rewrite `page.tsx`'s data fetch

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx`

- [ ] **Step 1: Replace imports and add the xvm-api gate**

Replace lines 1-11 with:

```typescript
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { CreateShiftDialog } from "@/components/create-shift-dialog"
import { ShiftsCalendar } from "@/components/shifts-calendar"
import { ShiftsWeekView } from "@/components/shifts-week-view"
import { getValidXvmApiToken } from "@/lib/api/xvm-api-store"
import { listShifts, listShiftStaffAndRoles, listMemberships, listPositions } from "@/lib/api/xvm-api"
import { toShiftRow, type ShiftRow, type StaffNameLookup } from "@/lib/shift-format"
```

- [ ] **Step 2: Swap the venue lookup to include `xvmApiVenueId` and gate on it**

Replace lines 55-66 (the `prisma.venue.findUnique` block through `const canManage = ...`):

```typescript
  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()
  if (!venue.xvmApiVenueId) {
    return (
      <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={venue.memberships[0].role}>
        <div className="page-inner">
          <h1 className="page-h1">Shifts</h1>
          <p className="text-muted-foreground mt-4">
            This venue hasn&apos;t been connected to xvm-api yet - shifts aren&apos;t available until it is.
          </p>
        </div>
      </VenueLayout>
    )
  }

  const xvmApiVenueId = venue.xvmApiVenueId
  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    redirect("/auth/signin")
  }

  const [memberships, positions] = await Promise.all([
    listMemberships(token, xvmApiVenueId),
    listPositions(token, xvmApiVenueId),
  ])
  const currentMembership = memberships.find((m) => m.person.display_name === session.user.name) ?? null
  // NOTE: matching by display_name is a stopgap - xvm-api's /me endpoint
  // returns the caller's own memberships directly and should be used here
  // instead once this page is wired to it (out of scope for this plan, which
  // only covers the shift data itself). Flag this line in review.
  const userRole = currentMembership?.effective_tier === "owner" ? "OWNER" : currentMembership?.effective_tier === "manager" ? "MANAGER" : "STAFF"
  const currentMembershipId = currentMembership?.id ?? -1
  const canManage = userRole === "OWNER" || userRole === "MANAGER"
  const roleNameById = new Map(positions.map((p) => [p.id, p.name]))
  const staffNames: StaffNameLookup = new Map(memberships.map((m) => [m.id, m.person.display_name]))
```

- [ ] **Step 3: Replace the shift queries**

Replace lines 88-155 (from `// Fetch shifts for this week...` through the end of `calendarShifts`):

```typescript
  // Fetch shifts for this week + count of active shifts (may have started before this week)
  const [weekShiftsRaw, nowShifts] = await Promise.all([
    listShifts(token, xvmApiVenueId, {
      from: fetchWindowStart.toISOString(),
      to: fetchWindowEnd.toISOString(),
      includeCancelled: true,
    }),
    listShifts(token, xvmApiVenueId, {
      from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      to: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  ])
  const weekShifts: ShiftRow[] = weekShiftsRaw.map((s) => toShiftRow(s, s.position_id ? roleNameById.get(s.position_id) ?? null : null))
  const activeCount = nowShifts.filter((s) => s.status === "active").length

  // Calendar view only: 6-month rolling window (3 back, 3 forward), independent
  // of the week grid's ?w= offset. Only fetched when actually viewing the
  // calendar tab, to avoid pulling months of shift history on every page load.
  const calendarShifts: ShiftRow[] =
    view === "calendar"
      ? (
          await listShifts(token, xvmApiVenueId, {
            from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString(),
            to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 1)).toISOString(),
            includeCancelled: true,
          })
        ).map((s) => toShiftRow(s, s.position_id ? roleNameById.get(s.position_id) ?? null : null))
      : []
```

- [ ] **Step 4: Replace the staff/role dialog lists**

Replace lines 157-191 (`// Staff list for create dialog` through `const venueRoles = ...`):

```typescript
  const { staff: staffForDialog, roles: venueRoles } = await listShiftStaffAndRoles(token, xvmApiVenueId)
```

- [ ] **Step 5: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`
Expected: remaining errors only in `shifts-week-view.tsx`, `shifts-calendar.tsx` (fixed in Tasks 4-5) - no errors reported against `page.tsx` itself.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/[slug]/shifts/page.tsx
git commit -m "feat(shifts): cut the shifts page's data fetch over to xvm-api"
```

---

### Task 4: Update `shifts-week-view.tsx`

**Files:**
- Modify: `apps/web/components/shifts-week-view.tsx`

- [ ] **Step 1: Update imports and prop types**

Replace line 15 (`import { staffNameOf, type ShiftRow } from "@/lib/shift-format"`) with:

```typescript
import { staffNameOf, type ShiftRow, type StaffNameLookup } from "@/lib/shift-format"
```

Replace the `interface StaffOption`/`RoleOption`/`EventOption` block (lines 32-46) with:

```typescript
interface StaffOption {
  id: number
  name: string
  image: string | null
}

interface RoleOption {
  id: number
  name: string
}

interface EventOption {
  id: string
  name: string
}
```

Add `UNFILLED` to the `statusBadge` map (line 48-54):

```typescript
const statusBadge: Record<string, string> = {
  SCHEDULED: "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  MISSED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  UNFILLED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
}
```

In `ShiftsWeekViewProps` (lines 56-71), change:
```typescript
  currentMembershipId: string
```
to:
```typescript
  currentMembershipId: number
  staffNames: StaffNameLookup
```

- [ ] **Step 2: Update the `duplicateShiftDialog` prefill's membershipId/roleId types**

Line 91, change:
```typescript
    modeField: { mode: "assign"; membershipId: string | undefined } | { mode: "open"; roleId: string | undefined }
```
to:
```typescript
    modeField: { mode: "assign"; membershipId: number | undefined } | { mode: "open"; roleId: number | undefined }
```

- [ ] **Step 3: Update `staffMap` keying (was string membershipId, now number) and `staffNameOf` calls**

Replace lines 135-158 (the `staffMap` build):

```typescript
  const staffMap = new Map<
    number,
    {
      membershipId: number
      name: string
      cells: Map<string, ShiftRow[]>
    }
  >()
  for (const shift of props.weekShifts) {
    if (!shift.membershipId) continue
    const key = dayKeyOf(shift.scheduledStart)
    if (!weekDayKeys.includes(key)) continue
    const mid = shift.membershipId
    if (!staffMap.has(mid)) {
      staffMap.set(mid, {
        membershipId: mid,
        name: staffNameOf(mid, props.staffNames),
        cells: new Map(),
      })
    }
    const member = staffMap.get(mid)!
    if (!member.cells.has(key)) member.cells.set(key, [])
    member.cells.get(key)!.push(shift)
  }
  const staffRows = [...staffMap.values()]
```

Replace every remaining `shift.role?.name` with `shift.roleName` (lines 318, 327, 360 - three occurrences, all `${shift.role?.name ? \` · ${shift.role.name}\` : ""}` → `${shift.roleName ? \` · ${shift.roleName}\` : ""}`).

Replace every remaining `staffNameOf(shift.membership)` (lines 414, 418, 432, 440) with `staffNameOf(shift.membershipId, props.staffNames)`.

Replace `shift.membership?.user?.image ?? undefined` (line 412) with `undefined` (no image data from xvm-api - the `AvatarFallback` initials still render).

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors in this file.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/shifts-week-view.tsx
git commit -m "refactor(shifts): update ShiftsWeekView for xvm-api-shaped shift rows"
```

---

### Task 5: Update `shifts-calendar.tsx`

**Files:**
- Modify: `apps/web/components/shifts-calendar.tsx`

- [ ] **Step 1: Update imports and prop types**

Replace line 8:
```typescript
import { dayKeyFor, hourLabelFor, type CalendarShift, type StaffMember, type RoleOption } from "@/lib/shift-format"
```
with:
```typescript
import { dayKeyFor, hourLabelFor, type CalendarShift, type StaffNameLookup } from "@/lib/shift-format"
import type { ShiftStaffOption, ShiftRoleOption } from "@/lib/api/xvm-api"
```

Replace `ShiftsCalendarProps` (lines 13-22):
```typescript
interface ShiftsCalendarProps {
  shifts: CalendarShift[]
  currentMembershipId: number
  canManage: boolean
  venueSlug: string
  venueId: string
  staffForDialog: ShiftStaffOption[]
  roles: ShiftRoleOption[]
  staffNames: StaffNameLookup
  todayKeyST: string
}
```

Update the destructured props in the function signature (lines 42-51) to add `staffNames`, matching the interface.

- [ ] **Step 2: Thread `staffNames` through to `ShiftDayDialog`**

In the `<ShiftDayDialog .../>` call (lines 167-179), add `staffNames={staffNames}` alongside the existing props.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`
Expected: errors remaining only in `shift-day-dialog.tsx` (fixed in Task 6).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/shifts-calendar.tsx
git commit -m "refactor(shifts): update ShiftsCalendar prop types for xvm-api ids"
```

---

### Task 6: Update `shift-day-dialog.tsx`

**Files:**
- Modify: `apps/web/components/shift-day-dialog.tsx`

- [ ] **Step 1: Update imports and prop types**

Replace lines 14-24:
```typescript
import {
  dayKeyFor,
  hourLabelFor,
  statusBadgeClass,
  staffNameOf,
  type CalendarShift,
  type StaffNameLookup,
} from "@/lib/shift-format"
import { browserTimeZone, localTimeInput } from "@/lib/local-day"
import { useMounted } from "@/lib/use-mounted"
import type { ShiftStaffOption, ShiftRoleOption } from "@/lib/api/xvm-api"
```

Replace `ShiftDayDialogProps` (lines 26-36):
```typescript
interface ShiftDayDialogProps {
  date: Date | null
  onOpenChange: (open: boolean) => void
  shifts: CalendarShift[]
  canManage: boolean
  currentMembershipId: number
  venueSlug: string
  venueId: string
  staffForDialog: ShiftStaffOption[]
  roles: ShiftRoleOption[]
  staffNames: StaffNameLookup
}
```

Add `staffNames` to the destructured function params (lines 38-48).

- [ ] **Step 2: Update `roleId`/`staffNameOf` call sites**

Line 90 and 160, replace `shift.role?.name` with `shift.roleName`.

Line 116, replace `roleId: shift.roleId ?? undefined` — no change needed (already correct once `shift.roleId` is `number | null`).

Lines 152, 157, 182, 190: replace every `staffNameOf(shift.membership)` with `staffNameOf(shift.membershipId, staffNames)`.

Line 150: replace `shift.membership?.user?.image ?? undefined` with `undefined`.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors in this file.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/shift-day-dialog.tsx
git commit -m "refactor(shifts): update ShiftDayDialog for xvm-api-shaped shift rows"
```

---

### Task 7: Update the four small action components

**Files:**
- Modify: `apps/web/components/claimed-shift-chip.tsx`
- Modify: `apps/web/components/open-shift-chip.tsx`
- Modify: `apps/web/components/clock-shift-button.tsx`
- Modify: `apps/web/components/delete-shift-button.tsx`

These four only need `shiftId: string` → `shiftId: number` in their prop interfaces - the fetch URLs already interpolate `${shiftId}` and work identically with a number. `venueSlug`/`venueId` stay `string` (already-shipped routes accept slug-or-id, per the Context section above).

- [ ] **Step 1: `claimed-shift-chip.tsx`**

Line 7, change `shiftId: string` to `shiftId: number`.

- [ ] **Step 2: `open-shift-chip.tsx`**

Line 7, change `shiftId: string` to `shiftId: number`.

- [ ] **Step 3: `clock-shift-button.tsx`**

Line 20, change `shiftId: string` to `shiftId: number`.

- [ ] **Step 4: `delete-shift-button.tsx`**

Line 21, change `shiftId: string` to `shiftId: number`. Leave `isRecurring`/`slotGroupId`/`cancelVia` as-is (dead code paths post-cutover since nothing produces `isRecurring: true` anymore, but harmless to leave - see Task 8's removal of the toggle that used to set it).

- [ ] **Step 5: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`
Expected: errors remaining only in `create-shift-dialog.tsx` (fixed in Task 8) and any remaining call sites passing string ids into these props from `shifts-week-view.tsx`/`shift-day-dialog.tsx` (already fixed in Tasks 4/6 - if errors persist here, it means a `shift.id` passed to one of these four components wasn't picked up; grep for `shiftId={shift.id}` across the four consuming files and confirm `shift` is typed as the new `ShiftRow`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/claimed-shift-chip.tsx apps/web/components/open-shift-chip.tsx apps/web/components/clock-shift-button.tsx apps/web/components/delete-shift-button.tsx
git commit -m "refactor(shifts): shiftId props are numbers, matching xvm-api ids"
```

---

### Task 8: Update `create-shift-dialog.tsx` — id types, remove recurrence UI

**Files:**
- Modify: `apps/web/components/create-shift-dialog.tsx`

- [ ] **Step 1: Update prop/state types**

Replace lines 19-44 (`interface StaffMember` through `interface ShiftPrefill`):

```typescript
interface StaffMember {
  id: number
  name: string
  image: string | null
}

interface RoleOption {
  id: number
  name: string
}

interface EventOption {
  id: string
  name: string
}

interface ShiftPrefill {
  mode?: "assign" | "open"
  membershipId?: number
  roleId?: number
  date?: string
  startTime?: string
  endTime?: string
  notes?: string
  eventId?: string
}
```

Replace line 71-72:
```typescript
  const [membershipId, setMembershipId] = useState<number | undefined>(prefill?.membershipId)
  const [roleId, setRoleId] = useState<number | undefined>(prefill?.roleId)
```

Remove lines 78-80 (`quantity`/`repeating`/`recurrenceRule` state) entirely.

- [ ] **Step 2: Update the Select components to work with numeric values**

shadcn's `Select` works on string `value`s. Each `<Select value={membershipId} ...>`/`<Select value={roleId} ...>` needs its value/onChange converted:

Replace line 198 (`<Select value={membershipId} onValueChange={setMembershipId}>`):
```typescript
                <Select value={membershipId?.toString() ?? ""} onValueChange={(v) => setMembershipId(v ? Number(v) : undefined)}>
```
Line 204 (`<SelectItem key={s.id} value={s.id}>`):
```typescript
                      <SelectItem key={s.id} value={s.id.toString()}>
```

Apply the identical pattern (stringify on read, `Number(v)` on write) to the three other role `<Select>` blocks at lines 214, 220, 241, 247 (all use `roleId`/`r.id` the same way).

- [ ] **Step 3: Remove the quantity/repeating UI block**

Delete the entire block from `{mode === "open" && (` (line 286) through its closing `)}` (line 304) — the "How many open slots?" input, since it existed only to pair with recurring-slot creation quantity, and one-off open shifts still need exactly 1.

Delete the entire "Repeating Shift" card block from `<div className="space-y-3 p-4 border ...">` (line 306) through its closing `</div>` (line 347).

- [ ] **Step 4: Simplify `handleSubmit` to a single one-off create**

Replace the body of `handleSubmit` (lines 82-158) with:

```typescript
  async function handleSubmit() {
    if (mode === "assign" && !membershipId) {
      setError("Please select a staff member")
      return
    }
    if (mode === "open" && !roleId) {
      setError("Please select a role")
      return
    }
    if (!date || !startTime || !endTime) {
      setError("Please fill in all required fields")
      return
    }

    const scheduledStartDate = new Date(`${date}T${startTime}:00`)
    let scheduledEndDate = new Date(`${date}T${endTime}:00`)

    if (scheduledEndDate.getTime() === scheduledStartDate.getTime()) {
      setError("End time must be after start time")
      return
    }
    if (scheduledEndDate < scheduledStartDate) {
      scheduledEndDate = new Date(scheduledEndDate.getTime() + 86400000)
    }

    const scheduledStart = scheduledStartDate.toISOString()
    const scheduledEnd = scheduledEndDate.toISOString()

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/venues/${venueSlug}/shifts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(mode === "assign" ? { membershipId, ...(roleId ? { roleId } : {}) } : { roleId }),
          scheduledStart,
          scheduledEnd,
          notes: notes || undefined,
          ...(eventId ? { eventId } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to create shift")
        return
      }

      setMode(prefill?.mode ?? "assign")
      setMembershipId(prefill?.membershipId)
      setRoleId(prefill?.roleId)
      setDate(prefill?.date ?? "")
      setStartTime(prefill?.startTime ?? "19:00")
      setEndTime(prefill?.endTime ?? "23:00")
      setNotes(prefill?.notes ?? "")
      setEventId(prefill?.eventId ?? "")
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError("Network error")
    } finally {
      setSubmitting(false)
    }
  }
```

- [ ] **Step 5: Fix the submit button label**

Replace lines 384-390 (the submit `<Button>`):
```typescript
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating..." : "Create Shift"}
          </Button>
```

- [ ] **Step 6: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`
Expected: clean, no errors anywhere in the shifts feature.

- [ ] **Step 7: Lint**

Run: `cd apps/web && pnpm lint`
Expected: 0 errors, same pre-existing warning count as before this plan (147, per the route-layer PR's baseline).

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/create-shift-dialog.tsx
git commit -m "refactor(shifts): numeric ids in create dialog, remove recurring-shift UI"
```

---

### Task 9: Live verification

**Files:** none (manual/browser verification)

xvm-api has no recurrence endpoints, so this whole plan is a pure UI/data-layer swap - typecheck passing doesn't prove the actual claim/approve/clock/create flows work end to end against a real connected venue. This step is not optional.

- [ ] **Step 1: Start the dev stack**

Follow `docs/LOCAL_DEV.md` to bring up xvm-api-dev and the dashboard's dev server against a venue with `xvmApiVenueId` set.

- [ ] **Step 2: Walk the full lifecycle manually**

As a manager: create an open shift, create an assigned shift, confirm both appear on the week view and the calendar view. As a staff member (or a second test membership): claim the open shift, confirm it shows `CLAIMED`. As the manager: approve the claim, confirm it flips to `SCHEDULED`. Clock in, confirm `ACTIVE`. Clock out, confirm `COMPLETED`. Delete a shift, confirm it cancels (not a 404, not a hard-delete visible as an error).

- [ ] **Step 3: Check the degraded name display is acceptable**

Confirm staff names render as their xvm-api `display_name` (Discord name) rather than crashing or showing "Unknown" for real members - "Unknown" only for a membership id genuinely not in the roster.

- [ ] **Step 4: Note anything that doesn't match this plan's assumptions**

The `currentMembership` lookup in Task 3 Step 2 matches by `display_name === session.user.name`, flagged in that step as a stopgap. If this doesn't reliably find the right membership in testing (e.g., a mismatch between Discord's display name and NextAuth's `session.user.name`), that's expected - it needs xvm-api's `/me` endpoint wired in as a follow-up, not a blocker for this plan's other verification.

---

## Explicitly out of scope for this plan

- Recurring shift creation/editing, `cancel-series`, `cancel-group` — blocked on xvm-api building pattern/series endpoints (schema-only right now).
- Character-name resolution (FFXIV name instead of Discord name) — blocked on xvm-api exposing `external_id` on `MembershipPerson`.
- In-app notifications and Discord webhooks for claim/approve/reject — same `external_id` blocker, dropped entirely per the "we can't use Prisma" decision rather than bridged.
- `currentMembership`/`canManage` derivation via xvm-api's `/me` endpoint instead of the display_name-matching stopgap in Task 3.
- Payroll/pot-payroll integration with shifts — Financial domain has no xvm-api router at all yet.
