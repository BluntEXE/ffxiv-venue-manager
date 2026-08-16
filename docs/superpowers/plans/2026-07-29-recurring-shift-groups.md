# Recurring Shift Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `quantity` (multiple identical open shifts) and `repeating` (weekly/biweekly/monthly recurrence) combine, so a manager can create N independent recurring series in one submission (e.g. 4 open Greeter slots, every week) and optionally cancel all N at once.

**Architecture:** Each of the N slots is a fully independent recurring series (its own parent + child chain, already working from the base recurring-shifts feature) — the only new piece is a `slotGroupId` tag shared across the N parent rows, plus a `cancel-group` endpoint that finds and cancels every parent sharing that tag. No changes to shift generation, `lib/recurrence.ts`, or the roll-forward cron.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (`db push`, no migration files), Zod. Same as the base recurring-shifts plan: **no unit test framework in `apps/web`** — verification via `pnpm --filter web typecheck` / `npm run typecheck`, `curl`, and direct Postgres queries.

---

## File Structure

- Modify: `apps/web/prisma/schema.prisma` — add `slotGroupId String?` to `Shift`
- Modify: `apps/web/app/api/venues/[venueId]/shifts/route.ts` — accept and store `slotGroupId` on the parent
- Modify: `apps/web/components/create-shift-dialog.tsx` — let quantity + repeating combine, generate a shared `slotGroupId` when both are used together
- Create: `apps/web/app/api/venues/[venueId]/shifts/[shiftId]/cancel-group/route.ts` — cancels every sibling series sharing a `slotGroupId`
- Modify: `apps/web/components/delete-shift-button.tsx` — add a second "cancel all slots" button, shown only when `slotGroupId` is present
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx` — pass `slotGroupId` through to `DeleteShiftButton`

---

### Task 1: Schema — add `slotGroupId` to `Shift`

**Files:**

- Modify: `apps/web/prisma/schema.prisma` (the `Shift` model — same block Task 1 of the base plan already edited)

- [ ] **Step 1: Add the field**

Find in the `Shift` model:

```prisma
  // Recurrence: null recurrenceRule = one-off shift. Set only on the parent;
  // children reference it via parentShiftId (same pattern as Event/parentEventId).
  recurrenceRule String?
  parentShiftId  String?
```

Replace with:

```prisma
  // Recurrence: null recurrenceRule = one-off shift. Set only on the parent;
  // children reference it via parentShiftId (same pattern as Event/parentEventId).
  recurrenceRule String?
  parentShiftId  String?

  // Set only on parent rows, only when quantity > 1 was combined with repeating at
  // creation time. Ties together N independent recurring series (each with its own
  // parentShiftId chain) created from a single "N open slots, repeating" submission,
  // so they can optionally be cancelled together via cancel-group. Null for everything
  // else — including quantity=1 recurring shifts and non-recurring quantity>1 shifts.
  slotGroupId String?
```

- [ ] **Step 2: Validate and regenerate the client**

Run: `cd apps/web && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

Run: `cd apps/web && npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors

- [ ] **Step 3: Back up the database before pushing**

Same live, single-instance Postgres as before — no migrations table, `db push` applies directly.

Run (on the server, via SSH): `docker exec postgres pg_dump -U postgres venue_manager > ~/backups/venue_manager_$(date +%Y%m%d_%H%M%S).sql`
Expected: a non-empty `.sql` file in `~/backups/`

- [ ] **Step 4: Dry-run the diff before pushing — this is the step that was skipped last time and caused data loss**

From this machine, open a tunnel to the server's Postgres (same approach as the base plan): `ssh -f -N -L 5432:192.168.1.122:5432 -o ExitOnForwardFailure=yes server@192.168.1.122`

Then, with `DATABASE_URL` pointed at that tunnel (matching `apps/web/.env.local`):

```bash
cd apps/web
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected: the only change shown is `ALTER TABLE "shifts" ADD COLUMN "slotGroupId" TEXT;` (or equivalent single additive column). **If anything else appears — any DROP, any other table — STOP and do not push.** The base plan's schema-drift fix (shadow models for `apps/eorzea-bot`'s tables) should make this a clean single-column diff; anything more means something drifted again since that fix landed on `main`, and needs investigating before proceeding.

- [ ] **Step 5: Push**

Run: `cd apps/web && npm run db:push` (with `DATABASE_URL` still pointed at the tunnel)
Expected: `🚀 Your database is now in sync with your Prisma schema.` — one column added, nothing dropped

- [ ] **Step 6: Verify the column exists**

Run: `docker exec postgres psql -U postgres -d venue_manager -c "\d shifts" | grep slotGroupId` (via SSH on the server, or through the tunnel with local `psql`)
Expected: column listed

- [ ] **Step 7: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat(shifts): add slotGroupId to Shift for grouped recurring slots"
```

---

### Task 2: Shift creation API — accept and store `slotGroupId`

**Files:**

- Modify: `apps/web/app/api/venues/[venueId]/shifts/route.ts`

- [ ] **Step 1: Extend the request schema**

Find:

```typescript
const createShiftSchema = z.object({
  membershipId: z.string().min(1).optional(),
  roleId: z.string().min(1).optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  notes: z.string().optional(),
  recurrenceRule: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
})
```

Replace with:

```typescript
const createShiftSchema = z.object({
  membershipId: z.string().min(1).optional(),
  roleId: z.string().min(1).optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  notes: z.string().optional(),
  recurrenceRule: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  slotGroupId: z.string().optional(),
})
```

(The `.refine(...)` block right after stays exactly as-is — untouched.)

- [ ] **Step 2: Write it to the parent shift**

Find:

```typescript
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
```

Replace with:

```typescript
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
    slotGroupId: parsed.data.slotGroupId ?? null,
  },
})
```

Children (the `prisma.shift.createMany` block right below, for recurrence) do **not** get `slotGroupId` — only parents carry it, per the design (children are found via `parentShiftId`, not `slotGroupId`). Do not add it there.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/shifts/route.ts
git commit -m "feat(shifts): accept and store slotGroupId on shift creation"
```

---

### Task 3: `CreateShiftDialog` — combine quantity with repeating

**Files:**

- Modify: `apps/web/components/create-shift-dialog.tsx`

- [ ] **Step 1: Let quantity show alongside repeating**

Find:

```tsx
{
  mode === "open" && !repeating && (
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
      <p className="text-xs text-muted-foreground">Creates this many identical open shifts for staff to claim.</p>
    </div>
  )
}
```

Replace with:

```tsx
{
  mode === "open" && (
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
        {repeating
          ? "Creates this many independent repeating slots — each gets its own weekly/biweekly/monthly instances."
          : "Creates this many identical open shifts for staff to claim."}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Generate a shared group ID and include it in the submit loop**

Find:

```typescript
    try {
      const count = mode === "open" && !repeating ? Math.max(1, Math.min(20, quantity)) : 1
      for (let i = 0; i < count; i++) {
        const res = await fetch(`/api/venues/${venueSlug}/shifts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(mode === "assign" ? { membershipId } : { roleId }),
            scheduledStart,
            scheduledEnd,
            notes: notes || undefined,
            ...(repeating ? { recurrenceRule } : {}),
          }),
        })
```

Replace with:

```typescript
    try {
      const count = mode === "open" ? Math.max(1, Math.min(20, quantity)) : 1
      // Only tag with a shared group when there's actually a group to tag: quantity > 1
      // AND repeating. A single recurring shift (quantity 1) needs no group ID.
      const slotGroupId = mode === "open" && repeating && count > 1 ? crypto.randomUUID() : undefined
      for (let i = 0; i < count; i++) {
        const res = await fetch(`/api/venues/${venueSlug}/shifts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(mode === "assign" ? { membershipId } : { roleId }),
            scheduledStart,
            scheduledEnd,
            notes: notes || undefined,
            ...(repeating ? { recurrenceRule } : {}),
            ...(slotGroupId ? { slotGroupId } : {}),
          }),
        })
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 5: Manually verify in the browser**

Run: `cd apps/web && npm run dev`, open the shifts page, click "Schedule Shift":

- Switch to "Leave open", set quantity to 4, toggle Repeating on, pick Weekly, pick a role, fill in date/time, submit
- Confirm the dialog closes with no error, and the button read "Create 4 Shifts" before submitting
- Query the DB for the 4 newly-created parent shifts (same `scheduledStart`, different `id`s) and confirm they all share the same `slotGroupId`, and that each has its own 6 children via `parentShiftId` (24 child rows total): `SELECT id, "slotGroupId", "parentShiftId" FROM shifts WHERE "createdAt" > now() - interval '2 minutes' ORDER BY "slotGroupId", "parentShiftId" NULLS FIRST;`
- Repeat with quantity left at 1 (default) + repeating on, confirm the created shift has `slotGroupId IS NULL`

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/create-shift-dialog.tsx
git commit -m "feat(shifts): let quantity and repeating combine, tagged with a shared slotGroupId"
```

---

### Task 4: `cancel-group` endpoint

**Files:**

- Create: `apps/web/app/api/venues/[venueId]/shifts/[shiftId]/cancel-group/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logShiftAudit } from "@/lib/shift-audit"

/**
 * POST /api/venues/[venueId]/shifts/[shiftId]/cancel-group
 * Cancels every future, non-terminal occurrence across every recurring series that
 * shares this shift's slotGroupId (e.g. all 4 Greeter slots created together, not just
 * the one that was clicked). Falls back to single-series behavior — identical to
 * cancel-series — when the shift has no slotGroupId. Accepts either a parent shift ID
 * or any child's ID. OWNER/MANAGER only.
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
    const parent = await prisma.shift.findUnique({
      where: { id: parentId },
      select: { slotGroupId: true },
    })

    // Every parent sharing the group tag, or just this one if there's no group.
    const groupParentIds = parent?.slotGroupId
      ? (
          await prisma.shift.findMany({
            where: { venueId: venue.id, slotGroupId: parent.slotGroupId, parentShiftId: null },
            select: { id: true },
          })
        ).map((p) => p.id)
      : [parentId]

    const now = new Date()
    const { count } = await prisma.shift.updateMany({
      where: {
        OR: [{ id: { in: groupParentIds } }, { parentShiftId: { in: groupParentIds } }],
        scheduledStart: { gt: now },
        status: { in: ["OPEN", "CLAIMED", "SCHEDULED"] },
      },
      data: { status: "CANCELLED" },
    })

    for (const id of groupParentIds) {
      await logShiftAudit(id, "CANCEL_SERIES", session.user.id, "web")
    }

    return NextResponse.json({ cancelled: count, seriesCancelled: groupParentIds.length })
  } catch (error) {
    console.error("Error cancelling shift group:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Manually verify**

Using the 4-slot group created in Task 3 Step 5:

```bash
curl -s -X POST http://localhost:3000/api/venues/<venueId>/shifts/<oneOfTheFourParentIds>/cancel-group \
  -H "Cookie: next-auth.session-token=<token>"
```

Expected: `{"cancelled":28,"seriesCancelled":4}` (4 parents × 7 rows each [1 parent + 6 weekly children] = 28)

Verify: `SELECT status, count(*) FROM shifts WHERE "slotGroupId" = '<theGroupId>' OR "parentShiftId" IN (SELECT id FROM shifts WHERE "slotGroupId" = '<theGroupId>') GROUP BY status;`
Expected: all `CANCELLED`

Also verify calling `cancel-group` on a shift with `slotGroupId IS NULL` (a plain single recurring shift) behaves identically to `cancel-series` — cancels just that one series, `seriesCancelled: 1`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/shifts/\[shiftId\]/cancel-group/route.ts
git commit -m "feat(shifts): add cancel-group endpoint for grouped recurring slots"
```

---

### Task 5: UI — second "cancel all slots" button

**Files:**

- Modify: `apps/web/components/delete-shift-button.tsx`

- [ ] **Step 1: Add a `slotGroupId` prop and a second action**

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { Trash2, Repeat, Layers } from "lucide-react"

interface DeleteShiftButtonProps {
  venueSlug: string
  shiftId: string
  hasPayroll: boolean
  isRecurring?: boolean
  slotGroupId?: string | null
}

export function DeleteShiftButton({ venueSlug, shiftId, hasPayroll, isRecurring, slotGroupId }: DeleteShiftButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function cancelVia(endpoint: "cancel-series" | "cancel-group", confirmText: string) {
    if (!confirm(confirmText)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/shifts/${shiftId}/${endpoint}`, {
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
  }

  async function handleDelete() {
    if (isRecurring) {
      await cancelVia("cancel-series", "Cancel this recurring series? All future instances of this slot will be cancelled. This cannot be undone.")
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
    <>
      <Button
        variant="ghost"
        size="sm"
        className={isRecurring ? "text-amber-400 hover:text-amber-400" : "text-destructive hover:text-destructive"}
        onClick={handleDelete}
        disabled={deleting}
        aria-label={isRecurring ? "Cancel this slot" : "Delete shift"}
      >
        {deleting ? "..." : isRecurring ? <Repeat className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
      </Button>
      {isRecurring && slotGroupId && (
        <Button
          variant="ghost"
          size="sm"
          className="text-amber-400 hover:text-amber-400"
          onClick={() => cancelVia("cancel-group", "Cancel all slots in this group? All future instances of every slot will be cancelled. This cannot be undone.")}
          disabled={deleting}
          aria-label="Cancel all slots"
        >
          {deleting ? "..." : <Layers className="h-4 w-4" />}
        </Button>
      )}
    </>
  )
}
```

Note: `isRecurring`'s existing confirm text changed from "Cancel this entire recurring series?" to "Cancel this recurring series? All future instances of **this slot**..." — a small wording clarification so it reads correctly now that a sibling "all slots" action exists next to it. This is the only wording change; behavior is identical to before when `slotGroupId` is absent.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/delete-shift-button.tsx
git commit -m "feat(shifts): add cancel-all-slots button for grouped recurring shifts"
```

---

### Task 6: Wire `slotGroupId` through the shifts page

**Files:**

- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx`

- [ ] **Step 1: Pass the prop**

Find:

```tsx
{
  canManage && (
    <DeleteShiftButton
      venueSlug={slug}
      shiftId={shift.id}
      hasPayroll={false}
      isRecurring={Boolean(shift.recurrenceRule || shift.parentShiftId)}
    />
  )
}
```

Replace with:

```tsx
{
  canManage && (
    <DeleteShiftButton
      venueSlug={slug}
      shiftId={shift.id}
      hasPayroll={false}
      isRecurring={Boolean(shift.recurrenceRule || shift.parentShiftId)}
      slotGroupId={shift.slotGroupId}
    />
  )
}
```

`shift.slotGroupId` is already present on this object — the page's Prisma query uses `include` (not `select`), so every new scalar field on `Shift` (Task 1) comes along automatically, same as `recurrenceRule`/`parentShiftId` did in the base feature. No query change needed.

Note: for a shift that's a _child_ in the group (not the parent), `shift.slotGroupId` will be `null` on that row directly (only parents carry it) — but `DeleteShiftButton`'s "cancel all slots" button only needs to render when clicking a _parent_ shows it, which is the only row rendered in the open-shifts grid for week 1 of each series (children of future weeks aren't shown as a separate clickable row in the current week's view). This matches the existing `isRecurring` check, which already only lights up correctly for whichever row is being rendered — no additional logic needed here, just confirm this during manual testing (Step 2).

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Manually verify in the browser**

With the dev server running and the 4-slot Greeter group still in the DB (recreate it if Task 4's verification cancelled it):

- Open the shifts grid on the week containing the group's parent shifts
- Confirm each of the 4 Greeter chips shows **two** amber icons (`Repeat` and `Layers`)
- Confirm a plain single recurring shift (no group) still shows only the one `Repeat` icon
- Confirm a non-recurring open shift still shows only the red `Trash2` icon
- Click "Cancel all slots" on one of the 4, confirm the warning text, confirm, and verify all 4 series (28 rows) end up `CANCELLED`

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/\[slug\]/shifts/page.tsx
git commit -m "feat(shifts): pass slotGroupId to DeleteShiftButton in the shifts grid"
```

---

## Post-implementation checklist

- [ ] All 6 tasks committed
- [ ] `npm run typecheck` passes clean from a fresh checkout
- [ ] Any test data created during manual verification (Tasks 3, 4, 6) cleaned up from the live database — this plan runs against the same shared Postgres as production, same as the base recurring-shifts plan; delete test shifts, their `pending_notifications`, and `shift_audit_logs` rows before finishing
- [ ] Deploy via `~/bin/deploy-xiv-web.sh` once the branch is merged
