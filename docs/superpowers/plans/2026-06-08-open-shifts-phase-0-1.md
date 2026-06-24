# Open Shifts (Phase 0 + 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let managers create a shift that has no staff member assigned yet — only a required role — laying the groundwork for "short staffed" detection (later phases: claiming, minimum-headcount rules, notifications).

**Architecture:** Loosen `Shift.membershipId` to optional, add `roleId` (which `Role` is required for the slot) and an `OPEN` status. Extend the existing create-shift API and dialog to support "leave open, require role X" as an alternative to "assign to person Y". Render open shifts in the existing weekly grid as their own row.

**Tech Stack:** Next.js 15 App Router, Prisma (Postgres, `db push` workflow — no migration files), Zod validation, shadcn/ui (`Select`, `Dialog`), existing `--xiv-blue` design tokens.

**Note on process:** This codebase has no unit-test suite for backend logic (only one Playwright smoke test for public pages). Steps below substitute "verify by running the dev server and exercising the flow" for the red/green unit-test cycle — that matches how this project is actually built and verified.

---

### Task 0: Schema change — optional `membershipId`, add `roleId` + `OPEN` status

**Files:**
- Modify: `apps/web/prisma/schema.prisma:681-719` (ShiftStatus enum + Shift model)

- [ ] **Step 1: Add `OPEN` to `ShiftStatus`**

In `apps/web/prisma/schema.prisma`, change:

```prisma
enum ShiftStatus {
  SCHEDULED
  ACTIVE
  COMPLETED
  MISSED
  CANCELLED
}
```

to:

```prisma
enum ShiftStatus {
  OPEN
  SCHEDULED
  ACTIVE
  COMPLETED
  MISSED
  CANCELLED
}
```

- [ ] **Step 2: Make `membershipId` optional and add `roleId`**

Change the `Shift` model fields:

```prisma
model Shift {
  id             String      @id @default(cuid())
  venueId        String
  membershipId   String?
  roleId         String?
  payrollEntryId String? // Links to the payroll entry that paid for this shift
```

(only `membershipId` and the new `roleId` line change — everything else in the block stays as-is)

- [ ] **Step 3: Add the `Role` relation and an index**

In the relations block of `Shift`, add a `role` relation next to the existing `membership` relation:

```prisma
  venue        Venue         @relation(fields: [venueId], references: [id], onDelete: Cascade)
  membership   Membership?   @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  role         Role?         @relation(fields: [roleId], references: [id], onDelete: SetNull)
  payrollEntry PayrollEntry? @relation(fields: [payrollEntryId], references: [id], onDelete: SetNull)

  @@index([venueId, scheduledStart])
  @@index([membershipId, status])
  @@index([venueId, status])
  @@index([payrollEntryId])
  @@index([roleId])
  @@map("shifts")
```

Note `membership` becomes `Membership?` (optional) to match the now-nullable `membershipId`.

- [ ] **Step 4: Add the back-relation on `Role`**

Find `model Role` (around line 251) and add `shifts Shift[]` to its relations block, alongside the existing `memberships Membership[]`:

```prisma
  venue         Venue        @relation(fields: [venueId], references: [id], onDelete: Cascade)
  memberships   Membership[]
  shifts        Shift[]
```

- [ ] **Step 5: Push schema to the database**

Run from `apps/web`:

```bash
cd ~/xiv-app/apps/web && npx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema." No data loss warning — `membershipId` is widening from required to optional, which is backward compatible with existing rows.

- [ ] **Step 6: Regenerate the Prisma client**

```bash
cd ~/xiv-app/apps/web && npx prisma generate
```

Expected: "Generated Prisma Client" with no errors. This makes `membershipId`/`membership` typed as nullable and `roleId`/`role` available on `Shift` throughout the codebase — TypeScript will now flag every place that assumed `shift.membership` is always present.

- [ ] **Step 7: Commit**

```bash
cd ~/xiv-app && git add apps/web/prisma/schema.prisma
git commit -m "schema: allow shifts to exist without an assigned member (open shifts)"
```

---

### Task 1: Fix the type fallout from the nullable relation

Regenerating the client (Task 0, Step 6) will surface every spot that reads `shift.membership.*` or `shift.membershipId` without a null check. Two known call sites:

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/shifts/route.ts:73-78` (GET response mapping)
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx:163-178` (staff × day grid build)

- [ ] **Step 1: Run the type checker to find every affected site**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit 2>&1 | grep -i shift
```

Expected: a list of file:line errors like `Property 'user' does not exist on type 'Membership | null'`. Use this list as the authoritative set — it will catch any spot this plan doesn't enumerate (e.g. plugin/mobile shift routes).

- [ ] **Step 2: Fix the GET mapping in `shifts/route.ts`**

Change the response mapper (around line 73) from:

```typescript
      shifts: shifts.map((s) => ({
        id: s.id,
        membershipId: s.membershipId,
        staffName: s.membership.user?.name ?? "Unknown",
        staffImage: s.membership.user?.image ?? null,
```

to:

```typescript
      shifts: shifts.map((s) => ({
        id: s.id,
        membershipId: s.membershipId,
        staffName: s.membership?.user?.name ?? null,
        staffImage: s.membership?.user?.image ?? null,
        roleId: s.roleId,
        roleName: s.role?.name ?? null,
```

This also requires adding `role: { select: { id: true, name: true, color: true } }` to the `include` block at line ~58, alongside the existing `membership` include. `staffName` changes from `"Unknown"` fallback to `null` — `null` means "nobody assigned", which the frontend can render distinctly from a real "Unknown" user.

- [ ] **Step 3: Fix the staff × day grid build in `shifts/page.tsx`**

The loop at line 163 (`for (const shift of weekShifts)`) currently assumes every shift has a `membershipId`. Guard it:

```typescript
  for (const shift of weekShifts) {
    if (!shift.membershipId) continue // open shifts get their own row, built separately below
    const mid = shift.membershipId
    if (!staffMap.has(mid)) {
      staffMap.set(mid, {
        membershipId: mid,
        name: shift.membership!.user?.name ?? "Unknown",
        image: shift.membership!.user?.image ?? null,
        cells: new Map(),
      })
    }
    const member = staffMap.get(mid)!
    const key = utcDayKey(new Date(shift.scheduledStart))
    if (!member.cells.has(key)) member.cells.set(key, [])
    member.cells.get(key)!.push(shift)
  }
```

(`shift.membership!` is safe here — we just confirmed `membershipId` is set, and the relation is `onDelete: Cascade` so it can't be null when the FK is set)

- [ ] **Step 4: Re-run the type checker to confirm the fixes are complete**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit 2>&1 | grep -i shift
```

Expected: no output (no shift-related errors remain). If other files appear (mobile/plugin shift routes), apply the same `?.`/null-guard pattern there — they only ever read assigned shifts today, so a guard is a safety net, not new behavior.

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app && git add -A
git commit -m "fix: guard shift.membership access now that shifts can be unassigned"
```

---

### Task 2: API — accept "open, role required" when creating a shift

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/shifts/route.ts:99-186` (POST handler)

- [ ] **Step 1: Update the request schema to allow either a member or a role**

Replace the `createShiftSchema` (around line 99):

```typescript
const createShiftSchema = z
  .object({
    membershipId: z.string().min(1).optional(),
    roleId: z.string().min(1).optional(),
    scheduledStart: z.string().datetime(),
    scheduledEnd: z.string().datetime(),
    notes: z.string().optional(),
  })
  .refine((data) => data.membershipId || data.roleId, {
    message: "Either membershipId (assign now) or roleId (leave open) is required",
  })
```

- [ ] **Step 2: Branch the creation logic on which one was supplied**

Replace the body from "Verify the target membership..." (around line 138) through the `prisma.shift.create` call (around line 162) with:

```typescript
    let targetMembership: { userId: string | null } | null = null
    let roleId: string | null = null

    if (parsed.data.membershipId) {
      // Assigning to a specific person — verify they belong to this venue
      const member = await prisma.membership.findFirst({
        where: { id: parsed.data.membershipId, venueId: venue.id, status: "active" },
        select: { userId: true },
      })
      if (!member) {
        return NextResponse.json(
          { error: "Staff member not found at this venue" },
          { status: 400 }
        )
      }
      targetMembership = member
    } else if (parsed.data.roleId) {
      // Leaving the shift open — verify the role belongs to this venue
      const role = await prisma.role.findFirst({
        where: { id: parsed.data.roleId, venueId: venue.id },
        select: { id: true },
      })
      if (!role) {
        return NextResponse.json(
          { error: "Role not found at this venue" },
          { status: 400 }
        )
      }
      roleId = role.id
    }

    const scheduledStart = new Date(parsed.data.scheduledStart)
    const shift = await prisma.shift.create({
      data: {
        venueId: venue.id,
        membershipId: parsed.data.membershipId ?? null,
        roleId,
        status: parsed.data.membershipId ? "SCHEDULED" : "OPEN",
        scheduledStart,
        scheduledEnd: new Date(parsed.data.scheduledEnd),
        notes: parsed.data.notes ?? null,
      },
    })

    // Queue shift reminder 1 hour before start — only meaningful for assigned shifts
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

    return NextResponse.json({ shift }, { status: 201 })
```

Note: the `include: { membership: { select: { userId: true } } }` on the original `prisma.shift.create` is dropped — we already fetched `targetMembership` separately above, so the extra include would be redundant.

- [ ] **Step 3: Verify by hand with curl**

Start the dev server (`cd ~/xiv-app/apps/web && npm run dev`), grab a session cookie from the browser devtools for an OWNER/MANAGER account, then:

```bash
curl -s -X POST http://localhost:3000/api/venues/<venueId>/shifts \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"roleId":"<a-real-role-id>","scheduledStart":"2026-06-15T22:00:00Z","scheduledEnd":"2026-06-16T02:00:00Z"}' | head -c 500
```

Expected: `201` with `"status":"OPEN"`, `"membershipId":null`, `"roleId":"<a-real-role-id>"`. Then repeat with `"membershipId":"<a-real-membership-id>"` instead — expect `"status":"SCHEDULED"` and `"roleId":null`.

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app && git add apps/web/app/api/venues/\[venueId\]/shifts/route.ts
git commit -m "feat: allow creating open shifts that require a role instead of a specific person"
```

---

### Task 3: Dialog UI — "assign now" vs. "leave open, require role"

**Files:**
- Modify: `apps/web/components/create-shift-dialog.tsx`
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx:217-225` (pass roles into the dialog)

- [ ] **Step 1: Fetch venue roles and pass them to the dialog**

In `shifts/page.tsx`, alongside the existing `activeStaff` query (around line 137), add:

```typescript
  const venueRoles = await prisma.role.findMany({
    where: { venueId: venue.id },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  })
```

Then in the JSX where `<CreateShiftDialog ... />` is rendered (around line 220), add the `roles` prop:

```typescript
            <CreateShiftDialog
              venueSlug={slug}
              staff={staffForDialog}
              roles={venueRoles}
              timezone={timezone}
              tzLabel={tzLabel}
            />
```

- [ ] **Step 2: Add a mode toggle and role select to the dialog**

In `create-shift-dialog.tsx`, add a `Role` type and extend `CreateShiftDialogProps`:

```typescript
interface RoleOption {
  id: string
  name: string
  color: string | null
}

interface CreateShiftDialogProps {
  venueSlug: string
  staff: StaffMember[]
  roles: RoleOption[]
  timezone?: string
  tzLabel?: string
}
```

Update the component signature and add state for the mode and selected role:

```typescript
export function CreateShiftDialog({ venueSlug, staff, roles }: CreateShiftDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<"assign" | "open">("assign")
  const [membershipId, setMembershipId] = useState("")
  const [roleId, setRoleId] = useState("")
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("19:00")
  const [endTime, setEndTime] = useState("23:00")
  const [notes, setNotes] = useState("")
```

- [ ] **Step 3: Update validation and the request body in `handleSubmit`**

Replace the top of `handleSubmit`:

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
```

And the fetch body:

```typescript
        body: JSON.stringify({
          ...(mode === "assign" ? { membershipId } : { roleId }),
          scheduledStart,
          scheduledEnd,
          notes: notes || undefined,
        }),
```

Update the reset block after a successful submit to also clear the new fields:

```typescript
      setMode("assign")
      setMembershipId("")
      setRoleId("")
      setDate("")
```

- [ ] **Step 4: Add the mode toggle and conditional select to the form JSX**

Replace the "Staff Member" `<Select>` block (the first `<div className="space-y-2">` inside the form) with:

```tsx
          <div className="space-y-2">
            <Label>Assignment</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "assign" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("assign")}
              >
                Assign to staff member
              </Button>
              <Button
                type="button"
                variant={mode === "open" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("open")}
              >
                Leave open (require role)
              </Button>
            </div>
          </div>

          {mode === "assign" ? (
            <div className="space-y-2">
              <Label htmlFor="staff">Staff Member</Label>
              <Select value={membershipId} onValueChange={setMembershipId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="role">Required Role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select required role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No custom roles set up yet — create one in Staff settings first.
                </p>
              )}
            </div>
          )}
```

- [ ] **Step 5: Update the dialog title/description to reflect both modes**

Change:

```tsx
          <DialogTitle>Schedule a Shift</DialogTitle>
          <DialogDescription>
            Assign a staff member to work a specific time slot.
          </DialogDescription>
```

to:

```tsx
          <DialogTitle>Schedule a Shift</DialogTitle>
          <DialogDescription>
            Assign a staff member now, or leave the slot open for a specific role to be filled later.
          </DialogDescription>
```

- [ ] **Step 6: Run dev server, exercise both flows in the browser**

```bash
cd ~/xiv-app/apps/web && npm run dev
```

Open the Shifts page as an OWNER/MANAGER, click "Schedule Shift":
- Default mode "Assign to staff member" — pick a person, submit, confirm it appears as a `SCHEDULED` chip in that person's row (matches existing behavior, regression check).
- Switch to "Leave open (require role)" — pick a role, submit, confirm the dialog closes without error and `router.refresh()` reloads the page.

- [ ] **Step 7: Commit**

```bash
cd ~/xiv-app && git add apps/web/components/create-shift-dialog.tsx apps/web/app/dashboard/\[slug\]/shifts/page.tsx
git commit -m "feat: add 'leave open, require role' mode to the create-shift dialog"
```

---

### Task 4: Render open shifts in the weekly grid

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx`

- [ ] **Step 1: Collect open shifts per day, separate from the staff rows**

After the staff-row build loop (the one guarded in Task 1, Step 3), add:

```typescript
  // Open shifts (no member assigned yet) — shown in their own row, grouped by required role
  const openShiftsByDay = new Map<string, ShiftRow[]>()
  for (const shift of weekShifts) {
    if (shift.membershipId) continue
    const key = utcDayKey(new Date(shift.scheduledStart))
    if (!openShiftsByDay.has(key)) openShiftsByDay.set(key, [])
    openShiftsByDay.get(key)!.push(shift)
  }
  const hasOpenShifts = openShiftsByDay.size > 0
```

- [ ] **Step 2: Add a chip style for open shifts**

In the `statusChip` map near the top of the file, add an entry for `OPEN`:

```typescript
const statusChip: Record<string, string> = {
  OPEN:      "bg-amber-500/10 text-amber-400 border-amber-500/20 border-dashed",
  SCHEDULED: "bg-[rgba(0,180,255,0.10)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.28)]",
  ACTIVE:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  MISSED:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CANCELLED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/15 line-through",
}
```

(dashed amber border visually distinguishes "needs filling" from "filled but missed", which both use amber tones)

- [ ] **Step 3: Render an "Open shifts" row at the bottom of the grid**

Inside the grid, immediately after the closing of the `staffRows.map(...)` block and before the "Empty state" div, add:

```tsx
            {hasOpenShifts && (
              <>
                <div key="open-shifts-name" className="sg-staff">
                  <span className="av-sm flex-shrink-0 border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-400">
                    !
                  </span>
                  <span className="truncate text-amber-400">Open shifts</span>
                </div>
                {weekDays.map((day) => {
                  const key = utcDayKey(day)
                  const dayShifts = openShiftsByDay.get(key) ?? []
                  const isToday = key === todayKey
                  return (
                    <div key={`open-${key}`} className={`sg-cell${isToday ? " today-col" : ""}`}>
                      {dayShifts.map((shift) => (
                        <span key={shift.id} className={`shift-chip ${statusChip.OPEN}`}>
                          {fmtHour(shift.scheduledStart)}–{fmtHour(shift.scheduledEnd)}
                          {shift.role?.name ? ` · ${shift.role.name}` : ""}
                        </span>
                      ))}
                    </div>
                  )
                })}
              </>
            )}
```

This requires `role: { select: { name: true } }` to be added to the `include` on the `weekShifts` query (around line 117) — add it alongside the existing `membership` include:

```typescript
      include: {
        membership: { include: { user: { select: { id: true, name: true, image: true } } } },
        role: { select: { name: true } },
      },
```

- [ ] **Step 4: Update the "Open shifts" KPI to count actual `OPEN` shifts, not `MISSED`**

The KPI at line ~178 currently conflates "open" with "missed":

```typescript
  const openSlots = weekShifts.filter((s) => s.status === "MISSED").length
```

This was a placeholder before `OPEN` existed — it should count the new status:

```typescript
  const openSlots = weekShifts.filter((s) => s.status === "OPEN").length
  const missedCount = weekShifts.filter((s) => s.status === "MISSED").length
```

Update the `coverPct` calculation (which referenced `openSlots` to mean "uncovered") to use `missedCount` instead, since coverage is about shifts that were scheduled-but-not-worked, not about not-yet-filled slots:

```typescript
  const coverPct =
    weekShifts.length === 0
      ? 100
      : Math.round(((weekShifts.length - missedCount) / weekShifts.length) * 100)
```

- [ ] **Step 5: Run dev server, verify visually against the design system**

```bash
cd ~/xiv-app/apps/web && npm run dev
```

Create an open shift via the dialog (Task 3), then on the Shifts page confirm:
- An "Open shifts" row appears below the staff rows, only when there's at least one open shift this week.
- The chip shows time range + role name, with the dashed-amber styling (distinct from blue `SCHEDULED` and solid-amber `MISSED`).
- The "Open shifts" KPI number matches the count of `OPEN`-status chips visible in the grid.
- Mobile width (375px, per [[feedback_mobile_responsive_patterns]]): row doesn't break the grid layout — check `overflow-x-auto` on the grid container handles it the same way staff rows do.

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app && git add -A
git commit -m "feat: show open shifts in the weekly schedule grid"
```

---

## Self-Review Notes

- **Spec coverage:** Phase 0 (schema: nullable membership, roleId, OPEN status) → Task 0. Phase 1 (manager creates open shift requiring a role, matching design) → Tasks 2-4. Type fallout from the schema change → Task 1 (not in original roadmap, but required — `tsc --noEmit` makes it self-discovering rather than guesswork).
- **Out of scope for this plan (later phases):** staff self-claim + manager approval, reopening an assigned shift, minimum-headcount rules, notification dispatch, mobile/plugin surfaces. Each becomes its own plan once this lands and is demoable.
- **Type consistency check:** `roleId`/`role.name` naming matches the `Role` model fields (`id`, `name`, `color`) defined in `schema.prisma:251-263`. `ShiftRow` type (defined in the page as `(typeof weekShifts)[0]`) automatically picks up the new `role` include — no separate type to keep in sync.
