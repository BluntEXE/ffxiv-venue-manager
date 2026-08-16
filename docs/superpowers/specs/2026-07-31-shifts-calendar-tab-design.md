# Shifts Calendar Tab — Design

## Problem

The Shifts page (`apps/web/app/dashboard/[slug]/shifts/page.tsx`) only offers a single-week
staff × day grid. There's no month-level view, and no quick way for a manager to jump to a
specific date and see/manage everything scheduled that day without scrolling week by week.

## Existing pattern to reuse

The Events page already ships the exact tab shape this design copies:

- `?view=list|past|drafts|calendar` query param, default `list`
- Pill-tab switcher (`apps/web/app/dashboard/[slug]/events/page.tsx:121-145`) — `Link`s that
  swap the query param, active tab styled with the XIV-blue pill
- `EventsCalendar` (`apps/web/components/events-calendar.tsx`) — client component, month grid
  via `date-fns` (`startOfMonth`/`endOfMonth`/`eachDayOfInterval`), client-side month
  navigation via `useState`, receives the full event list as a prop and filters per day
  client-side

Shifts adopts the same tab + calendar shape, with day-click behavior events doesn't need.

## Tab & routing

Add `?view=week|calendar` to the Shifts page, default `week` (today's grid, unchanged
behavior). Pill-tab switcher matching the Events page's, inserted above the week-nav toolbar.
The existing `?w=` weekly-offset param only applies in `week` view.

## Data fetching

`ShiftsPage` (server component) gains a second query alongside the existing week-bounded
`weekShifts` fetch: all shifts for the venue within a 6-month rolling window (3 months back,
3 months forward from today), same `include` shape (membership/user/role) as `weekShifts`.
Passed to the new `ShiftsCalendar` client component along with `currentMembershipId` and
`canManage`.

6-month window matches the bound already accepted for the calendar month-nav pattern
(`EventsCalendar` has no bound at all today, which this deliberately tightens rather than
copies — shift volume from weekly recurrence makes an unbounded fetch worse here than it is
for events).

## Component: `ShiftsCalendar`

New client component, `apps/web/components/shifts-calendar.tsx`, structurally mirroring
`EventsCalendar` (month grid, prev/next/today nav) with two differences:

**Cell content** — each day shows only the _viewing user's own_ shift chip(s) (time + role,
color-coded to the existing Scheduled/Active/Missed legend from the week grid). For
managers/owners, a day that has venue shifts they don't personally work still gets a small
dot/count indicator in the corner — without it, a manager's day off shows an empty cell with
no cue to click in, defeating the point of the day-detail dialog.

**Click behavior** — clicking a date opens `ShiftDayDialog` for that date instead of navigating
away (unlike `EventsCalendar`, where clicking an event navigates to its detail page).

## Component: `ShiftDayDialog`

New client component, `apps/web/components/shift-day-dialog.tsx`. Content branches on
`canManage`:

**Staff (non-manager):** read-only. Lists only the viewer's own shift(s) for that date — time,
role, status badge. `ClockShiftButton` still renders when applicable (clock-in on `SCHEDULED`,
clock-out on `ACTIVE`) — that's a self-service action, not a management one, and stays
available everywhere else in the app.

**Manager/Owner:** the full venue-wide shift list for that date, one row per shift, matching
the existing weekly-grid row shape:

- Staff avatar + name, time chip, status badge
- `ClockShiftButton` (clock in/out on behalf of staff, as today's Actions section already
  allows)
- `DeleteShiftButton`
- `CreateShiftDialog` duplicate/edit trigger (same `prefill` shape already used in the week
  grid)
- Open shifts rendered via `OpenShiftChip`, same as the week grid's open-shifts row

Empty day (manager view, zero shifts scheduled): "No shifts scheduled for this day" +
an "Add shift" button that opens `CreateShiftDialog` with `prefill.date` set to the clicked
date — no new creation UI, just an existing dialog prefilled from a different entry point.

## Out of scope

- Creating a shift by clicking directly on an empty calendar cell (the dialog's "Add shift"
  button covers this without a second interaction pattern to maintain)
- Month-level aggregate stats (total hours scheduled, coverage %, etc.) on the calendar view —
  the existing KPI row above stays week-scoped
- Any change to the existing week-grid view — it's untouched, calendar is purely additive
