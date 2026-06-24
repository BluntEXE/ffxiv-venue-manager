# Open Shifts Phase 2 — Claim & Approval Flow

**Goal:** Staff members can claim an open shift from the weekly grid. Their claim awaits manager approval; the manager approves or rejects inline. Approved claims convert to SCHEDULED shifts; rejected claims return the slot to OPEN.

**Builds on:** Phase 0+1 (`worktree-open-shifts-phase-0-1`). All changes go into that same worktree.

**Worktree:** `/home/ehno/xiv-app/.claude/worktrees/open-shifts-phase-0-1`

**Architecture decisions:**
- `CLAIMED` is a new status. When claimed: `membershipId` = claimer, `status` = CLAIMED. Shift moves from the "Open shifts" row into the claimant's staff row.
- Approval: manager sets `status = SCHEDULED` (no other field change needed).
- Rejection: `status = OPEN`, `membershipId = null` — slot goes back to the open row.
- No new API routes. Extend existing `PATCH /api/venues/[venueId]/shifts/[shiftId]` with `action: "claim" | "approve" | "reject"`.
- No new pages. Two small client components handle interactivity.

---

### Task 0: Add CLAIMED to ShiftStatus enum

**File:** `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add CLAIMED**

Change:
```prisma
enum ShiftStatus {
  OPEN
  SCHEDULED
```
to:
```prisma
enum ShiftStatus {
  OPEN
  CLAIMED
  SCHEDULED
```

- [ ] **Step 2: Push and regenerate**

```bash
cd ~/xiv-app/.claude/worktrees/open-shifts-phase-0-1/apps/web
npx prisma db push
npx prisma generate
```

Expected: "Your database is now in sync." No data loss — adding an enum value is backward compatible with existing rows.

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app/.claude/worktrees/open-shifts-phase-0-1
git add apps/web/prisma/schema.prisma
git commit -m "schema: add CLAIMED to ShiftStatus for pending claim flow"
```

---

### Task 1: Extend PATCH API — claim, approve, reject

**File:** `apps/web/app/api/venues/[venueId]/shifts/[shiftId]/route.ts`

- [ ] **Step 1: Extend the patchSchema action enum**

Change line 8:
```typescript
const patchSchema = z.object({
  action: z.enum(["clock-in", "clock-out"]),
})
```
to:
```typescript
const patchSchema = z.object({
  action: z.enum(["clock-in", "clock-out", "claim", "approve", "reject"]),
})
```

- [ ] **Step 2: Add claim/approve/reject handlers before the clock-in block**

After the concurrency-safe `const shift = await prisma.shift.findFirst(...)` (line ~51) and the existing ownership check, add three new branches. Insert before `const now = new Date()`:

```typescript
    // --- CLAIM ---
    if (parsed.data.action === "claim") {
      if (shift.status !== "OPEN") {
        return NextResponse.json(
          { error: `Shift is already ${shift.status.toLowerCase()}` },
          { status: 400 }
        )
      }
      // Optimistic lock: only succeeds if shift is still OPEN (race with another claimer)
      const result = await prisma.shift.updateMany({
        where: { id: shift.id, status: "OPEN" },
        data: { membershipId: membership.id, status: "CLAIMED" },
      })
      if (result.count === 0) {
        return NextResponse.json(
          { error: "This shift was just claimed by someone else" },
          { status: 409 }
        )
      }
      return NextResponse.json({ success: true, shift: { id: shift.id, status: "CLAIMED" } })
    }

    // --- APPROVE ---
    if (parsed.data.action === "approve") {
      if (!isManager) {
        return NextResponse.json({ error: "Only managers can approve claims" }, { status: 403 })
      }
      if (shift.status !== "CLAIMED") {
        return NextResponse.json(
          { error: `Shift is ${shift.status.toLowerCase()}, not claimed` },
          { status: 400 }
        )
      }
      const result = await prisma.shift.updateMany({
        where: { id: shift.id, status: "CLAIMED" },
        data: { status: "SCHEDULED" },
      })
      if (result.count === 0) {
        return NextResponse.json({ error: "Shift status changed concurrently" }, { status: 409 })
      }
      // Queue reminder for the approved staff member
      const claimant = await prisma.membership.findUnique({
        where: { id: shift.membershipId! },
        select: { userId: true },
      })
      if (claimant?.userId) {
        const reminderAt = new Date(shift.scheduledStart.getTime() - 60 * 60 * 1000)
        if (reminderAt > new Date()) {
          prisma.pendingNotification.create({
            data: {
              userId: claimant.userId,
              type: "SHIFT_REMINDER",
              title: "Shift starting soon",
              body: `Your shift at ${venue.name} starts in 1 hour.`,
              data: { venueId: venue.id, shiftId: shift.id },
              scheduledFor: reminderAt,
            },
          }).catch(() => {})
        }
      }
      return NextResponse.json({ success: true, shift: { id: shift.id, status: "SCHEDULED" } })
    }

    // --- REJECT ---
    if (parsed.data.action === "reject") {
      if (!isManager) {
        return NextResponse.json({ error: "Only managers can reject claims" }, { status: 403 })
      }
      if (shift.status !== "CLAIMED") {
        return NextResponse.json(
          { error: `Shift is ${shift.status.toLowerCase()}, not claimed` },
          { status: 400 }
        )
      }
      const result = await prisma.shift.updateMany({
        where: { id: shift.id, status: "CLAIMED" },
        data: { membershipId: null, status: "OPEN" },
      })
      if (result.count === 0) {
        return NextResponse.json({ error: "Shift status changed concurrently" }, { status: 409 })
      }
      return NextResponse.json({ success: true, shift: { id: shift.id, status: "OPEN" } })
    }
```

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app/.claude/worktrees/open-shifts-phase-0-1
git add apps/web/app/api/venues/\[venueId\]/shifts/\[shiftId\]/route.ts
git commit -m "feat: extend shift PATCH to support claim/approve/reject actions"
```

---

### Task 2: OpenShiftChip — staff claim button

**New file:** `apps/web/components/open-shift-chip.tsx`

This client component replaces the static `<span>` in the open shifts row. Staff see a Claim button; managers see the chip only.

- [ ] **Step 1: Create the component**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface OpenShiftChipProps {
  shiftId: string
  venueId: string
  timeLabel: string   // e.g. "19:00–23:00 · Bartender"
  canClaim: boolean   // false for managers — they see the chip but can't claim
}

export function OpenShiftChip({ shiftId, venueId, timeLabel, canClaim }: OpenShiftChipProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClaim() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/venues/${venueId}/shifts/${shiftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim" }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Failed to claim shift")
      setLoading(false)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="shift-chip op">{timeLabel}</span>
      {canClaim && (
        <button
          onClick={handleClaim}
          disabled={loading}
          className="text-[0.62rem] font-semibold px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50 self-start"
        >
          {loading ? "Claiming..." : "Claim"}
        </button>
      )}
      {error && <p className="text-[0.6rem] text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Update the open shifts row in shifts/page.tsx**

First, import the component (add to existing imports at top of file):
```typescript
import { OpenShiftChip } from "@/components/open-shift-chip"
```

Change the open shifts chip render (around line 341) from:
```tsx
                      {dayShifts.map((shift) => (
                        <span key={shift.id} className="shift-chip op">
                          {fmtHour(shift.scheduledStart)}–{fmtHour(shift.scheduledEnd)}
                          {shift.role?.name ? ` · ${shift.role.name}` : ""}
                        </span>
                      ))}
```
to:
```tsx
                      {dayShifts.map((shift) => (
                        <OpenShiftChip
                          key={shift.id}
                          shiftId={shift.id}
                          venueId={venue.id}
                          timeLabel={`${fmtHour(shift.scheduledStart)}–${fmtHour(shift.scheduledEnd)}${shift.role?.name ? ` · ${shift.role.name}` : ""}`}
                          canClaim={!canManage}
                        />
                      ))}
```

Note: `canManage` is already computed at line 88. Managers see the chip but no claim button. Staff see the Claim button.

- [ ] **Step 3: Also filter openShiftsByDay by status instead of membershipId**

The current build loop (line ~174) uses `if (shift.membershipId) continue` to exclude claimed/assigned shifts from the open row. A CLAIMED shift has membershipId set, so it already works — but change the guard to be explicit about intent:

```typescript
  for (const shift of weekShifts) {
    if (shift.status !== "OPEN") continue  // only OPEN (not CLAIMED or assigned) go in this row
```

This also ensures that if a shift somehow ends up CLAIMED with no membershipId (shouldn't happen but defensive), it doesn't appear in the wrong row.

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app/.claude/worktrees/open-shifts-phase-0-1
git add apps/web/components/open-shift-chip.tsx apps/web/app/dashboard/\[slug\]/shifts/page.tsx
git commit -m "feat: staff can claim open shifts from the weekly grid"
```

---

### Task 3: CLAIMED chip style + manager approve/reject

**Files:**
- `apps/web/app/dashboard/[slug]/shifts/page.tsx` — import new component, use for CLAIMED chips
- New: `apps/web/components/claimed-shift-chip.tsx`

CLAIMED chips appear in staff rows (the claimer's row). Managers see Approve/Reject buttons inline.

- [ ] **Step 1: Create ClaimedShiftChip component**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface ClaimedShiftChipProps {
  shiftId: string
  venueId: string
  timeLabel: string
  canManage: boolean  // shows approve/reject if true
}

export function ClaimedShiftChip({ shiftId, venueId, timeLabel, canManage }: ClaimedShiftChipProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAction(action: "approve" | "reject") {
    setLoading(action)
    setError(null)
    const res = await fetch(`/api/venues/${venueId}/shifts/${shiftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Failed")
      setLoading(null)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="shift-chip bg-violet-500/10 text-violet-400 border-violet-500/20">
        {timeLabel}
      </span>
      {canManage && (
        <div className="flex gap-1">
          <button
            onClick={() => handleAction("approve")}
            disabled={loading !== null}
            className="text-[0.62rem] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {loading === "approve" ? "..." : "Approve"}
          </button>
          <button
            onClick={() => handleAction("reject")}
            disabled={loading !== null}
            className="text-[0.62rem] font-semibold px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {loading === "reject" ? "..." : "Reject"}
          </button>
        </div>
      )}
      {error && <p className="text-[0.6rem] text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Import and use in staff rows**

Add import:
```typescript
import { ClaimedShiftChip } from "@/components/claimed-shift-chip"
```

In the staff row chip render (around line 312-319), change:
```tsx
                        <span
                          key={shift.id}
                          className={`shift-chip${shift.status === "ACTIVE" ? " em" : shift.status === "MISSED" ? " am" : ""}`}
                        >
                          {fmtHour(shift.scheduledStart)}–{fmtHour(shift.scheduledEnd)}
                        </span>
```
to:
```tsx
                        shift.status === "CLAIMED" ? (
                          <ClaimedShiftChip
                            key={shift.id}
                            shiftId={shift.id}
                            venueId={venue.id}
                            timeLabel={`${fmtHour(shift.scheduledStart)}–${fmtHour(shift.scheduledEnd)}`}
                            canManage={canManage}
                          />
                        ) : (
                          <span
                            key={shift.id}
                            className={`shift-chip${shift.status === "ACTIVE" ? " em" : shift.status === "MISSED" ? " am" : ""}`}
                          >
                            {fmtHour(shift.scheduledStart)}–{fmtHour(shift.scheduledEnd)}
                          </span>
                        )
```

Note: `key` must be on the outermost element — move it to the `<ClaimedShiftChip>` and remove from inner `<span>` when using the ternary, or wrap in a fragment with key. Simpler: wrap both branches in `<React.Fragment key={shift.id}>` and remove individual keys.

- [ ] **Step 3: Update KPI to count CLAIMED as "needs attention"**

Currently `openSlots` counts only `OPEN`. Update to include `CLAIMED` since both represent unfilled or unapproved slots:

```typescript
  const openSlots = weekShifts.filter((s) => s.status === "OPEN" || s.status === "CLAIMED").length
```

This makes the KPI reflect "shifts that still need manager action" — either nobody claimed them (OPEN) or someone claimed and awaits approval (CLAIMED).

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app/.claude/worktrees/open-shifts-phase-0-1
git add apps/web/components/claimed-shift-chip.tsx apps/web/app/dashboard/\[slug\]/shifts/page.tsx
git commit -m "feat: CLAIMED chip with inline approve/reject for managers"
```

---

### Task 4: End-to-end browser test

- [ ] **Step 1: Start dev server**

```bash
cd ~/xiv-app/.claude/worktrees/open-shifts-phase-0-1/apps/web && npm run dev
```

- [ ] **Step 2: Test staff claim flow**

Log in as a STAFF member (not OWNER/MANAGER). Navigate to a venue's Shifts page.
- Open shifts row shows amber dashed chips.
- Each chip has a "Claim" button below it.
- Click Claim on an open shift.
- Expected: chip disappears from open row, appears in your staff row as violet "CLAIMED" chip.

- [ ] **Step 3: Test manager approve flow**

Log in as OWNER/MANAGER. Navigate to same Shifts page.
- CLAIMED chip in the staff row shows violet style + "Approve" and "Reject" buttons.
- Click Approve.
- Expected: chip changes to blue SCHEDULED, buttons disappear.

- [ ] **Step 4: Test manager reject flow**

Create another open shift. Have staff claim it. As manager, click Reject.
- Expected: chip returns to open shifts row as amber dashed OPEN chip with Claim button.

- [ ] **Step 5: Test race condition (manual)**

Two browser tabs logged in as two different staff members on the same venue. Both see the same open shift. Click Claim in both tabs rapidly.
- Expected: one succeeds, one gets "This shift was just claimed by someone else" error below the chip.

- [ ] **Step 6: Test mobile (375px)**

Open DevTools, set to 375x667. Confirm:
- Open shifts row chips + claim buttons don't overflow or break grid.
- CLAIMED chips + approve/reject buttons fit within the cell or wrap gracefully.
- No horizontal scroll introduced beyond the existing `overflow-x-auto` on the grid.

---

### Task 5: Merge to main

Once all flows verified:

- [ ] **Step 1: Check for drift**

```bash
cd ~/xiv-app && git log --oneline main..worktree-open-shifts-phase-0-1
```

If main has commits that aren't in the worktree branch, rebase: `git -C .claude/worktrees/open-shifts-phase-0-1 rebase origin/main`.

- [ ] **Step 2: Merge**

```bash
cd ~/xiv-app && git merge worktree-open-shifts-phase-0-1 --no-ff -m "feat: open shifts phase 0-2 (create, claim, approve/reject)"
```

- [ ] **Step 3: Deploy**

```bash
ssh server@192.168.1.122
cd ~/xiv-app && git pull
docker compose build venue-manager && docker compose up -d venue-manager
```

---

## Out of scope (later phases)
- Staff notification when a claim is approved/rejected
- Reopen an already-SCHEDULED shift back to OPEN
- Minimum-headcount rules per venue/role
- Plugin and mobile surfaces for claiming
- Manager notification when a staff member claims a shift
