# Shifts Calendar Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Calendar" view to the Shifts page, alongside the existing week grid, showing each user's own shifts by default and letting managers click any date to see/manage the full day's shifts.

**Architecture:** A new `?view=week|calendar` query param on the existing `ShiftsPage` server component (default `week`, current behavior unchanged). When `view=calendar`, the page fetches a 6-month window of shifts and renders a new client component `ShiftsCalendar` (month grid), which opens a new client component `ShiftDayDialog` when a date is clicked. Both new components share small UTC-safe date helpers and a `CalendarShift` type from a new `apps/web/lib/shift-format.ts`.

**Tech Stack:** Next.js App Router (server component + client components), Prisma, `date-fns` (month grid math only — day-key comparisons stay UTC-manual to match the rest of this page), Radix `Dialog` via existing `@/components/ui/dialog`.

**Testing note:** This project has no component test framework configured (no `vitest`/`jest`/`@testing-library` in `apps/web/package.json`, no existing `.test.tsx` files anywhere). Verification for this plan is manual, via the running dev server in a browser — matching how every other component in this codebase (`create-shift-dialog.tsx`, `events-calendar.tsx`, etc.) was built and verified. Don't introduce a test framework as part of this plan.

---

### Task 1: Shared shift-format helpers and types

**Files:**
- Create: `apps/web/lib/shift-format.ts`

- [ ] **Step 1: Write the helper file**

```typescript
// apps/web/lib/shift-format.ts

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

export const statusBadgeClass: Record<string, string> = {
  SCHEDULED: "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  ACTIVE:    "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  MISSED:    "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
}

export interface CalendarShift {
  id: string
  membershipId: string | null
  roleId: string | null
  payrollEntryId: string | null
  scheduledStart: Date
  scheduledEnd: Date
  status: string
  notes: string | null
  recurrenceRule: string | null
  parentShiftId: string | null
  slotGroupId: string | null
  membership: {
    nickname: string | null
    user: { id: string; name: string | null; image: string | null } | null
  } | null
  role: { name: string } | null
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `shift-format.ts` (unrelated pre-existing errors elsewhere, if any, are not this task's concern)

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/web/lib/shift-format.ts
git commit -m "feat(shifts): add shared date helpers and CalendarShift type for calendar view"
```

---

### Task 2: `ShiftDayDialog` component

**Files:**
- Create: `apps/web/components/shift-day-dialog.tsx`

This dialog is built standalone first (before the calendar that will open it) since the calendar's click handler depends on this component's prop contract.

- [ ] **Step 1: Write the component**

```typescript
// apps/web/components/shift-day-dialog.tsx
"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CreateShiftDialog } from "@/components/create-shift-dialog"
import { ClockShiftButton } from "@/components/clock-shift-button"
import { DeleteShiftButton } from "@/components/delete-shift-button"
import { OpenShiftChip } from "@/components/open-shift-chip"
import { ClaimedShiftChip } from "@/components/claimed-shift-chip"
import { Copy } from "lucide-react"
import { fmtHour, statusBadgeClass, utcDayKey, type CalendarShift } from "@/lib/shift-format"

interface StaffMember {
  id: string
  name: string
  image: string | null
}

interface RoleOption {
  id: string
  name: string
}

interface ShiftDayDialogProps {
  date: Date | null
  onOpenChange: (open: boolean) => void
  shifts: CalendarShift[]
  canManage: boolean
  currentMembershipId: string
  venueSlug: string
  venueId: string
  staffForDialog: StaffMember[]
  roles: RoleOption[]
}

function staffLabel(shift: CalendarShift): string {
  return shift.membership?.nickname ?? shift.membership?.user?.name ?? "Unknown"
}

export function ShiftDayDialog({
  date,
  onOpenChange,
  shifts,
  canManage,
  currentMembershipId,
  venueSlug,
  venueId,
  staffForDialog,
  roles,
}: ShiftDayDialogProps) {
  const open = date !== null
  const dayShifts = date ? shifts.filter((s) => utcDayKey(new Date(s.scheduledStart)) === utcDayKey(date)) : []
  const visibleShifts = canManage
    ? dayShifts
    : dayShifts.filter((s) => s.membershipId === currentMembershipId)

  const dateLabel = date
    ? date.toLocaleString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
    : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dateLabel}</DialogTitle>
          <DialogDescription>
            {canManage ? "All shifts scheduled this day" : "Your shifts this day"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          {visibleShifts.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {canManage ? "No shifts scheduled for this day." : "You have no shifts this day."}
            </div>
          )}

          {visibleShifts.map((shift) => {
            if (shift.status === "OPEN" && date) {
              return (
                <div key={shift.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--blue-008)] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="av-sm flex-shrink-0 border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-400">!</span>
                    <div className="text-sm">
                      <div className="font-medium text-amber-400">Open{shift.role?.name ? ` · ${shift.role.name}` : ""}</div>
                      <div className="text-xs text-muted-foreground">{fmtHour(shift.scheduledStart)}–{fmtHour(shift.scheduledEnd)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <OpenShiftChip
                      shiftId={shift.id}
                      venueId={venueId}
                      timeLabel={`${fmtHour(shift.scheduledStart)}–${fmtHour(shift.scheduledEnd)}`}
                      canClaim={!canManage}
                    />
                    {canManage && (
                      <CreateShiftDialog
                        venueSlug={venueSlug}
                        staff={staffForDialog}
                        roles={roles}
                        trigger={
                          <Button variant="ghost" size="sm" aria-label="Duplicate shift" className="h-6 w-6 p-0">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        }
                        prefill={{
                          mode: "open",
                          roleId: shift.roleId ?? undefined,
                          date: utcDayKey(date),
                          startTime: fmtHour(shift.scheduledStart),
                          endTime: fmtHour(shift.scheduledEnd),
                          notes: shift.notes ?? undefined,
                        }}
                      />
                    )}
                    {canManage && (
                      <DeleteShiftButton
                        venueSlug={venueSlug}
                        shiftId={shift.id}
                        hasPayroll={false}
                        isRecurring={Boolean(shift.recurrenceRule || shift.parentShiftId)}
                        slotGroupId={shift.slotGroupId}
                      />
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div key={shift.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--blue-008)] px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {canManage && (
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarImage src={shift.membership?.user?.image ?? undefined} />
                      <AvatarFallback className="text-[0.62rem] font-bold">
                        {staffLabel(shift).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="min-w-0">
                    {canManage && <div className="text-sm font-medium truncate">{staffLabel(shift)}</div>}
                    <div className="text-xs text-muted-foreground">
                      {fmtHour(shift.scheduledStart)}–{fmtHour(shift.scheduledEnd)}
                      {shift.role?.name ? ` · ${shift.role.name}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge variant="outline" className={statusBadgeClass[shift.status] ?? ""}>
                    {shift.status}
                  </Badge>
                  {shift.status === "CLAIMED" ? (
                    <ClaimedShiftChip
                      shiftId={shift.id}
                      venueId={venueId}
                      timeLabel={`${fmtHour(shift.scheduledStart)}–${fmtHour(shift.scheduledEnd)}`}
                      canManage={canManage}
                    />
                  ) : (
                    <>
                      {(canManage || shift.membershipId === currentMembershipId) && shift.status === "SCHEDULED" && (
                        <ClockShiftButton
                          venueSlug={venueSlug}
                          shiftId={shift.id}
                          action="clock-in"
                          staffName={canManage ? staffLabel(shift) : "yourself"}
                        />
                      )}
                      {(canManage || shift.membershipId === currentMembershipId) && shift.status === "ACTIVE" && (
                        <ClockShiftButton
                          venueSlug={venueSlug}
                          shiftId={shift.id}
                          action="clock-out"
                          staffName={canManage ? staffLabel(shift) : "yourself"}
                        />
                      )}
                      {canManage && (
                        <DeleteShiftButton
                          venueSlug={venueSlug}
                          shiftId={shift.id}
                          hasPayroll={!!shift.payrollEntryId}
                          isRecurring={Boolean(shift.recurrenceRule || shift.parentShiftId)}
                          slotGroupId={shift.slotGroupId}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {canManage && date && (
          <CreateShiftDialog
            venueSlug={venueSlug}
            staff={staffForDialog}
            roles={roles}
            trigger={<Button className="w-full">Add shift</Button>}
            prefill={{ mode: "assign", date: utcDayKey(date) }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `shift-day-dialog.tsx`

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/web/components/shift-day-dialog.tsx
git commit -m "feat(shifts): add ShiftDayDialog for per-day shift view/management"
```

---

### Task 3: `ShiftsCalendar` component

**Files:**
- Create: `apps/web/components/shifts-calendar.tsx`

- [ ] **Step 1: Write the component**

```typescript
// apps/web/components/shifts-calendar.tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { fmtHour, utcDayKey, type CalendarShift } from "@/lib/shift-format"
import { ShiftDayDialog } from "@/components/shift-day-dialog"

interface StaffMember {
  id: string
  name: string
  image: string | null
}

interface RoleOption {
  id: string
  name: string
}

interface ShiftsCalendarProps {
  shifts: CalendarShift[]
  currentMembershipId: string
  canManage: boolean
  venueSlug: string
  venueId: string
  staffForDialog: StaffMember[]
  roles: RoleOption[]
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function utcMonthStart(base: Date): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1))
}

function addUTCMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
}

function daysInUTCMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}

function fmtMonthLabel(d: Date): string {
  return d.toLocaleString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" })
}

export function ShiftsCalendar({
  shifts,
  currentMembershipId,
  canManage,
  venueSlug,
  venueId,
  staffForDialog,
  roles,
}: ShiftsCalendarProps) {
  const [monthCursor, setMonthCursor] = useState(() => utcMonthStart(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const todayKey = utcDayKey(new Date())
  const firstOfMonth = utcMonthStart(monthCursor)
  const leadingBlanks = firstOfMonth.getUTCDay() // 0 = Sunday
  const totalDays = daysInUTCMonth(monthCursor)

  const cells: (Date | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth(), i + 1))),
  ]

  // Own shifts (shown in the cell), grouped by day key.
  const ownByDay = new Map<string, CalendarShift[]>()
  // Whether the venue has ANY shift that day the viewer doesn't personally work —
  // drives the manager-only coverage dot so a day off doesn't look empty to manage.
  const otherCoverageDays = new Set<string>()

  for (const shift of shifts) {
    const key = utcDayKey(new Date(shift.scheduledStart))
    if (shift.membershipId === currentMembershipId) {
      if (!ownByDay.has(key)) ownByDay.set(key, [])
      ownByDay.get(key)!.push(shift)
    } else if (canManage) {
      otherCoverageDays.add(key)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{fmtMonthLabel(monthCursor)}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonthCursor(utcMonthStart(new Date()))}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={() => setMonthCursor(addUTCMonths(monthCursor, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={() => setMonthCursor(addUTCMonths(monthCursor, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {DAY_HEADERS.map((day) => (
          <div key={day} className="text-center font-semibold text-sm text-muted-foreground py-2">
            {day}
          </div>
        ))}

        {cells.map((day, index) => {
          if (!day) return <div key={index} />

          const key = utcDayKey(day)
          const isToday = key === todayKey
          const dayShifts = ownByDay.get(key) ?? []
          const hasOtherCoverage = otherCoverageDays.has(key)

          return (
            <Card
              key={index}
              className={`min-h-[92px] cursor-pointer transition-colors hover:border-[rgba(0,180,255,0.4)] ${isToday ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedDate(day)}
            >
              <CardContent className="p-2 relative">
                {hasOtherCoverage && (
                  <span
                    className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[var(--xiv-blue)]"
                    title="Other staff scheduled this day"
                  />
                )}
                <div className="text-sm font-semibold mb-1">{day.getUTCDate()}</div>
                <div className="space-y-1">
                  {dayShifts.slice(0, 3).map((shift) => (
                    <div
                      key={shift.id}
                      className={`shift-chip${shift.status === "ACTIVE" ? " em" : shift.status === "MISSED" ? " am" : ""}`}
                    >
                      {fmtHour(shift.scheduledStart)}–{fmtHour(shift.scheduledEnd)}
                    </div>
                  ))}
                  {dayShifts.length > 3 && (
                    <div className="text-xs text-muted-foreground">+{dayShifts.length - 3} more</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <ShiftDayDialog
        date={selectedDate}
        onOpenChange={(open) => { if (!open) setSelectedDate(null) }}
        shifts={shifts}
        canManage={canManage}
        currentMembershipId={currentMembershipId}
        venueSlug={venueSlug}
        venueId={venueId}
        staffForDialog={staffForDialog}
        roles={roles}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `shifts-calendar.tsx`

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/web/components/shifts-calendar.tsx
git commit -m "feat(shifts): add ShiftsCalendar month view with own-shift cells"
```

---

### Task 4: Wire the calendar tab into the Shifts page

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx`

- [ ] **Step 1: Add the `view` search param and calendar data fetch**

In `apps/web/app/dashboard/[slug]/shifts/page.tsx`, change the function signature (around line 74-80) from:

```typescript
export default async function ShiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ w?: string }>
}) {
```

to:

```typescript
export default async function ShiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ w?: string; view?: string }>
}) {
```

And the destructure a few lines below:

```typescript
  const { w } = await searchParams
```

becomes:

```typescript
  const { w, view = "week" } = await searchParams
```

- [ ] **Step 2: Add the calendar-window shift fetch**

Immediately after the existing `weekShifts`/`activeShifts` `Promise.all` block (after line 135, `])`), add:

```typescript
  // Calendar view only: 6-month rolling window (3 back, 3 forward), independent
  // of the week grid's ?w= offset. Only fetched when actually viewing the
  // calendar tab, to avoid pulling months of shift history on every page load.
  const calendarShifts = view === "calendar"
    ? await prisma.shift.findMany({
        where: {
          venueId: venue.id,
          scheduledStart: {
            gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 3, 1)),
            lt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 4, 1)),
          },
        },
        include: {
          membership: { include: { user: { select: { id: true, name: true, image: true } } } },
          role: { select: { name: true } },
        },
        orderBy: { scheduledStart: "asc" },
      })
    : []
```

- [ ] **Step 3: Add the pill-tab switcher**

Find the "Week nav toolbar" block (starting `{/* Week nav toolbar */}` around line 263). Immediately before it, add the tab switcher:

```typescript
        {/* View Tabs */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1">
            {([
              { key: "week", label: "Week" },
              { key: "calendar", label: "Calendar" },
            ] as const).map(({ key, label }) => (
              <Link
                key={key}
                href={`/dashboard/${slug}/shifts?view=${key}`}
                className={`text-sm font-semibold px-3 sm:px-4 py-1.5 rounded-full transition-colors ${
                  view === key
                    ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
```

- [ ] **Step 4: Branch the week toolbar/grid/actions vs. the calendar**

Wrap the existing "Week nav toolbar", "Weekly grid", and "Actions section" blocks (from `{/* Week nav toolbar */}` through the end of the actions-section `{actionShifts.length > 0 && (...)}` block, i.e. everything from line 263 through line 498 in the original file) in a `view === "week"` conditional, and add the calendar branch as a sibling. Concretely, change:

```typescript
        {/* Week nav toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
```

to:

```typescript
        {view === "week" ? (
        <>
        {/* Week nav toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
```

and change the closing of the actions-section block from:

```typescript
        {actionShifts.length > 0 && (
          <div>
            {/* ... existing content ... */}
          </div>
        )}
      </div>
    </VenueLayout>
  )
}
```

to:

```typescript
        {actionShifts.length > 0 && (
          <div>
            {/* ... existing content ... */}
          </div>
        )}
        </>
        ) : (
          <ShiftsCalendar
            shifts={calendarShifts}
            currentMembershipId={currentMembershipId}
            canManage={canManage}
            venueSlug={slug}
            venueId={venue.id}
            staffForDialog={staffForDialog}
            roles={venueRoles}
          />
        )}
      </div>
    </VenueLayout>
  )
}
```

Everything between those two edits (week toolbar, weekly grid, actions section) is unchanged — only the wrapping fragment and the new calendar branch are added.

- [ ] **Step 5: Add the import**

At the top of the file, alongside the other component imports (near line 12-13):

```typescript
import { ShiftsCalendar } from "@/components/shifts-calendar"
```

- [ ] **Step 6: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `shifts/page.tsx`

- [ ] **Step 7: Commit**

```bash
cd ~/xiv-app
git add apps/web/app/dashboard/[slug]/shifts/page.tsx
git commit -m "feat(shifts): wire Calendar tab into Shifts page"
```

---

### Task 5: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `cd apps/web && pnpm dev`
Expected: server starts on the configured port without errors

- [ ] **Step 2: Verify the Week tab is unchanged**

Navigate to `/dashboard/<slug>/shifts` (defaults to `?view=week`). Confirm the page looks and behaves exactly as before this plan — KPIs, week nav, staff grid, actions section all present.

- [ ] **Step 3: Verify the Calendar tab as a manager/owner**

Click the "Calendar" tab. Confirm:
- Month grid renders with today highlighted
- Prev/next/Today navigation works
- Cells show only your own shifts (if any this month)
- Days where other staff are scheduled (but not you) show the small blue coverage dot
- Clicking any date opens the dialog showing that day's full shift list with staff avatars, status badges, clock-in/out, delete, and duplicate controls
- Clicking an empty date shows "No shifts scheduled for this day" and an "Add shift" button that opens `CreateShiftDialog` prefilled to that date
- Creating a shift from that dialog and refreshing shows it in the correct calendar cell

- [ ] **Step 4: Verify the Calendar tab as regular staff**

Log in as (or temporarily test with) a non-manager account. Confirm:
- Cells show only that user's own shifts, no coverage dots
- Clicking a date with one of their shifts shows a read-only row (no delete/duplicate buttons) with a working clock-in/out button where applicable
- Clicking a date with no shifts of their own shows "You have no shifts this day." even if other staff are working that day

- [ ] **Step 5: Check the browser console**

Confirm no errors or warnings logged while navigating between tabs, months, and opening/closing the dialog.
