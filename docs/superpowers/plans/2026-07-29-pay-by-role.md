# Pay by Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let custom Roles (Bartender, Greeter, etc.) carry a default hourly rate, let assigned shifts optionally be tagged with a role, and make payroll generation resolve pay per shift (shift's tagged role rate → person's own rate → their primary role's rate) instead of one flat rate per member per period.

**Architecture:** One new nullable `Role.hourlyRate` field, a small shared rate-resolution helper (`lib/payroll-rates.ts`) used by both payroll routes, a relaxed shift-creation validation rule (role becomes optional-but-allowed on assigned shifts instead of mutually exclusive with a person), and a UI field on the roles management page.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (`db push`, no migration files), Zod, `Prisma.Decimal`. Same as prior plans in this project: **no unit test framework in `apps/web`** — verification via `pnpm --filter web typecheck` / `npm run typecheck`, `tsx` for pure-function checks, `curl`, and direct Postgres queries.

**Branch:** this is a separate, unrelated feature from the just-shipped recurring-shifts work. Start from a fresh worktree/branch off `main` (which already has the recurring-shifts feature merged in) rather than continuing on `worktree-feat+recurring-shifts`.

---

## File Structure

- Modify: `apps/web/prisma/schema.prisma` — add `hourlyRate` to `Role`
- Create: `apps/web/lib/payroll-rates.ts` — shared per-shift rate resolution logic, used by both payroll routes
- Modify: `apps/web/app/api/venues/[venueId]/shifts/route.ts` — relax `membershipId`/`roleId` validation, verify role independently of assign/open mode
- Modify: `apps/web/components/create-shift-dialog.tsx` — optional role select in assign mode
- Modify: `apps/web/app/api/venues/[venueId]/roles/route.ts` — accept `hourlyRate` on role creation
- Modify: `apps/web/app/api/venues/[venueId]/roles/[roleId]/route.ts` — accept `hourlyRate` on role update
- Modify: `apps/web/app/dashboard/[slug]/staff/roles/page.tsx` — hourly rate field in create/edit dialogs, shown on role cards
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts` — per-shift resolution in POST and GET preview
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate-all/route.ts` — per-shift resolution in GET preview and POST

---

### Task 1: Schema — add `hourlyRate` to `Role`

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (the `Role` model)

- [ ] **Step 1: Add the field**

Find:

```prisma
model Role {
  id               String  @id @default(cuid())
  venueId          String
  name             String
  color            String? @default("#6366f1")
  responsibilities String? @db.Text
  permissions      Json    @default("{}")
```

Replace with:

```prisma
model Role {
  id               String   @id @default(cuid())
  venueId          String
  name             String
  color            String?  @default("#6366f1")
  responsibilities String?  @db.Text
  permissions      Json     @default("{}")
  hourlyRate       Decimal? @db.Decimal(10, 2)
```

(Only the alignment of the existing lines shifts slightly to line up with the new `Decimal?` type column — content is unchanged except for the new line.)

- [ ] **Step 2: Validate and regenerate the client**

Run: `cd apps/web && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

Run: `cd apps/web && npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors

- [ ] **Step 3: Back up the database before pushing**

Live, single-instance Postgres, no migrations table — `db push` applies directly.

Run (on the server, via SSH): `docker exec postgres pg_dump -U postgres venue_manager > ~/backups/venue_manager_$(date +%Y%m%d_%H%M%S).sql`
Expected: a non-empty `.sql` file in `~/backups/`

- [ ] **Step 4: Dry-run the diff before pushing**

Open a tunnel to the server's Postgres: `ssh -f -N -L 5432:192.168.1.122:5432 -o ExitOnForwardFailure=yes server@192.168.1.122`

With `DATABASE_URL` pointed at that tunnel (matching `apps/web/.env.local`):

```bash
cd apps/web
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected: the only change shown is `ALTER TABLE "roles" ADD COLUMN "hourlyRate" DECIMAL(10,2);` (or equivalent single additive column). **If anything else appears — any DROP, any other table — STOP and do not push**, and investigate why before proceeding (a prior incident in this project was caused by pushing without this check).

- [ ] **Step 5: Push**

Run: `cd apps/web && npm run db:push` (with `DATABASE_URL` still pointed at the tunnel)
Expected: `🚀 Your database is now in sync with your Prisma schema.` — one column added, nothing dropped

- [ ] **Step 6: Verify the column exists**

Run: `docker exec postgres psql -U postgres -d venue_manager -c "\d roles" | grep hourlyRate` (via SSH on the server, or through the tunnel with local `psql`)
Expected: column listed

- [ ] **Step 7: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat(payroll): add hourlyRate to Role for role-based default pay"
```

---

### Task 2: Shared per-shift rate resolution helper

**Files:**
- Create: `apps/web/lib/payroll-rates.ts`

- [ ] **Step 1: Write the helper**

```typescript
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"

const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>

export interface ShiftForRateResolution {
  id: string
  roleId: string | null
  actualStart: Date | null
  actualEnd: Date | null
}

export interface RateResolvedShift {
  id: string
  hours: Decimal
  rate: Decimal | null // null = no rate could be resolved anywhere in the chain
}

export interface RateResolutionResult {
  resolved: RateResolvedShift[]
  includedShiftIds: string[]
  excludedShiftIds: string[]
  totalHours: Decimal
  totalAmount: Decimal
}

/**
 * Fetches hourlyRate for a set of role IDs, deduplicated. Pass every roleId you might
 * need to look up — shift.roleId values and membership.roleId — collected up front so
 * this runs once per payroll request instead of once per shift.
 */
export async function fetchRoleRates(roleIds: (string | null)[]): Promise<Map<string, Decimal | null>> {
  const uniqueIds = [...new Set(roleIds.filter((id): id is string => id !== null))]
  if (uniqueIds.length === 0) return new Map()

  const roles = await prisma.role.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, hourlyRate: true },
  })
  return new Map(roles.map((r) => [r.id, r.hourlyRate]))
}

/**
 * Resolves a pay rate for each shift, in order: the shift's own tagged role rate,
 * then the person's personal rate, then their primary custom role's rate. Shifts that
 * resolve to no rate anywhere in that chain are excluded from the totals — the caller
 * should leave those shifts unlinked from the payroll entry (payrollEntryId stays null)
 * so they remain eligible for a future run once a rate exists somewhere in the chain.
 */
export function resolveShiftRates(
  shifts: ShiftForRateResolution[],
  membership: { hourlyRate: Decimal | null; roleId: string | null },
  roleRates: Map<string, Decimal | null>
): RateResolutionResult {
  const resolved: RateResolvedShift[] = []
  let totalHours = new Decimal(0)
  let totalAmount = new Decimal(0)

  for (const shift of shifts) {
    if (!shift.actualStart || !shift.actualEnd) continue

    const hoursRaw = (shift.actualEnd.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)
    const hours = new Decimal(Math.round(hoursRaw * 100) / 100)

    const shiftRoleRate = shift.roleId ? roleRates.get(shift.roleId) ?? null : null
    const primaryRoleRate = membership.roleId ? roleRates.get(membership.roleId) ?? null : null
    const rate = shiftRoleRate ?? membership.hourlyRate ?? primaryRoleRate ?? null

    resolved.push({ id: shift.id, hours, rate })

    if (rate) {
      totalHours = totalHours.add(hours)
      totalAmount = totalAmount.add(hours.mul(rate))
    }
  }

  return {
    resolved,
    includedShiftIds: resolved.filter((r) => r.rate).map((r) => r.id),
    excludedShiftIds: resolved.filter((r) => !r.rate).map((r) => r.id),
    totalHours,
    totalAmount,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Verify with a throwaway script**

Run:
```bash
cd apps/web && npx tsx -e "
import { resolveShiftRates } from './lib/payroll-rates'
import { Prisma } from './generated/prisma/client'
const D = Prisma.Decimal

const shifts = [
  { id: 'a', roleId: 'bartender', actualStart: new Date('2026-07-01T19:00:00Z'), actualEnd: new Date('2026-07-01T23:00:00Z') }, // 4h, role rate wins
  { id: 'b', roleId: null, actualStart: new Date('2026-07-02T19:00:00Z'), actualEnd: new Date('2026-07-02T22:00:00Z') }, // 3h, personal rate
  { id: 'c', roleId: 'unrated-role', actualStart: new Date('2026-07-03T19:00:00Z'), actualEnd: new Date('2026-07-03T20:00:00Z') }, // 1h, role has no rate, falls to personal
  { id: 'd', roleId: null, actualStart: null, actualEnd: null }, // no actuals, skipped entirely
]
const membership = { hourlyRate: new D(20), roleId: 'greeter' }
const roleRates = new Map([
  ['bartender', new D(50)],
  ['unrated-role', null],
  ['greeter', new D(15)],
])

const result = resolveShiftRates(shifts, membership, roleRates)
console.log(result.resolved.map(r => ({ id: r.id, hours: r.hours.toString(), rate: r.rate?.toString() ?? null })))
console.log('totalHours', result.totalHours.toString())   // expect 7 (4+3, shift c also personal-rated so +1 = 8... see below)
console.log('totalAmount', result.totalAmount.toString())
console.log('included', result.includedShiftIds)
console.log('excluded', result.excludedShiftIds)
"
```
Expected output:
- Shift `a`: hours `4`, rate `50` (shift's own role rate wins over personal `20`)
- Shift `b`: hours `3`, rate `20` (no role tag, falls to personal rate)
- Shift `c`: hours `1`, rate `20` (role tagged but that role has no rate set, falls to personal rate)
- Shift `d`: not present in `resolved` at all (no actuals — skipped before rate resolution)
- `totalHours`: `8` (4+3+1)
- `totalAmount`: `280` (4×50 + 3×20 + 1×20 = 200+60+20)
- `included`: `['a', 'b', 'c']`
- `excluded`: `[]`

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/payroll-rates.ts
git commit -m "feat(payroll): add shared per-shift rate resolution helper"
```

---

### Task 3: Shift creation API — role becomes optional on assigned shifts

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/shifts/route.ts`

- [ ] **Step 1: Relax the cross-field validation**

Find:

```typescript
  // Cross-field rule (spans membershipId and roleId), so the error is form-level: no single field is "wrong" on its own.
  .refine((data) => Boolean(data.membershipId) !== Boolean(data.roleId), {
    message: "Provide exactly one of membershipId (assign now) or roleId (leave open), not both",
  })
```

Replace with:

```typescript
  // Cross-field rule (spans membershipId and roleId), so the error is form-level: no single field is "wrong" on its own.
  .refine((data) => Boolean(data.membershipId) || Boolean(data.roleId), {
    message: "Provide a staff member (assign now), a role (leave open), or both (assign now with a role tagged for pay)",
  })
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Verify the role independently of assign/open mode**

Find:

```typescript
    if (parsed.data.membershipId) {
      // Assigning to a specific person: verify they belong to this venue
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
      // Leaving the shift open: verify the role belongs to this venue
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
      verifiedRoleId = role.id
    }
```

Replace with:

```typescript
    if (parsed.data.membershipId) {
      // Assigning to a specific person: verify they belong to this venue
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
    }

    // Verified independently of assign/open mode: an assigned shift can optionally
    // also carry a role (for pay resolution), and an open shift always requires one.
    if (parsed.data.roleId) {
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
      verifiedRoleId = role.id
    }
```

(The change is `else if` → a separate `if`, so both blocks can run when both fields are present. `targetMembership`/`verifiedRoleId` declarations above this, and everything below it — the `shift = await prisma.shift.create(...)` call and reminder-queueing — are unchanged.)

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 5: Manually verify against a running dev server + live DB**

With the dev server running and a real session cookie:

```bash
# Assign with a role tagged (new capability)
curl -s -X POST http://localhost:3000/api/venues/<venueId>/shifts \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"membershipId":"<membershipId>","roleId":"<roleId>","scheduledStart":"2026-08-05T19:00:00.000Z","scheduledEnd":"2026-08-05T23:00:00.000Z"}'
```
Expected: `201`, response's `shift.roleId` matches the one passed, `shift.membershipId` matches, `status: "SCHEDULED"`

Confirm plain assign-without-role (existing behavior) still works and stores `roleId: null`, and plain open-mode (existing behavior) still works unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/shifts/route.ts
git commit -m "feat(payroll): allow assigned shifts to optionally carry a role"
```

---

### Task 4: `CreateShiftDialog` — optional role select in assign mode

**Files:**
- Modify: `apps/web/components/create-shift-dialog.tsx`

- [ ] **Step 1: Add the role select to assign mode**

Find:

```tsx
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
```

Replace with:

```tsx
          {mode === "assign" ? (
            <div className="space-y-4">
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
              <div className="space-y-2">
                <Label htmlFor="assign-role">Role (optional, for pay)</Label>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No specific role tagged" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Tags this shift with a role for pay purposes — the role's rate is used
                  instead of the staff member's own rate when payroll is generated.
                </p>
              </div>
            </div>
          ) : (
```

`roleId` is the same state already used by open mode's role select below — no new state variable needed, since it means the same thing in both modes ("the role this shift is for"), just required in one and optional in the other.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Include the optional role in the assign-mode submit payload**

**Note:** this block differs from a plain `main` checkout — the recurring-shifts and shift-groups features (already merged into this branch) added two more conditional spreads here (`recurrenceRule`, `slotGroupId`). Find the block as it actually exists now:

```typescript
          body: JSON.stringify({
            ...(mode === "assign" ? { membershipId } : { roleId }),
            scheduledStart,
            scheduledEnd,
            notes: notes || undefined,
            ...(repeating ? { recurrenceRule } : {}),
            ...(slotGroupId ? { slotGroupId } : {}),
          }),
```

Replace with:

```typescript
          body: JSON.stringify({
            ...(mode === "assign"
              ? { membershipId, ...(roleId ? { roleId } : {}) }
              : { roleId }),
            scheduledStart,
            scheduledEnd,
            notes: notes || undefined,
            ...(repeating ? { recurrenceRule } : {}),
            ...(slotGroupId ? { slotGroupId } : {}),
          }),
```

Only the first spread line changes — the `recurrenceRule`/`slotGroupId` lines stay exactly as they are, untouched.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 5: Manually verify in the browser**

Run: `cd apps/web && npm run dev`, open the shifts page, click "Schedule Shift":
- Assign mode: confirm the new "Role (optional, for pay)" select appears below the staff dropdown, defaults to unselected
- Leave it unselected, submit — confirm the created shift has no role (existing behavior unchanged)
- Repeat, this time picking a role — confirm the created shift has that role attached (check via the DB: `SELECT "membershipId", "roleId" FROM shifts ORDER BY "createdAt" DESC LIMIT 1;`)
- Switch to "Leave open" mode — confirm its existing required role select still works exactly as before (same underlying `roleId` state, now just required by that mode's own validation, unaffected by this change)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/create-shift-dialog.tsx
git commit -m "feat(payroll): add optional role select to assign mode in CreateShiftDialog"
```

---

### Task 5: Roles API — accept `hourlyRate` on create and update

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/roles/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/roles/[roleId]/route.ts`

- [ ] **Step 1: Extend the create schema**

In `apps/web/app/api/venues/[venueId]/roles/route.ts`, find:

```typescript
const createRoleSchema = z.object({
  name: z.string().min(1, "Role name is required").max(50),
  responsibilities: z.string().optional(),
  color: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
})
```

Replace with:

```typescript
const createRoleSchema = z.object({
  name: z.string().min(1, "Role name is required").max(50),
  responsibilities: z.string().optional(),
  color: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  hourlyRate: z.number().positive().nullable().optional(),
})
```

The create handler's `prisma.role.create` call does **not** pass `validatedData` straight through — it lists fields individually. Find:

```typescript
    const newRole = await prisma.role.create({
      data: {
        venueId,
        name: validatedData.name,
        responsibilities: validatedData.responsibilities,
        color: validatedData.color,
        permissions: validatedData.permissions || {},
      },
    })
```

Replace with:

```typescript
    const newRole = await prisma.role.create({
      data: {
        venueId,
        name: validatedData.name,
        responsibilities: validatedData.responsibilities,
        color: validatedData.color,
        permissions: validatedData.permissions || {},
        hourlyRate: validatedData.hourlyRate,
      },
    })
```

- [ ] **Step 2: Extend the update schema**

In `apps/web/app/api/venues/[venueId]/roles/[roleId]/route.ts`, find:

```typescript
const updateRoleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  responsibilities: z.string().optional(),
  color: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
})
```

Replace with:

```typescript
const updateRoleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  responsibilities: z.string().optional(),
  color: z.string().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  hourlyRate: z.number().positive().nullable().optional(),
})
```

Unlike create, the `PUT` handler already passes `validatedData` straight through to `prisma.role.update`'s `data:` (`data: validatedData` — verified directly), so no handler changes are needed here beyond the schema extension above.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 4: Manually verify**

```bash
curl -s -X POST http://localhost:3000/api/venues/<venueId>/roles \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"name":"Test Rate Role","hourlyRate":45}'
```
Expected: `201` (or whatever status the existing create returns — check, don't assume), response includes `"hourlyRate":"45"` (Prisma `Decimal` serializes to a string)

```bash
curl -s -X PUT http://localhost:3000/api/venues/<venueId>/roles/<roleId> \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"hourlyRate":null}'
```
Expected: `200`, response's `hourlyRate` is now `null` (confirms clearing a previously-set rate works)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/roles/route.ts apps/web/app/api/venues/\[venueId\]/roles/\[roleId\]/route.ts
git commit -m "feat(payroll): accept hourlyRate on role create/update"
```

---

### Task 6: Roles management UI — hourly rate field

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/staff/roles/page.tsx`

- [ ] **Step 1: Add to the `Role` interface and form state**

Find:

```typescript
interface Role {
  id: string
  name: string
  responsibilities: string | null
  color: string | null
  permissions: any
  _count?: {
    memberships: number
  }
}
```

Replace with:

```typescript
interface Role {
  id: string
  name: string
  responsibilities: string | null
  color: string | null
  permissions: any
  hourlyRate: string | null
  _count?: {
    memberships: number
  }
}
```

(`hourlyRate` is typed `string | null` here, not `number | null` — Prisma's `Decimal` serializes to a JSON string, matching how the API actually responds, verified in Task 5.)

Find:

```typescript
  const [formData, setFormData] = useState({
    name: "",
    responsibilities: "",
    color: "#6366f1",
  })
```

Replace with:

```typescript
  const [formData, setFormData] = useState({
    name: "",
    responsibilities: "",
    color: "#6366f1",
    hourlyRate: "",
  })
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Send it on create/edit, and reset/populate it correctly**

Find (in `handleCreateRole`):

```typescript
      const response = await fetch(`/api/venues/${venue.id}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
```

Replace with:

```typescript
      const response = await fetch(`/api/venues/${venue.id}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          hourlyRate: formData.hourlyRate ? Number(formData.hourlyRate) : null,
        }),
      })
```

Find the matching reset line right after, still in `handleCreateRole`:

```typescript
      setFormData({ name: "", responsibilities: "", color: "#6366f1" })
```

Replace with:

```typescript
      setFormData({ name: "", responsibilities: "", color: "#6366f1", hourlyRate: "" })
```

There are three occurrences of this exact reset line in the file (create success, edit success, and `openCreateDialog`) — apply the same replacement to all three. Read the file to confirm the exact count and locations before editing; don't assume they're identical without checking (they should be, but verify).

Find (in `handleEditRole`), the same body pattern:

```typescript
      const response = await fetch(
        `/api/venues/${venue.id}/roles/${editingRole.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      )
```

Replace with:

```typescript
      const response = await fetch(
        `/api/venues/${venue.id}/roles/${editingRole.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            hourlyRate: formData.hourlyRate ? Number(formData.hourlyRate) : null,
          }),
        }
      )
```

Find `openEditDialog`:

```typescript
  const openEditDialog = (role: Role) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      responsibilities: role.responsibilities || "",
      color: role.color || "#6366f1",
    })
    setFormError("")
    setIsEditDialogOpen(true)
  }
```

Replace with:

```typescript
  const openEditDialog = (role: Role) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      responsibilities: role.responsibilities || "",
      color: role.color || "#6366f1",
      hourlyRate: role.hourlyRate ?? "",
    })
    setFormError("")
    setIsEditDialogOpen(true)
  }
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 5: Add the input to the create dialog**

Find (in the Create Role Dialog JSX):

```tsx
            <div className="space-y-2">
              <Label htmlFor="create-responsibilities">Responsibilities (Optional)</Label>
              <Textarea
                id="create-responsibilities"
                placeholder="What does this role do?"
                value={formData.responsibilities}
                onChange={(e) =>
                  setFormData({ ...formData, responsibilities: e.target.value })
                }
                disabled={isSubmitting}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Role Color</Label>
```

Replace with:

```tsx
            <div className="space-y-2">
              <Label htmlFor="create-responsibilities">Responsibilities (Optional)</Label>
              <Textarea
                id="create-responsibilities"
                placeholder="What does this role do?"
                value={formData.responsibilities}
                onChange={(e) =>
                  setFormData({ ...formData, responsibilities: e.target.value })
                }
                disabled={isSubmitting}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-hourly-rate">Hourly Rate (Optional)</Label>
              <Input
                id="create-hourly-rate"
                type="number"
                min={0}
                step="0.01"
                placeholder="Used as this role's default pay rate"
                value={formData.hourlyRate}
                onChange={(e) =>
                  setFormData({ ...formData, hourlyRate: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label>Role Color</Label>
```

- [ ] **Step 6: Add the input to the edit dialog**

Find (in the Edit Role Dialog JSX — same shape as create, but with `edit-` id prefixes):

```tsx
            <div className="space-y-2">
              <Label htmlFor="edit-responsibilities">Responsibilities (Optional)</Label>
              <Textarea
                id="edit-responsibilities"
                value={formData.responsibilities}
                onChange={(e) =>
                  setFormData({ ...formData, responsibilities: e.target.value })
                }
                disabled={isSubmitting}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Role Color</Label>
```

Replace with:

```tsx
            <div className="space-y-2">
              <Label htmlFor="edit-responsibilities">Responsibilities (Optional)</Label>
              <Textarea
                id="edit-responsibilities"
                value={formData.responsibilities}
                onChange={(e) =>
                  setFormData({ ...formData, responsibilities: e.target.value })
                }
                disabled={isSubmitting}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-hourly-rate">Hourly Rate (Optional)</Label>
              <Input
                id="edit-hourly-rate"
                type="number"
                min={0}
                step="0.01"
                value={formData.hourlyRate}
                onChange={(e) =>
                  setFormData({ ...formData, hourlyRate: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label>Role Color</Label>
```

- [ ] **Step 7: Show the rate on the role card**

Find (in the role card's `CardHeader`):

```tsx
                  <Badge variant="outline" className="shrink-0 ml-2">
                    {role._count?.memberships || 0}{" "}
                    {(role._count?.memberships || 0) === 1 ? "member" : "members"}
                  </Badge>
```

Replace with:

```tsx
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <Badge variant="outline">
                      {role._count?.memberships || 0}{" "}
                      {(role._count?.memberships || 0) === 1 ? "member" : "members"}
                    </Badge>
                    {role.hourlyRate && (
                      <Badge variant="outline">{Number(role.hourlyRate).toLocaleString()}/hr</Badge>
                    )}
                  </div>
```

- [ ] **Step 8: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 9: Manually verify in the browser**

Run: `cd apps/web && npm run dev`, open a venue's Staff → Roles page:
- Create a role with an hourly rate set — confirm it saves and the card shows the `.../hr` badge
- Edit that role, clear the rate, save — confirm the badge disappears
- Edit again, set a rate, save — confirm the badge reappears with the new value
- Create a role with no rate — confirm no badge shows and nothing breaks

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/dashboard/\[slug\]/staff/roles/page.tsx
git commit -m "feat(payroll): add hourly rate field to roles management UI"
```

---

### Task 7: Single-member payroll route — per-shift resolution

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts`

- [ ] **Step 1: Import the helper**

Find:

```typescript
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>
```

Replace with:

```typescript
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { fetchRoleRates, resolveShiftRates } from "@/lib/payroll-rates"
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors (import unused yet is fine — TS won't error on that in this codebase's config, but if it does, that's expected until the next step wires it in; don't worry about it here)

- [ ] **Step 3: Rewrite the POST handler's rate/total computation**

Find (this spans from the rate lookup through total calculation):

```typescript
      // Determine the rate: explicit override > membership default
      const effectiveRate = baseRate !== undefined && baseRate !== null
        ? new Decimal(baseRate)
        : staffMembership.hourlyRate

      if (!effectiveRate) {
        return NextResponse.json(
          { error: "No hourly rate provided and staff member has no default rate set" },
          { status: 400 }
        )
      }

      // Find completed shifts with no payroll entry in the date range
      const eligibleShifts = await prisma.shift.findMany({
        where: {
          membershipId,
          venueId: venue.id,
          status: "COMPLETED",
          payrollEntryId: null,
          actualEnd: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { actualStart: "asc" },
      })

      if (eligibleShifts.length === 0) {
        return NextResponse.json(
          { error: "No unpaid completed shifts found in this period" },
          { status: 400 }
        )
      }

      // Recalculate hours from timestamps (authoritative for payroll)
      let totalHours = new Decimal(0)
      for (const shift of eligibleShifts) {
        if (shift.actualStart && shift.actualEnd) {
          const hours = (shift.actualEnd.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)
          totalHours = totalHours.add(new Decimal(Math.round(hours * 100) / 100))
        }
      }

      // Calculate total amount
      let totalAmount = new Decimal(effectiveRate).mul(totalHours)
      if (bonusAmount) {
        totalAmount = totalAmount.add(new Decimal(bonusAmount))
      }
```

Replace with:

```typescript
      // Find completed shifts with no payroll entry in the date range
      const eligibleShifts = await prisma.shift.findMany({
        where: {
          membershipId,
          venueId: venue.id,
          status: "COMPLETED",
          payrollEntryId: null,
          actualEnd: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { actualStart: "asc" },
      })

      if (eligibleShifts.length === 0) {
        return NextResponse.json(
          { error: "No unpaid completed shifts found in this period" },
          { status: 400 }
        )
      }

      let totalHours: Decimal
      let totalAmount: Decimal
      let linkedShiftIds: string[]

      if (baseRate !== undefined && baseRate !== null) {
        // Explicit manual override: applies flat to every eligible shift, same as before —
        // this is the one path that intentionally bypasses per-shift role resolution.
        const overrideRate = new Decimal(baseRate)
        totalHours = new Decimal(0)
        for (const shift of eligibleShifts) {
          if (shift.actualStart && shift.actualEnd) {
            const hours = (shift.actualEnd.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)
            totalHours = totalHours.add(new Decimal(Math.round(hours * 100) / 100))
          }
        }
        totalAmount = overrideRate.mul(totalHours)
        linkedShiftIds = eligibleShifts.map((s) => s.id)
      } else {
        const roleIds = [
          ...eligibleShifts.map((s) => s.roleId),
          staffMembership.roleId,
        ]
        const roleRates = await fetchRoleRates(roleIds)
        const resolution = resolveShiftRates(eligibleShifts, staffMembership, roleRates)

        if (resolution.includedShiftIds.length === 0) {
          return NextResponse.json(
            { error: "No hourly rate could be resolved for any shift in this period (no personal rate, no role rate on the shifts, and no primary role rate set)" },
            { status: 400 }
          )
        }

        totalHours = resolution.totalHours
        totalAmount = resolution.totalAmount
        linkedShiftIds = resolution.includedShiftIds
      }

      if (bonusAmount) {
        totalAmount = totalAmount.add(new Decimal(bonusAmount))
      }

      // Informational effective rate for display — the real math happened per-shift
      // above (unless the manual override path ran, in which case it's just that flat rate).
      const effectiveRate = totalHours.gt(0) ? totalAmount.div(totalHours) : new Decimal(0)
```

- [ ] **Step 4: Update the transaction to link only the resolved shifts**

Find:

```typescript
        // Link all eligible shifts to this payroll entry
        await tx.shift.updateMany({
          where: {
            id: { in: eligibleShifts.map((s) => s.id) },
          },
          data: {
            payrollEntryId: payrollEntry.id,
          },
        })

        return payrollEntry
      })

      return NextResponse.json(
        {
          ...result,
          shiftsLinked: eligibleShifts.length,
        },
        { status: 201 }
      )
```

Replace with:

```typescript
        // Link only the shifts that actually resolved to a rate — see the rate
        // resolution above for why this can be fewer than eligibleShifts.length.
        await tx.shift.updateMany({
          where: {
            id: { in: linkedShiftIds },
          },
          data: {
            payrollEntryId: payrollEntry.id,
          },
        })

        return payrollEntry
      })

      return NextResponse.json(
        {
          ...result,
          shiftsLinked: linkedShiftIds.length,
          shiftsExcluded: eligibleShifts.length - linkedShiftIds.length,
        },
        { status: 201 }
      )
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 6: Update the GET preview to use the same resolution**

Find:

```typescript
      // Calculate totals from timestamps
      let totalHours = 0
      const shiftDetails = eligibleShifts.map((shift) => {
        let hours = 0
        if (shift.actualStart && shift.actualEnd) {
          hours = Math.round(
            ((shift.actualEnd.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)) * 100
          ) / 100
          totalHours += hours
        }
        return {
          id: shift.id,
          scheduledStart: shift.scheduledStart.toISOString(),
          scheduledEnd: shift.scheduledEnd.toISOString(),
          actualStart: shift.actualStart?.toISOString() ?? null,
          actualEnd: shift.actualEnd?.toISOString() ?? null,
          hoursWorked: hours,
          storedHoursWorked: shift.hoursWorked ? Number(shift.hoursWorked) : null,
        }
      })

      totalHours = Math.round(totalHours * 100) / 100

      const defaultRate = staffMembership.hourlyRate
        ? Number(staffMembership.hourlyRate)
        : null

      return NextResponse.json({
        staff: {
          membershipId: staffMembership.id,
          name: staffMembership.user?.displayName || staffMembership.user?.name || "Unknown",
          image: staffMembership.user?.image,
          defaultHourlyRate: defaultRate,
        },
        shifts: shiftDetails,
        summary: {
          shiftCount: eligibleShifts.length,
          totalHours,
          estimatedTotal: defaultRate ? Math.round(defaultRate * totalHours * 100) / 100 : null,
        },
      })
```

Replace with:

```typescript
      const roleIds = [
        ...eligibleShifts.map((s) => s.roleId),
        staffMembership.roleId,
      ]
      const roleRates = await fetchRoleRates(roleIds)
      const resolution = resolveShiftRates(eligibleShifts, staffMembership, roleRates)
      const resolvedById = new Map(resolution.resolved.map((r) => [r.id, r]))

      const shiftDetails = eligibleShifts.map((shift) => {
        const r = resolvedById.get(shift.id)
        return {
          id: shift.id,
          scheduledStart: shift.scheduledStart.toISOString(),
          scheduledEnd: shift.scheduledEnd.toISOString(),
          actualStart: shift.actualStart?.toISOString() ?? null,
          actualEnd: shift.actualEnd?.toISOString() ?? null,
          hoursWorked: r ? Number(r.hours) : 0,
          resolvedRate: r?.rate ? Number(r.rate) : null,
          storedHoursWorked: shift.hoursWorked ? Number(shift.hoursWorked) : null,
        }
      })

      const defaultRate = staffMembership.hourlyRate
        ? Number(staffMembership.hourlyRate)
        : null

      return NextResponse.json({
        staff: {
          membershipId: staffMembership.id,
          name: staffMembership.user?.displayName || staffMembership.user?.name || "Unknown",
          image: staffMembership.user?.image,
          defaultHourlyRate: defaultRate,
        },
        shifts: shiftDetails,
        summary: {
          shiftCount: eligibleShifts.length,
          totalHours: Number(resolution.totalHours),
          estimatedTotal: resolution.totalHours.gt(0) ? Number(resolution.totalAmount) : null,
          unresolvedShiftCount: resolution.excludedShiftIds.length,
        },
      })
```

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 8: Manually verify against a running dev server + live DB**

This needs real completed shifts with `actualStart`/`actualEnd` set to test meaningfully. Using existing completed shift data for a real membership in your dev/live DB (check what's available: `SELECT id, "membershipId", "roleId", status FROM shifts WHERE status = 'COMPLETED' AND "payrollEntryId" IS NULL LIMIT 5;`):

```bash
curl -s "http://localhost:3000/api/venues/<venueId>/payroll/generate?membershipId=<membershipId>&periodStart=2026-01-01&periodEnd=2026-12-31" \
  -H "Cookie: next-auth.session-token=<token>"
```
Expected: `summary.estimatedTotal` reflects per-shift resolution (verify by hand-computing from the `shifts[].resolvedRate` values returned)

Then generate for real with a short period covering a couple of test shifts, confirm `shiftsLinked` + `shiftsExcluded` in the response add up to the total eligible count, and confirm via DB that only the linked ones got `payrollEntryId` set:

```bash
curl -s -X POST "http://localhost:3000/api/venues/<venueId>/payroll/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"membershipId":"<membershipId>","periodStart":"2026-01-01","periodEnd":"2026-12-31"}'
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/payroll/generate/route.ts
git commit -m "feat(payroll): switch single-member payroll generation to per-shift rate resolution"
```

---

### Task 8: `generate-all` route — per-shift resolution

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate-all/route.ts`

- [ ] **Step 1: Import the helper**

Find:

```typescript
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal
```

Replace with:

```typescript
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { fetchRoleRates, resolveShiftRates } from "@/lib/payroll-rates"
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal
```

- [ ] **Step 2: Rewrite `getEligibleShiftsPerMember` to resolve rates per shift**

Find the entire function:

```typescript
async function getEligibleShiftsPerMember(venueId: string, startDate: Date, endDate: Date) {
  const activeMembers = await prisma.membership.findMany({
    where: { venueId, status: "active" },
    include: {
      user: { select: { id: true, name: true, displayName: true, image: true } },
    },
  })

  const results = await Promise.all(
    activeMembers.map(async (member) => {
      const shifts = await prisma.shift.findMany({
        where: {
          membershipId: member.id,
          venueId,
          status: "COMPLETED",
          payrollEntryId: null,
          actualEnd: { gte: startDate, lte: endDate },
        },
        orderBy: { actualStart: "asc" },
      })

      let totalHours = 0
      for (const s of shifts) {
        if (s.actualStart && s.actualEnd) {
          totalHours += (s.actualEnd.getTime() - s.actualStart.getTime()) / (1000 * 60 * 60)
        }
      }
      totalHours = Math.round(totalHours * 100) / 100

      const rate = member.hourlyRate ? Number(member.hourlyRate) : null

      return {
        member,
        shifts,
        totalHours,
        rate,
        estimatedTotal: rate ? Math.round(rate * totalHours) : null,
        skipped: shifts.length === 0 || rate === null,
        skipReason: shifts.length === 0 ? "no_shifts" : rate === null ? "no_rate" : null,
      }
    })
  )

  return results
}
```

Replace with:

```typescript
async function getEligibleShiftsPerMember(venueId: string, startDate: Date, endDate: Date) {
  const activeMembers = await prisma.membership.findMany({
    where: { venueId, status: "active" },
    include: {
      user: { select: { id: true, name: true, displayName: true, image: true } },
    },
  })

  const perMember = await Promise.all(
    activeMembers.map(async (member) => {
      const shifts = await prisma.shift.findMany({
        where: {
          membershipId: member.id,
          venueId,
          status: "COMPLETED",
          payrollEntryId: null,
          actualEnd: { gte: startDate, lte: endDate },
        },
        orderBy: { actualStart: "asc" },
      })
      return { member, shifts }
    })
  )

  // Gather every role ID this venue's members/shifts might need in one pass, so
  // role rates are fetched once for the whole venue instead of once per member.
  const allRoleIds = perMember.flatMap(({ member, shifts }) => [
    member.roleId,
    ...shifts.map((s) => s.roleId),
  ])
  const roleRates = await fetchRoleRates(allRoleIds)

  return perMember.map(({ member, shifts }) => {
    const resolution = resolveShiftRates(shifts, member, roleRates)
    const totalHours = Number(resolution.totalHours)

    return {
      member,
      shifts,
      resolution,
      totalHours,
      estimatedTotal: resolution.includedShiftIds.length > 0 ? Math.round(Number(resolution.totalAmount)) : null,
      skipped: shifts.length === 0 || resolution.includedShiftIds.length === 0,
      skipReason:
        shifts.length === 0
          ? "no_shifts"
          : resolution.includedShiftIds.length === 0
            ? "no_rate"
            : null,
    }
  })
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: errors — the `GET` and `POST` handlers below still reference the old `r.rate` field, which no longer exists (replaced by `r.resolution`). Proceed to the next steps to fix them.

- [ ] **Step 4: Update the GET preview handler**

Find:

```typescript
      return NextResponse.json({
        members: results.map((r) => ({
          membershipId: r.member.id,
          name: r.member.user?.displayName || r.member.user?.name || "Unknown",
          image: r.member.user?.image ?? null,
          shiftCount: r.shifts.length,
          totalHours: r.totalHours,
          rate: r.rate,
          estimatedTotal: r.estimatedTotal,
          skipped: r.skipped,
          skipReason: r.skipReason,
        })),
      })
```

Replace with:

```typescript
      return NextResponse.json({
        members: results.map((r) => ({
          membershipId: r.member.id,
          name: r.member.user?.displayName || r.member.user?.name || "Unknown",
          image: r.member.user?.image ?? null,
          shiftCount: r.shifts.length,
          totalHours: r.totalHours,
          estimatedTotal: r.estimatedTotal,
          skipped: r.skipped,
          skipReason: r.skipReason,
          unresolvedShiftCount: r.resolution.excludedShiftIds.length,
        })),
      })
```

(`rate` is dropped from the response — it no longer means one flat number per member. `estimatedTotal` and the new `unresolvedShiftCount` carry the useful information instead.)

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: still one error remaining, in the `POST` handler — fix in the next step

- [ ] **Step 6: Update the POST handler's generation loop**

Find:

```typescript
      const created = await prisma.$transaction(async (tx) => {
        const entries = []
        for (const r of eligible) {
          const totalHours = new Decimal(r.totalHours)
          const baseRate = new Decimal(r.rate!)
          const totalAmount = baseRate.mul(totalHours)

          const entry = await tx.payrollEntry.create({
            data: {
              venueId: venue.id,
              membershipId: r.member.id,
              paymentType: "HOURLY",
              baseRate,
              hoursWorked: totalHours,
              totalAmount,
              periodStart: startDate,
              periodEnd: endDate,
            },
          })

          await tx.shift.updateMany({
            where: { id: { in: r.shifts.map((s) => s.id) } },
            data: { payrollEntryId: entry.id },
          })

          entries.push({
            membershipId: r.member.id,
            name: r.member.user?.displayName || r.member.user?.name || "Unknown",
            shiftCount: r.shifts.length,
            totalHours: r.totalHours,
            totalAmount: Math.round(Number(totalAmount)),
          })
        }
        return entries
      })
```

Replace with:

```typescript
      const created = await prisma.$transaction(async (tx) => {
        const entries = []
        for (const r of eligible) {
          const totalHours = r.resolution.totalHours
          const totalAmount = r.resolution.totalAmount
          // Informational effective rate — the real math happened per-shift.
          const baseRate = totalHours.gt(0) ? totalAmount.div(totalHours) : new Decimal(0)

          const entry = await tx.payrollEntry.create({
            data: {
              venueId: venue.id,
              membershipId: r.member.id,
              paymentType: "HOURLY",
              baseRate,
              hoursWorked: totalHours,
              totalAmount,
              periodStart: startDate,
              periodEnd: endDate,
            },
          })

          // Link only the shifts that resolved to a rate — see resolveShiftRates.
          await tx.shift.updateMany({
            where: { id: { in: r.resolution.includedShiftIds } },
            data: { payrollEntryId: entry.id },
          })

          entries.push({
            membershipId: r.member.id,
            name: r.member.user?.displayName || r.member.user?.name || "Unknown",
            shiftCount: r.resolution.includedShiftIds.length,
            totalHours: r.totalHours,
            totalAmount: Math.round(Number(totalAmount)),
          })
        }
        return entries
      })
```

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: no errors

- [ ] **Step 8: Manually verify against a running dev server + live DB**

```bash
curl -s "http://localhost:3000/api/venues/<venueId>/payroll/generate-all?periodStart=2026-01-01&periodEnd=2026-12-31" \
  -H "Cookie: next-auth.session-token=<token>"
```
Expected: `members[]` array, each with `estimatedTotal` reflecting per-shift resolution and `unresolvedShiftCount` for any member with partially-unresolvable shifts

```bash
curl -s -X POST "http://localhost:3000/api/venues/<venueId>/payroll/generate-all" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=<token>" \
  -d '{"periodStart":"2026-01-01","periodEnd":"2026-12-31"}'
```
Expected: `201`, `entries[]` created; verify in the DB that shifts which had no resolvable rate stayed unlinked (`payrollEntryId IS NULL`) while everything else got linked to its new `PayrollEntry`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/payroll/generate-all/route.ts
git commit -m "feat(payroll): switch generate-all to per-shift rate resolution"
```

---

## Post-implementation checklist

- [ ] All 8 tasks committed
- [ ] `npm run typecheck` passes clean from a fresh checkout
- [ ] Any test data created during manual verification (Tasks 3, 4, 6, 7, 8) cleaned up from the live database — this plan runs against the same shared Postgres as production; delete test shifts, test roles, and any payroll entries created purely for verification before finishing
- [ ] Deploy via `~/bin/deploy-xiv-web.sh` once the branch is merged
