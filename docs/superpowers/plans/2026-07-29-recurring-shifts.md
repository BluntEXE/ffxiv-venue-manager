# Recurring Shifts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let managers create shifts that repeat weekly, biweekly, or monthly, mirroring the existing `Event` recurrence system.

**Architecture:** Add `recurrenceRule`/`parentShiftId` to `Shift`, reuse `lib/recurrence.ts`'s `generateOccurrences()` unmodified, generate a 6-week window of child shifts on creation, roll the window forward via a new cron endpoint, and add a `cancel-series` endpoint that bulk-cancels future non-terminal children. UI changes mirror `events/new/page.tsx`'s repeating toggle inside the existing `CreateShiftDialog`.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (`db push`, no migration files), Zod, `date-fns`. **No unit test framework exists in `apps/web`** (only `apps/shout-crafter` has vitest; `apps/web` verifies via `tsc --noEmit` + Playwright smoke tests + manual checks — same as how the `Event` recurrence system itself was built, with no tests). This plan follows that existing convention: verification steps use `pnpm --filter web typecheck`, `curl` against the dev server, and direct Postgres queries instead of a test runner.

---

## File Structure

- Modify: `apps/web/prisma/schema.prisma` — add `recurrenceRule`, `parentShiftId` self-relation to `Shift`
- Modify: `apps/web/lib/recurrence.ts` — add `occurrencesToFillWindow()` helper (shared by the creation route and the roll-forward cron)
- Create: `apps/web/lib/shift-notifications.ts` — extract `queueShiftReminder()` from the existing inline code in the shifts POST route, so both the initial batch and the cron-extended batch can call it
- Modify: `apps/web/app/api/venues/[venueId]/shifts/route.ts` — accept `recurrenceRule` in `POST`, generate child shifts, queue reminders via the new helper
- Modify: `apps/web/lib/shift-audit.ts` — add `"CANCEL_SERIES"` to `ShiftAuditAction`
- Create: `apps/web/app/api/venues/[venueId]/shifts/[shiftId]/cancel-series/route.ts` — mirrors the events cancel-series endpoint
- Create: `apps/web/app/api/cron/roll-forward-shifts/route.ts` — new dedicated cron job (own folder, matching the one-job-per-folder convention already used for every other cron route)
- Modify: `apps/web/components/create-shift-dialog.tsx` — add the repeating toggle + frequency select, disable "quantity" while repeating is on
- Modify: `apps/web/components/delete-shift-button.tsx` — add an `isRecurring` prop that swaps the delete call for a cancel-series call
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx` — pass `isRecurring` to `DeleteShiftButton` for open shifts that belong to a series

---

### Task 1: Schema — add recurrence fields to `Shift`

**Files:**
- Modify: `apps/web/prisma/schema.prisma:783-810` (the `Shift` model)

- [ ] **Step 1: Add the fields**

Open `apps/web/prisma/schema.prisma` and find the `Shift` model. Add `recurrenceRule` and the `parentShiftId` self-relation right after the existing `notes` field, and add the relation fields near the other relations:

```prisma
model Shift {
  id             String  @id @default(cuid())
  venueId        String
  membershipId   String?
  roleId         String?
  payrollEntryId String? // Links to the payroll entry that paid for this shift

  // Schedule (set by manager when creating the shift)
  scheduledStart DateTime
  scheduledEnd   DateTime

  // Actuals (set by staff via clock-in / clock-out)
  actualStart DateTime?
  actualEnd   DateTime?
  hoursWorked Decimal?  @db.Decimal(6, 2) // Stored at clock-out for immediate display

  status ShiftStatus @default(SCHEDULED)
  notes  String?     @db.Text

  // Recurrence: null recurrenceRule = one-off shift. Set only on the parent;
  // children reference it via parentShiftId (same pattern as Event/parentEventId).
  recurrenceRule String?
  parentShiftId  String?

  shiftSignupEmbedId String?
  shiftSignupEmbed   ShiftSignupEmbed? @relation(fields: [shiftSignupEmbedId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  venue        Venue         @relation(fields: [venueId], references: [id], onDelete: Cascade)
  membership   Membership?   @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  role         Role?         @relation(fields: [roleId], references: [id], onDelete: SetNull)
  payrollEntry PayrollEntry? @relation(fields: [payrollEntryId], references: [id], onDelete: SetNull)
  auditLogs    ShiftAuditLog[]

  parentShift Shift?  @relation("ShiftRecurrence", fields: [parentShiftId], references: [id])
  childShifts Shift[] @relation("ShiftRecurrence")

  @@index([venueId, scheduledStart])
```

(Leave everything else in the model — indexes, `@@map`, etc. — exactly as-is; only inserting the new fields and relations shown above.)

- [ ] **Step 2: Generate the Prisma client and verify the schema is valid**

Run: `cd apps/web && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

Run: `cd apps/web && npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors

- [ ] **Step 3: Back up the database before pushing the schema change**

This is a live single-instance Postgres with no migrations table — `db:push` applies directly. Back it up first:

Run: `docker exec postgres pg_dump -U postgres venue_manager > ~/backups/venue_manager_$(date +%Y%m%d_%H%M%S).sql`
Expected: a non-empty `.sql` file appears in `~/backups/`

**STOP — confirm with the user before the next step.** Verify which Postgres `DATABASE_URL` in `apps/web/.env.local` actually points to (local dev container vs. the production container on the server) before running `db:push`, since this is an additive, non-destructive change (two new nullable columns) but the command itself carries `--accept-data-loss`.

- [ ] **Step 4: Push the schema**

Run: `cd apps/web && npm run db:push`
Expected: `🚀 Your database is now in sync with your Prisma schema.` — should report 2 columns added, nothing dropped (both new fields are nullable, no data loss possible)

- [ ] **Step 5: Verify the columns exist**

Run: `docker exec postgres psql -U postgres -d venue_manager -c "\d shifts" | grep -E "recurrence_rule|parent_shift_id"`
Expected: both columns listed

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app
git add apps/web/prisma/schema.prisma
git commit -m "feat(shifts): add recurrenceRule and parentShiftId to Shift model"
```

---

### Task 2: Recurrence helper — window-fill occurrence count

**Files:**
- Modify: `apps/web/lib/recurrence.ts`

- [ ] **Step 1: Add `occurrencesToFillWindow`**

```typescript
import { addWeeks, addMonths } from "date-fns"

export type RecurrenceRule = "WEEKLY" | "BIWEEKLY" | "MONTHLY"

function nextOccurrence(date: Date, rule: RecurrenceRule): Date {
  switch (rule) {
    case "WEEKLY":   return addWeeks(date, 1)
    case "BIWEEKLY": return addWeeks(date, 2)
    case "MONTHLY":  return addMonths(date, 1)
  }
}

export function generateOccurrences(
  startTime: Date,
  endTime: Date,
  rule: RecurrenceRule,
  count: number
): Array<{ startTime: Date; endTime: Date }> {
  const duration = endTime.getTime() - startTime.getTime()
  const result: Array<{ startTime: Date; endTime: Date }> = []
  let cursor = startTime
  for (let i = 0; i < count; i++) {
    cursor = nextOccurrence(cursor, rule)
    result.push({ startTime: cursor, endTime: new Date(cursor.getTime() + duration) })
  }
  return result
}

// Weeks between one occurrence and the next, per rule. MONTHLY approximated as 4 weeks —
// good enough for sizing a rolling window, not used for actual date math.
const WEEKS_PER_OCCURRENCE: Record<RecurrenceRule, number> = {
  WEEKLY: 1,
  BIWEEKLY: 2,
  MONTHLY: 4,
}

/**
 * How many occurrences of `rule` are needed to cover `windowWeeks` of future time.
 * Used both when first creating a recurring shift (fill a 6-week window) and when the
 * roll-forward cron tops the window back up.
 */
export function occurrencesToFillWindow(rule: RecurrenceRule, windowWeeks: number): number {
  if (windowWeeks <= 0) return 0
  return Math.ceil(windowWeeks / WEEKS_PER_OCCURRENCE[rule])
}
```

- [ ] **Step 2: Verify with a throwaway script**

Run:
```bash
cd apps/web && npx tsx -e "
import { occurrencesToFillWindow } from './lib/recurrence'
console.log(occurrencesToFillWindow('WEEKLY', 6))   // expect 6
console.log(occurrencesToFillWindow('BIWEEKLY', 6)) // expect 3
console.log(occurrencesToFillWindow('MONTHLY', 6))  // expect 2
console.log(occurrencesToFillWindow('WEEKLY', 0))   // expect 0
console.log(occurrencesToFillWindow('WEEKLY', -2))  // expect 0
"
```
Expected output: `6`, `3`, `2`, `0`, `0` on separate lines

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app
git add apps/web/lib/recurrence.ts
git commit -m "feat(shifts): add occurrencesToFillWindow helper to recurrence lib"
```

---

### Task 3: Extract shift-reminder queuing into a shared helper

**Files:**
- Create: `apps/web/lib/shift-notifications.ts`
- Modify: `apps/web/app/api/venues/[venueId]/shifts/route.ts:207-220` (the existing inline reminder block)

The current POST handler queues a `SHIFT_REMINDER` notification inline for the one shift it creates. Once a single POST can create many child shifts, that logic needs to run per-child too — pull it out so both the creation route and the roll-forward cron can call it without duplicating the notification shape.

- [ ] **Step 1: Create the helper**

```typescript
import { prisma } from "@/lib/prisma"

/**
 * Queue a "shift starting soon" reminder for 1 hour before scheduledStart.
 * No-op if scheduledStart is less than an hour away (nothing meaningful to remind about)
 * or if there's no assigned user (open shifts have no one to notify).
 */
export function queueShiftReminder(
  userId: string,
  venueId: string,
  venueName: string,
  shiftId: string,
  scheduledStart: Date
) {
  const reminderAt = new Date(scheduledStart.getTime() - 60 * 60 * 1000)
  if (reminderAt <= new Date()) return

  return prisma.pendingNotification.create({
    data: {
      userId,
      type: "SHIFT_REMINDER",
      title: "Shift starting soon",
      body: `Your shift at ${venueName} starts in 1 hour.`,
      data: { venueId, shiftId },
      scheduledFor: reminderAt,
    },
  }).catch(() => {}) // non-blocking, matches existing behavior
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Replace the inline block in the shifts POST route**

In `apps/web/app/api/venues/[venueId]/shifts/route.ts`, add the import:

```typescript
import { queueShiftReminder } from "@/lib/shift-notifications"
```

Replace this existing block:

```typescript
    // Queue shift reminder 1 hour before start: only meaningful for assigned shifts
    if (targetMembership?.userId) {
      const reminderAt = new Date(scheduledStart.getTime() - 60 * 60 * 1000)
      if (reminderAt > new Date()) {
        prisma.pendingNotification.create({
          data: {
            userId: targetMembership.userId,
            type: "SHIFT_REMINDER",
            title: "Shift starting soon",
            body: `Your shift at ${venue.name} starts in 1 hour.`,
            data: { venueId: venue.id, shiftId: shift.id },
            scheduledFor: reminderAt,
          },
        }).catch(() => {}) // non-blocking
      }
    }
```

with:

```typescript
    // Queue shift reminder 1 hour before start: only meaningful for assigned shifts
    if (targetMembership?.userId) {
      queueShiftReminder(targetMembership.userId, venue.id, venue.name, shift.id, scheduledStart)
    }
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 5: Manually verify unchanged behavior**

Run: `cd apps/web && npm run dev` (leave running in a separate terminal/background)

In another terminal, create a one-off assigned shift for a real venue/membership/role you have locally (substitute real IDs and a valid session cookie — grab the `next-auth.session-token` cookie from the browser after logging in locally):

```bash
curl -s -X POST http://localhost:3000/api/venues/<venueId>/shifts \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"membershipId":"<membershipId>","scheduledStart":"2026-08-05T19:00:00.000Z","scheduledEnd":"2026-08-05T23:00:00.000Z"}'
```
Expected: `201` with the created shift; then check `pendingNotification` got a `SHIFT_REMINDER` row:

Run: `docker exec postgres psql -U postgres -d venue_manager -c "SELECT type, \"scheduledFor\" FROM \"PendingNotification\" ORDER BY \"createdAt\" DESC LIMIT 1;"`
Expected: one row, `type = SHIFT_REMINDER`, `scheduledFor` one hour before the shift's start

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app
git add apps/web/lib/shift-notifications.ts apps/web/app/api/venues/\[venueId\]/shifts/route.ts
git commit -m "refactor(shifts): extract queueShiftReminder into a shared helper"
```

---

### Task 4: Generate recurring child shifts on creation

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/shifts/route.ts`

- [ ] **Step 1: Extend the request schema**

Add `recurrenceRule` to `createShiftSchema` and import the recurrence helpers:

```typescript
import { generateOccurrences, occurrencesToFillWindow, type RecurrenceRule } from "@/lib/recurrence"
```

```typescript
const createShiftSchema = z
  .object({
    membershipId: z.string().min(1).optional(),
    roleId: z.string().min(1).optional(),
    scheduledStart: z.string().datetime(),
    scheduledEnd: z.string().datetime(),
    notes: z.string().optional(),
    recurrenceRule: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  })
  // Cross-field rule (spans membershipId and roleId), so the error is form-level: no single field is "wrong" on its own.
  .refine((data) => Boolean(data.membershipId) !== Boolean(data.roleId), {
    message: "Provide exactly one of membershipId (assign now) or roleId (leave open), not both",
  })
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: error — `recurrenceRule` is parsed but unused, and the shift `create` call doesn't yet write it. That's expected; move to the next step.

- [ ] **Step 3: Write it to the parent shift and generate children**

Find this block in the `POST` handler:

```typescript
    const scheduledStart = new Date(parsed.data.scheduledStart)
    const shift = await prisma.shift.create({
      data: {
        venueId: venue.id,
        membershipId: parsed.data.membershipId ?? null,
        roleId: verifiedRoleId,
        status: parsed.data.membershipId ? "SCHEDULED" : "OPEN",
        scheduledStart,
        scheduledEnd: new Date(parsed.data.scheduledEnd),
        notes: parsed.data.notes ?? null,
      },
    })
```

Replace it with:

```typescript
    const scheduledStart = new Date(parsed.data.scheduledStart)
    const scheduledEnd = new Date(parsed.data.scheduledEnd)
    const recurrenceRule = parsed.data.recurrenceRule

    const shift = await prisma.shift.create({
      data: {
        venueId: venue.id,
        membershipId: parsed.data.membershipId ?? null,
        roleId: verifiedRoleId,
        status: parsed.data.membershipId ? "SCHEDULED" : "OPEN",
        scheduledStart,
        scheduledEnd,
        notes: parsed.data.notes ?? null,
        recurrenceRule: recurrenceRule ?? null,
      },
    })

    let childShifts: { id: string; scheduledStart: Date }[] = []
    if (recurrenceRule) {
      const count = occurrencesToFillWindow(recurrenceRule as RecurrenceRule, 6)
      const occurrences = generateOccurrences(scheduledStart, scheduledEnd, recurrenceRule as RecurrenceRule, count)
      await prisma.shift.createMany({
        data: occurrences.map((o) => ({
          venueId: venue.id,
          membershipId: parsed.data.membershipId ?? null,
          roleId: verifiedRoleId,
          status: parsed.data.membershipId ? "SCHEDULED" : "OPEN",
          scheduledStart: o.startTime,
          scheduledEnd: o.endTime,
          notes: parsed.data.notes ?? null,
          parentShiftId: shift.id,
        })),
      })
      childShifts = await prisma.shift.findMany({
        where: { parentShiftId: shift.id },
        select: { id: true, scheduledStart: true },
      })
    }
```

- [ ] **Step 4: Queue reminders for every assigned occurrence, not just the parent**

Find this block (now using the helper from Task 3):

```typescript
    // Queue shift reminder 1 hour before start: only meaningful for assigned shifts
    if (targetMembership?.userId) {
      queueShiftReminder(targetMembership.userId, venue.id, venue.name, shift.id, scheduledStart)
    }
```

Replace it with:

```typescript
    // Queue shift reminders 1 hour before start for every assigned occurrence (parent + children)
    if (targetMembership?.userId) {
      queueShiftReminder(targetMembership.userId, venue.id, venue.name, shift.id, scheduledStart)
      for (const child of childShifts) {
        queueShiftReminder(targetMembership.userId, venue.id, venue.name, child.id, child.scheduledStart)
      }
    }
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 6: Manually verify — weekly recurrence generates a full 6-week window**

With `npm run dev` running:

```bash
curl -s -X POST http://localhost:3000/api/venues/<venueId>/shifts \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"membershipId":"<membershipId>","scheduledStart":"2026-08-05T19:00:00.000Z","scheduledEnd":"2026-08-05T23:00:00.000Z","recurrenceRule":"WEEKLY"}'
```
Expected: `201`, parent shift returned

Run:
```bash
docker exec postgres psql -U postgres -d venue_manager -c "SELECT id, scheduled_start, parent_shift_id FROM shifts WHERE parent_shift_id IS NOT NULL OR id = '<parentShiftIdFromResponse>' ORDER BY scheduled_start;"
```
Expected: 1 parent row (`parent_shift_id` null) + 6 child rows, each 7 days apart, starting 2026-08-12 through 2026-09-16

- [ ] **Step 7: Manually verify — monthly recurrence generates 2 occurrences**

Repeat Step 6 with `"recurrenceRule":"MONTHLY"` on a different date.
Expected: 1 parent + 2 children, ~1 month apart each

- [ ] **Step 8: Manually verify — open shifts with recurrence get no reminders but do get children**

Repeat Step 6 with `"roleId":"<roleId>"` instead of `membershipId`, `"recurrenceRule":"BIWEEKLY"`.
Expected: `201`, 1 parent + 3 children, all `status: OPEN`. Confirm no new `PendingNotification` rows were added (open shifts have no assignee to remind).

- [ ] **Step 9: Commit**

```bash
cd ~/xiv-app
git add apps/web/app/api/venues/\[venueId\]/shifts/route.ts
git commit -m "feat(shifts): generate recurring child shifts on creation"
```

---

### Task 5: Cancel-series endpoint

**Files:**
- Modify: `apps/web/lib/shift-audit.ts`
- Create: `apps/web/app/api/venues/[venueId]/shifts/[shiftId]/cancel-series/route.ts`

- [ ] **Step 1: Add the new audit action**

In `apps/web/lib/shift-audit.ts`, change:

```typescript
export type ShiftAuditAction = "CLOCK_IN" | "CLOCK_OUT" | "CLAIM" | "APPROVE" | "REJECT"
```

to:

```typescript
export type ShiftAuditAction = "CLOCK_IN" | "CLOCK_OUT" | "CLAIM" | "APPROVE" | "REJECT" | "CANCEL_SERIES"
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Create the cancel-series route**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logShiftAudit } from "@/lib/shift-audit"

/**
 * POST /api/venues/[venueId]/shifts/[shiftId]/cancel-series
 * Cancels every future, non-terminal occurrence in this shift's recurring series.
 * Accepts either the parent shift ID or any child's ID. OWNER/MANAGER only.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; shiftId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, shiftId } = await params

    const venue = await prisma.venue.findFirst({
      where: { OR: [{ id: venueId }, { slug: venueId }] },
    })
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 })
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, venueId: venue.id, status: "active" },
    })
    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "Only managers can cancel a series" }, { status: 403 })
    }

    const shift = await prisma.shift.findUnique({ where: { id: shiftId } })
    if (!shift || shift.venueId !== venue.id) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 })
    }

    const parentId = shift.parentShiftId ?? shift.id

    const now = new Date()
    const { count } = await prisma.shift.updateMany({
      where: {
        OR: [{ id: parentId }, { parentShiftId: parentId }],
        scheduledStart: { gt: now },
        status: { in: ["OPEN", "CLAIMED", "SCHEDULED"] },
      },
      data: { status: "CANCELLED" },
    })

    await logShiftAudit(parentId, "CANCEL_SERIES", session.user.id, "web")

    return NextResponse.json({ cancelled: count })
  } catch (error) {
    console.error("Error cancelling shift series:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 5: Manually verify**

Using the weekly-recurring parent shift ID created in Task 4 Step 6:

```bash
curl -s -X POST http://localhost:3000/api/venues/<venueId>/shifts/<parentShiftId>/cancel-series \
  -H "Cookie: next-auth.session-token=<token>"
```
Expected: `{"cancelled":7}` (parent + 6 children, all future)

Run:
```bash
docker exec postgres psql -U postgres -d venue_manager -c "SELECT status, count(*) FROM shifts WHERE id = '<parentShiftId>' OR parent_shift_id = '<parentShiftId>' GROUP BY status;"
```
Expected: all 7 rows `CANCELLED`

Also verify calling it again on a **child** ID (not the parent) resolves to the same series and returns `{"cancelled":0}` (already cancelled, nothing left in `OPEN/CLAIMED/SCHEDULED`).

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app
git add apps/web/lib/shift-audit.ts apps/web/app/api/venues/\[venueId\]/shifts/\[shiftId\]/cancel-series/route.ts
git commit -m "feat(shifts): add cancel-series endpoint"
```

---

### Task 6: Roll-forward cron

**Files:**
- Create: `apps/web/app/api/cron/roll-forward-shifts/route.ts`

- [ ] **Step 1: Create the cron route**

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { generateOccurrences, occurrencesToFillWindow, type RecurrenceRule } from "@/lib/recurrence"
import { differenceInCalendarWeeks } from "date-fns"
import { queueShiftReminder } from "@/lib/shift-notifications"

const WINDOW_WEEKS = 6

/**
 * Cron Job: Roll Forward Recurring Shifts
 * Keeps 6 weeks of future instances live for every active recurring shift series.
 * Should be run daily (recurrence intervals are weeks-to-months, unlike event status
 * transitions which need 5-minute granularity).
 *
 * QStash Configuration:
 * - URL: https://xivvenuemanager.com/api/cron/roll-forward-shifts
 * - Schedule: Daily (cron: 0 6 * * *)
 * - Method: GET
 * - Headers: { "authorization": "Bearer YOUR_CRON_SECRET" }
 */
export async function GET(request: Request) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const now = new Date()
    console.log(`[Cron] Shift roll-forward starting at ${now.toISOString()}`)

    const recurringParents = await prisma.shift.findMany({
      where: { recurrenceRule: { not: null }, parentShiftId: null, status: { not: "CANCELLED" } },
      select: {
        id: true,
        venueId: true,
        membershipId: true,
        roleId: true,
        notes: true,
        recurrenceRule: true,
        venue: { select: { name: true } },
        membership: { select: { userId: true } },
      },
    })

    let generated = 0

    for (const parent of recurringParents) {
      const latestChild = await prisma.shift.findFirst({
        where: { parentShiftId: parent.id, status: { not: "CANCELLED" } },
        orderBy: { scheduledStart: "desc" },
        select: { scheduledStart: true, scheduledEnd: true },
      })
      if (!latestChild) continue // series was fully cancelled or never generated — skip

      const weeksRemaining = differenceInCalendarWeeks(latestChild.scheduledStart, now)
      if (weeksRemaining >= WINDOW_WEEKS) continue

      const rule = parent.recurrenceRule as RecurrenceRule
      const count = occurrencesToFillWindow(rule, WINDOW_WEEKS - weeksRemaining)
      if (count <= 0) continue

      const occurrences = generateOccurrences(
        latestChild.scheduledStart,
        latestChild.scheduledEnd,
        rule,
        count
      )

      const created = await prisma.$transaction(
        occurrences.map((o) =>
          prisma.shift.create({
            data: {
              venueId: parent.venueId,
              membershipId: parent.membershipId,
              roleId: parent.roleId,
              status: parent.membershipId ? "SCHEDULED" : "OPEN",
              scheduledStart: o.startTime,
              scheduledEnd: o.endTime,
              notes: parent.notes,
              parentShiftId: parent.id,
            },
          })
        )
      )

      if (parent.membership?.userId) {
        for (const child of created) {
          queueShiftReminder(
            parent.membership.userId,
            parent.venueId,
            parent.venue.name,
            child.id,
            child.scheduledStart
          )
        }
      }

      generated += created.length
    }

    return NextResponse.json({ success: true, seriesChecked: recurringParents.length, generated })
  } catch (error) {
    console.error("Error in roll-forward-shifts cron job:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Manually verify — window under threshold triggers generation**

Using the biweekly-recurring open series from Task 4 Step 8 (1 parent + 3 children spanning 6 weeks), manually push its children's dates closer to `now` to simulate time passing:

```bash
docker exec postgres psql -U postgres -d venue_manager -c "
UPDATE shifts SET scheduled_start = scheduled_start - interval '5 weeks', scheduled_end = scheduled_end - interval '5 weeks'
WHERE parent_shift_id = '<biweeklyParentId>' OR id = '<biweeklyParentId>';"
```

Run the cron locally:
```bash
curl -s http://localhost:3000/api/cron/roll-forward-shifts -H "authorization: Bearer <CRON_SECRET from .env.local>"
```
Expected: `{"success":true,"seriesChecked":<N>,"generated":<count>}` with `generated` > 0

Run:
```bash
docker exec postgres psql -U postgres -d venue_manager -c "SELECT count(*) FROM shifts WHERE parent_shift_id = '<biweeklyParentId>';"
```
Expected: more children than before (window refilled to 6 weeks)

- [ ] **Step 4: Manually verify — series with only cancelled children is skipped**

Run the cron again against the fully-cancelled weekly series from Task 5.
Expected: `generated` does not increase for that series (its `latestChild` query finds nothing since all children are `CANCELLED`, so it's skipped — confirm no new rows appear for that `parent_shift_id`)

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app
git add apps/web/app/api/cron/roll-forward-shifts/route.ts
git commit -m "feat(shifts): add roll-forward-shifts cron to extend recurring series"
```

- [ ] **Step 6: Note for QStash registration (manual, outside this codebase)**

After deploying, register the new cron endpoint in QStash (same place the other `apps/web/app/api/cron/*` jobs are registered): URL `https://xivvenuemanager.com/api/cron/roll-forward-shifts`, daily schedule, `authorization: Bearer <CRON_SECRET>` header. This can't be done from the repo — flag it as a manual post-deploy step.

---

### Task 7: UI — repeating toggle in `CreateShiftDialog`

**Files:**
- Modify: `apps/web/components/create-shift-dialog.tsx`

- [ ] **Step 1: Add state**

After the existing `quantity` state:

```typescript
  const [quantity, setQuantity] = useState(1)
  const [repeating, setRepeating] = useState(false)
  const [recurrenceRule, setRecurrenceRule] = useState<"WEEKLY" | "BIWEEKLY" | "MONTHLY">("WEEKLY")
```

- [ ] **Step 2: Include it in the submit payload, and reset it after success**

In `handleSubmit`, find:

```typescript
          body: JSON.stringify({
            ...(mode === "assign" ? { membershipId } : { roleId }),
            scheduledStart,
            scheduledEnd,
            notes: notes || undefined,
          }),
```

Replace with:

```typescript
          body: JSON.stringify({
            ...(mode === "assign" ? { membershipId } : { roleId }),
            scheduledStart,
            scheduledEnd,
            notes: notes || undefined,
            ...(repeating ? { recurrenceRule } : {}),
          }),
```

Find the reset block after a successful submit:

```typescript
      setMode(prefill?.mode ?? "assign")
      setMembershipId(prefill?.membershipId ?? "")
      setRoleId(prefill?.roleId ?? "")
      setDate(prefill?.date ?? "")
      setStartTime(prefill?.startTime ?? "19:00")
      setEndTime(prefill?.endTime ?? "23:00")
      setNotes(prefill?.notes ?? "")
      setQuantity(1)
      setOpen(false)
```

Replace with:

```typescript
      setMode(prefill?.mode ?? "assign")
      setMembershipId(prefill?.membershipId ?? "")
      setRoleId(prefill?.roleId ?? "")
      setDate(prefill?.date ?? "")
      setStartTime(prefill?.startTime ?? "19:00")
      setEndTime(prefill?.endTime ?? "23:00")
      setNotes(prefill?.notes ?? "")
      setQuantity(1)
      setRepeating(false)
      setRecurrenceRule("WEEKLY")
      setOpen(false)
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 4: Add the toggle UI, and hide quantity while repeating is on**

`quantity` (multiple identical open shifts on the same night) and `repeating` (the same shift repeated across future weeks) solve different problems and multiplying them wasn't asked for — so the two are mutually exclusive in the UI: turning on repeating hides the quantity field, and quantity is forced to 1 for the request.

Find the existing quantity block:

```tsx
          {mode === "open" && (
            <div className="space-y-2">
              <Label htmlFor="quantity">How many open slots?</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={20}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">
                Creates this many identical open shifts for staff to claim.
              </p>
            </div>
          )}
```

Replace with:

```tsx
          {mode === "open" && !repeating && (
            <div className="space-y-2">
              <Label htmlFor="quantity">How many open slots?</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={20}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">
                Creates this many identical open shifts for staff to claim.
              </p>
            </div>
          )}

          <div className="space-y-3 p-4 border border-[var(--blue-015)] rounded-lg bg-[var(--blue-004)]">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="repeating" className="text-sm font-semibold">Repeating Shift</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Generates future instances automatically</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={repeating}
                id="repeating"
                onClick={() => setRepeating(!repeating)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xiv-blue)] ${
                  repeating ? "bg-[var(--xiv-blue)]" : "bg-muted"
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${repeating ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {repeating && (
              <div className="space-y-2">
                <Label htmlFor="recurrenceRule">Frequency</Label>
                <Select value={recurrenceRule} onValueChange={(v) => setRecurrenceRule(v as "WEEKLY" | "BIWEEKLY" | "MONTHLY")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="BIWEEKLY">Every two weeks</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
```

Also update the submit loop so `quantity` is ignored while repeating (repeating already produces multiple rows server-side; don't multiply that further):

Find:

```typescript
      const count = mode === "open" ? Math.max(1, Math.min(20, quantity)) : 1
```

Replace with:

```typescript
      const count = mode === "open" && !repeating ? Math.max(1, Math.min(20, quantity)) : 1
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 6: Manually verify in the browser**

Run: `cd apps/web && npm run dev`, open `http://localhost:3000/dashboard/<venueSlug>/shifts`, click "Schedule Shift":
- Toggle "Repeating Shift" on with mode = "Leave open" — confirm the quantity field disappears and the Frequency select appears
- Pick "Every two weeks", fill in date/time, submit
- Confirm the dialog closes and the shift grid shows the new open shift on the chosen date (children aren't visible in-grid until their week is navigated to, but the immediate parent shift should appear)
- Re-open the dialog, confirm state reset to `repeating = false`, quantity = 1

- [ ] **Step 7: Commit**

```bash
cd ~/xiv-app
git add apps/web/components/create-shift-dialog.tsx
git commit -m "feat(shifts): add repeating toggle to CreateShiftDialog"
```

---

### Task 8: UI — cancel series from the shifts grid

**Files:**
- Modify: `apps/web/components/delete-shift-button.tsx`
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx:417-419`

Only open shifts show `DeleteShiftButton` in the grid today (assigned/claimed shifts don't have an inline delete). Extend that same button rather than adding a second, heavier component — recurring open shifts get a "cancel series" action in the same slot instead of a plain delete.

- [ ] **Step 1: Add `isRecurring` to `DeleteShiftButton`**

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { Trash2, Repeat } from "lucide-react"

interface DeleteShiftButtonProps {
  venueSlug: string
  shiftId: string
  hasPayroll: boolean
  isRecurring?: boolean
}

export function DeleteShiftButton({ venueSlug, shiftId, hasPayroll, isRecurring }: DeleteShiftButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (isRecurring) {
      if (!confirm("Cancel this entire recurring series? All future instances will be cancelled. This cannot be undone.")) return
      setDeleting(true)
      try {
        const res = await fetch(`/api/venues/${venueSlug}/shifts/${shiftId}/cancel-series`, {
          method: "POST",
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          alert(body.error || `Cancel failed (${res.status})`)
          return
        }
        router.refresh()
      } catch (err) {
        alert("Network error cancelling series.")
      } finally {
        setDeleting(false)
      }
      return
    }

    const warning = hasPayroll
      ? "Delete this shift and its linked payroll entry? This cannot be undone."
      : "Delete this shift? This cannot be undone."
    if (!confirm(warning)) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/shifts/${shiftId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || `Delete failed (${res.status})`)
        return
      }
      router.refresh()
    } catch (err) {
      alert("Network error deleting shift.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={isRecurring ? "text-amber-400 hover:text-amber-400" : "text-destructive hover:text-destructive"}
      onClick={handleDelete}
      disabled={deleting}
      aria-label={isRecurring ? "Cancel series" : "Delete shift"}
    >
      {deleting ? "..." : isRecurring ? <Repeat className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Pass `isRecurring` from the shifts page**

In `apps/web/app/dashboard/[slug]/shifts/page.tsx`, find:

```tsx
                          {canManage && (
                            <DeleteShiftButton venueSlug={slug} shiftId={shift.id} hasPayroll={false} />
                          )}
```

Replace with:

```tsx
                          {canManage && (
                            <DeleteShiftButton
                              venueSlug={slug}
                              shiftId={shift.id}
                              hasPayroll={false}
                              isRecurring={Boolean(shift.recurrenceRule || shift.parentShiftId)}
                            />
                          )}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 5: Manually verify in the browser**

With `npm run dev` running, open the shifts grid for a venue with the biweekly recurring open series created earlier:
- Confirm its icon in the grid is the amber `Repeat` icon, not the red trash icon
- Confirm a plain (non-recurring) open shift still shows the red trash icon
- Click the `Repeat` icon on the recurring one, confirm the series-cancel warning text, confirm

Run:
```bash
docker exec postgres psql -U postgres -d venue_manager -c "SELECT status, count(*) FROM shifts WHERE parent_shift_id = '<thatSeriesParentId>' OR id = '<thatSeriesParentId>' GROUP BY status;"
```
Expected: all `CANCELLED`

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app
git add apps/web/components/delete-shift-button.tsx apps/web/app/dashboard/\[slug\]/shifts/page.tsx
git commit -m "feat(shifts): cancel-series action for recurring open shifts in the grid"
```

---

## Post-implementation checklist

- [ ] All 8 tasks committed
- [ ] `npm run typecheck` passes clean from a fresh checkout
- [ ] QStash cron registered for `roll-forward-shifts` (Task 6, Step 6 — manual, post-deploy)
- [ ] Deploy via `~/bin/deploy-xiv-web.sh` once the branch is merged
