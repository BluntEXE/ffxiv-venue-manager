# Recurring Shifts — Design

## Problem

Managers can only create shifts one-off via `CreateShiftDialog`. There's no way to schedule
a shift that repeats weekly, biweekly, or monthly — a common need (e.g. "same bartender,
every Tuesday 8pm-2am").

## Existing pattern to reuse

`Event` already ships a working recurrence system that this design mirrors exactly:

- `Event.recurrenceRule String?` — `"WEEKLY" | "BIWEEKLY" | "MONTHLY"`, null for one-off events
- `Event.parentEventId String?` self-relation (`parentEvent` / `childEvents`)
- `apps/web/lib/recurrence.ts` — `generateOccurrences(startTime, endTime, rule, count)`, built on
  `date-fns` (`addWeeks` / `addMonths`). `MONTHLY` = same date-of-month via `addMonths` (not
  weekday-position — e.g. "3rd Tuesday" — that semantic exists separately in the unmerged
  `feat/venue-opening-schedule` branch's `weekOfMonth` field and is _not_ what this reuses)
- On event creation: if `recurrenceRule` is set, `generateOccurrences` produces 8 future
  instances as child `Event` rows
- `cron/update-event-statuses` rolls the window forward each run, keeping 8 weeks of future
  instances live, extending 4 at a time
- `cancel-series/route.ts`: resolves child→parent via `parentEventId ?? id`, then bulk-cancels
  all future non-started children

Shifts adopt the same shape, scaled to a tighter window (see below).

## Schema changes

`Shift` model (`apps/web/prisma/schema.prisma`):

```prisma
model Shift {
  // ...existing fields...
  recurrenceRule String?      // "WEEKLY" | "BIWEEKLY" | "MONTHLY", null = one-off
  parentShiftId  String?
  parentShift    Shift?  @relation("ShiftRecurrence", fields: [parentShiftId], references: [id])
  childShifts    Shift[] @relation("ShiftRecurrence")
}
```

No new enum — `recurrenceRule` is a plain string validated by Zod at the API boundary,
matching `Event`'s approach (not a Prisma enum).

## Generation

Reuse `lib/recurrence.ts`'s `generateOccurrences()` unmodified — no shift-specific fork.

On `POST /api/venues/[venueId]/shifts`:

- If `recurrenceRule` is present in the body, after creating the parent shift, call
  `generateOccurrences(scheduledStart, scheduledEnd, recurrenceRule, n)` where `n` is enough
  occurrences to fill a **6-week window** from `scheduledStart` (computed by the rule's
  interval — e.g. 6 for `WEEKLY`, 3 for `BIWEEKLY`, 1-2 for `MONTHLY`)
- Each generated child inherits `membershipId`, `roleId`, and `notes` from the parent.
  Recurrence is orthogonal to the existing assign-vs-open creation modes — both work
  unchanged, just repeated

### Why 6 weeks, not 8

Events use an 8-week window because event nights are planned further out. Shift scheduling
happens on a tighter horizon, but a 4-week window was rejected: for `MONTHLY`, the next
occurrence lands ~4 weeks out, so a 4-week window could shrink to zero visible future
instances between cron runs. 6 weeks keeps a buffer for `MONTHLY` while staying tighter than
events' 8.

## Roll-forward

Extend `cron/update-event-statuses` (or add sibling logic in the same cron run — implementation
plan decides which is cleaner) with a shifts pass:

- For each parent shift with `recurrenceRule` set (and not itself cancelled), find the latest
  non-cancelled child's `scheduledStart`
- If fewer than 6 weeks of future instances remain, generate enough occurrences via
  `generateOccurrences` to refill the window back to 6 weeks (not a fixed batch count like
  events' "extend by 4" — refill-to-window is more precise for the shorter horizon)

## Series cancellation

New `cancel-series` endpoint for shifts, same shape as `events/[eventId]/cancel-series`:

- Accepts either a parent or child shift ID, resolves to parent via `parentShiftId ?? id`
- Bulk-updates all future (`scheduledStart > now`), non-terminal (`OPEN`/`CLAIMED`/`SCHEDULED`)
  children to `CANCELLED`
- Same permission check as shift creation: `OWNER`/`MANAGER` only

## Per-occurrence edits

No special "detach from series" mechanism. Each generated child is an independent `Shift`
row, only linked to its parent via `parentShiftId`. Editing one occurrence (reassigning
staff, changing times, adding notes) through the existing `PATCH /shifts/[shiftId]` route
already only touches that row — isolation is structural, not a flag to build or maintain.
This matches how `Event` children already behave.

## UI

`CreateShiftDialog` (`apps/web/components/create-shift-dialog.tsx`) gains the same
toggle-switch + frequency-select block already shipped in `events/new/page.tsx`:

- "Repeating Shift" switch (off by default)
- When on: Frequency `Select` — Weekly / Every two weeks / Monthly
- Works identically whether the dialog is in "assign to staff member" or "leave open" mode

## Out of scope

- Role-based pay rates (separate spec — `Role` currently has no rate field; `hourlyRate`
  lives only on `Membership` and payroll generation reads it from there)
- "Repeat until date" / "repeat N times" termination — indefinite recurrence (cancel-series
  as the only stop mechanism) matches the proven event pattern; add an expiry mechanic later
  only if it's actually requested
- Weekday-position monthly recurrence (e.g. "3rd Tuesday") — this reuses `Event`'s
  date-of-month semantics, not the `weekOfMonth` approach from the unmerged
  `feat/venue-opening-schedule` branch
