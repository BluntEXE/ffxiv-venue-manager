# Multi-Role Staff Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a venue manager assign a staff member more than one custom role (e.g. Vanex is both "Court" and "Gposer"), so that person shows up under all relevant roles and can provide services tied to any of their assigned roles.

**Architecture:** Add a many-to-many join table `MembershipRoleAssignment` between `Membership` and `Role` for "additional roles", while keeping the existing `Membership.roleId` / `customRole` relation as the staff member's *primary* role (used for filters, badges, default shift role). The staff detail page gets a multi-select for additional roles. The plugin `/api/plugin/services` endpoint, the staff table badges, and the open-shift role display are updated to consider primary + additional roles together.

**Tech Stack:** Next.js 15 App Router, Prisma (postgres, `db push` workflow — no migration files are tracked), Zod validation, shadcn/ui components.

**Important — DB workflow:** This project does NOT use `prisma migrate`. After editing `schema.prisma`, apply the DDL via raw SQL against the postgres container (see Task 1), then run `npx prisma generate` to refresh the client. Do not run `prisma migrate dev`.

---

## File Structure

- `apps/web/prisma/schema.prisma` — add `MembershipRoleAssignment` model + back-relations on `Membership` and `Role`.
- `apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts` — PATCH accepts `additionalRoleIds: string[]`, syncs the join table.
- `apps/web/app/dashboard/[slug]/staff/[membershipId]/page.tsx` — UI: multi-select checkboxes for "Additional Roles" under existing "Custom Role" section.
- `apps/web/app/dashboard/[slug]/staff/page.tsx` — fetch `additionalRoles` per member, pass to `StaffTable`.
- `apps/web/components/staff-table.tsx` — render extra role badges next to the primary role badge.
- `apps/web/app/api/plugin/services/route.ts` — union services from `customRole` + `additionalRoles`, dedupe by service id.

---

### Task 1: Schema migration — add `MembershipRoleAssignment` join table

**Files:**
- Modify: `apps/web/prisma/schema.prisma:212-270`

- [ ] **Step 1: Add the join model and back-relations**

In `apps/web/prisma/schema.prisma`, add a new model after the `Role` model (around line 270), and add the relation fields to `Membership` and `Role`:

```prisma
model Membership {
  // ...existing fields unchanged...

  customRole         Role?                     @relation(fields: [roleId], references: [id])
  additionalRoles    MembershipRoleAssignment[]
  payrollEntries     PayrollEntry[]
  shifts             Shift[]

  // ...existing indexes/map unchanged...
}

model Role {
  // ...existing fields unchanged...

  venue              Venue                      @relation(fields: [venueId], references: [id], onDelete: Cascade)
  memberships        Membership[]
  additionalFor      MembershipRoleAssignment[]
  shifts             Shift[]
  services           Service[]
  assignedTasks      Task[]                     @relation("RoleTasks")

  // ...existing unique/map unchanged...
}

model MembershipRoleAssignment {
  id           String   @id @default(cuid())
  membershipId String
  roleId       String

  createdAt DateTime @default(now())

  membership Membership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([membershipId, roleId])
  @@map("membership_role_assignments")
}
```

- [ ] **Step 2: Apply the DDL by hand (db push workflow)**

This repo applies schema changes via raw SQL on the postgres container rather than `prisma migrate`. Run:

```bash
ssh server 'docker exec -i xiv-app-postgres-1 psql -U postgres -d xivapp' <<'SQL'
CREATE TABLE membership_role_assignments (
  id            TEXT PRIMARY KEY,
  "membershipId" TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  "roleId"       TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  "createdAt"    TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE ("membershipId", "roleId")
);
SQL
```

(Adjust container name if different — check with `ssh server 'docker ps --format "{{.Names}}"'` first.)

- [ ] **Step 3: Regenerate the Prisma client**

```bash
cd apps/web && npx prisma generate
```

Expected: "Generated Prisma Client" with no errors, and `generated/prisma/models/MembershipRoleAssignment.ts` exists.

- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat: add membership_role_assignments join table for multi-role staff"
```

---

### Task 2: Staff PATCH endpoint — accept and sync `additionalRoleIds`

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts:10-150`

- [ ] **Step 1: Extend the Zod schema**

Find the existing PATCH body schema (around line 10):

```typescript
const updateStaffSchema = z.object({
  roleId: z.string().nullable().optional(),
  additionalRoleIds: z.array(z.string()).optional(),
  role: z.enum(["OWNER", "MANAGER", "STAFF"]).optional(),
  temporaryRole: z.enum(["OWNER", "MANAGER", "STAFF"]).nullable().optional(),
  temporaryRoleExpiresAt: z.string().nullable().optional(),
  permanentRole: z.enum(["OWNER", "MANAGER", "STAFF"]).nullable().optional(),
})
```

- [ ] **Step 2: Validate additionalRoleIds belong to this venue**

Near where `validatedData.roleId !== undefined` is handled (around line 123), add a lookup so we don't link roles from another venue:

```typescript
let validAdditionalRoleIds: string[] | undefined
if (validatedData.additionalRoleIds !== undefined) {
  const existingRoles = await prisma.role.findMany({
    where: { venueId: venue.id, id: { in: validatedData.additionalRoleIds } },
    select: { id: true },
  })
  validAdditionalRoleIds = existingRoles.map((r) => r.id)
}
```

- [ ] **Step 3: Sync the join table after the membership update**

After the existing `prisma.membership.update(...)` call that builds `updateData`, add (still inside the same `try` block, after the membership update resolves):

```typescript
if (validAdditionalRoleIds !== undefined) {
  await prisma.$transaction([
    prisma.membershipRoleAssignment.deleteMany({
      where: { membershipId },
    }),
    ...(validAdditionalRoleIds.length > 0
      ? [
          prisma.membershipRoleAssignment.createMany({
            data: validAdditionalRoleIds.map((roleId) => ({ membershipId, roleId })),
          }),
        ]
      : []),
  ])
}
```

Use the same `membershipId` variable name already in scope from `await params` at the top of the handler — check the existing destructure (`const { membershipId } = await params`) and reuse it.

- [ ] **Step 4: Include additionalRoles in the response**

Find the final `include: { customRole: true, ... }` on the response query (around line 146) and add:

```typescript
additionalRoles: { include: { role: true } },
```

- [ ] **Step 5: Manual verification**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```

Expected: no new errors referencing `staff/[membershipId]/route.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/staff/\[membershipId\]/route.ts
git commit -m "feat: support assigning multiple additional roles to staff"
```

---

### Task 3: Staff detail page — multi-select for additional roles

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/staff/[membershipId]/page.tsx:43-90,130-390`

- [ ] **Step 1: Extend the `StaffMember` and add state**

Near the `roleId: string | null` field (line 43) and `customRole` (line 52), add:

```typescript
additionalRoles: { role: CustomRole }[]
```

Near `const [selectedCustomRole, setSelectedCustomRole] = useState<string | null>(null)` (line 90), add:

```typescript
const [selectedAdditionalRoleIds, setSelectedAdditionalRoleIds] = useState<string[]>([])
```

- [ ] **Step 2: Initialize from fetched member**

Where `setSelectedCustomRole(member.roleId)` is called (line 132), add directly below it:

```typescript
setSelectedAdditionalRoleIds(member.additionalRoles.map((ar) => ar.role.id))
```

- [ ] **Step 3: Send additionalRoleIds on save**

In the PATCH body being built (around line 169-170, alongside `roleId: selectedCustomRole`), add:

```typescript
additionalRoleIds: selectedAdditionalRoleIds,
```

- [ ] **Step 4: Add the multi-select UI**

In the "Role Management" card, after the "Custom Role" block (around line 361-390), add a new block:

```tsx
{/* Additional Roles */}
<div className="space-y-2">
  <Label>Additional Roles</Label>
  <p className="text-xs text-muted-foreground">
    Lets this person provide services and fill shifts for these roles too,
    on top of their custom role above.
  </p>
  <div className="flex flex-wrap gap-2">
    {customRoles
      .filter((role) => role.id !== selectedCustomRole)
      .map((role) => {
        const checked = selectedAdditionalRoleIds.includes(role.id)
        return (
          <button
            key={role.id}
            type="button"
            onClick={() =>
              setSelectedAdditionalRoleIds((prev) =>
                checked ? prev.filter((id) => id !== role.id) : [...prev, role.id]
              )
            }
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              checked
                ? "border-[var(--xiv-blue)] bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)]"
                : "border-[var(--blue-015)] text-muted-foreground hover:border-[var(--blue-028)]"
            }`}
          >
            {role.name}
          </button>
        )
      })}
  </div>
  {customRoles.length <= 1 && (
    <p className="text-xs text-muted-foreground">
      Create more roles in Staff settings to assign additional roles.
    </p>
  )}
</div>
```

This uses the existing `customRoles: CustomRole[]` state already populated for the primary role dropdown — no new fetch needed. The filter excludes whichever role is currently selected as primary, since that's already covered.

- [ ] **Step 5: Manual verification**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```

Then with the dev server running, open a staff member's detail page, toggle a couple of additional role chips, save, reload — the same chips should remain selected (confirms the PATCH round-trip and `additionalRoles` include in Task 2 work).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/staff/[membershipId]/page.tsx"
git commit -m "feat: add additional-roles multi-select to staff detail page"
```

---

### Task 4: Staff list — show additional role badges

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/staff/page.tsx:62,154`
- Modify: `apps/web/components/staff-table.tsx:15,185-196`

- [ ] **Step 1: Fetch additionalRoles in the staff list query**

In `apps/web/app/dashboard/[slug]/staff/page.tsx`, find the `prisma.membership.findMany` (or similar) include block containing `customRole: true` (around line 62) and add a sibling key:

```typescript
additionalRoles: { include: { role: { select: { name: true, color: true } } } },
```

- [ ] **Step 2: Map additionalRoles into the props passed to `StaffTable`**

Near line 154 where `customRole: m.customRole ? { ... } : null` is built for each member, add a sibling field:

```typescript
additionalRoles: m.additionalRoles.map((ar) => ({
  name: ar.role.name,
  color: ar.role.color ?? "#9399b2",
})),
```

- [ ] **Step 3: Extend the `StaffTable` member type**

In `apps/web/components/staff-table.tsx`, find the member type definition with `customRole: { name: string; color: string } | null` (line 15) and add:

```typescript
additionalRoles: { name: string; color: string }[]
```

- [ ] **Step 4: Render extra badges**

Find the "Role" cell block (around lines 185-196) that renders `member.customRole` as a badge. After that badge, add:

```tsx
{member.additionalRoles.map((role) => (
  <span
    key={role.name}
    className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-full border"
    style={{
      color: role.color,
      borderColor: role.color + "55",
      background: role.color + "18",
    }}
  >
    {role.name}
  </span>
))}
```

- [ ] **Step 5: Manual verification**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```

Then check the Staff page in the browser — a member with additional roles assigned (from Task 3) should show multiple role badges in their row.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/staff/page.tsx" apps/web/components/staff-table.tsx
git commit -m "feat: show additional role badges in staff list"
```

---

### Task 5: Plugin services endpoint — union services across all assigned roles

**Files:**
- Modify: `apps/web/app/api/plugin/services/route.ts:45-66`

- [ ] **Step 1: Include additionalRoles in the membership query**

Replace the `prisma.membership.findFirst` call (lines 45-52):

```typescript
const membership = await prisma.membership.findFirst({
  where: { userId: auth.userId, venueId, status: 'active' },
  include: {
    customRole: {
      include: { services: true },
    },
    additionalRoles: {
      include: { role: { include: { services: true } } },
    },
  },
})
```

- [ ] **Step 2: Union and dedupe services from primary + additional roles**

Replace lines 54-61:

```typescript
const allRoles = [
  ...(membership?.customRole ? [membership.customRole] : []),
  ...(membership?.additionalRoles.map((ar) => ar.role) ?? []),
]

const serviceMap = new Map<string, (typeof allRoles)[number]['services'][number]>()
for (const role of allRoles) {
  for (const svc of role.services) {
    serviceMap.set(svc.id, svc)
  }
}

const services = Array.from(serviceMap.values()).map((svc) => ({
  id: svc.id,
  name: svc.name,
  description: svc.description,
  price: svc.price.toString(),
  category: svc.category,
}))
```

- [ ] **Step 3: Update `userRole` to reflect all assigned role names**

Replace line 65 (`userRole: role?.name ?? null`) — keep the field name `userRole` for plugin compatibility (don't widen its type to an array, since `XIVAppApiClient.cs` expects a single string), but join multiple names so the plugin displays something meaningful:

```typescript
    return NextResponse.json({
      services,
      userRole: allRoles.length > 0 ? allRoles.map((r) => r.name).join(' / ') : null,
    })
```

- [ ] **Step 4: Update the file's doc comment**

The comment at lines 6-21 describes single-role behavior. Update the line "Returns the services the caller's assigned custom role can perform" to "Returns the union of services the caller's assigned roles (primary + additional) can perform", since this is now stale relative to the new behavior.

- [ ] **Step 5: Manual verification**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```

Then, with a staff member who has a primary role + one additional role each tied to different services, hit:

```bash
curl -H "x-api-key: <test-api-key>" "https://xivvenuemanager.com/api/plugin/services?venueId=<venueId>"
```

Expected: `services` array contains entries from both roles' service lists, with no duplicate `id`s, and `userRole` shows both role names joined by " / ".

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/plugin/services/route.ts
git commit -m "feat: union plugin services across all of a staff member's assigned roles"
```

---

## Out of Scope (note, don't implement)

- Open-shift role matching (`create-shift-dialog.tsx` "Required Role" dropdown) still uses a single `roleId` per shift — a shift open for "Gposer" won't also match someone whose *additional* role is Gposer for claim eligibility unless the claim endpoint is later updated. If that turns out to matter in practice, it's a follow-up to `app/api/venues/[venueId]/shifts/[shiftId]/route.ts`'s claim action.
- Sales logging eligibility (`app/api/plugin/services/route.ts` mentions a separate "Manager custom role can log anything" carve-out in `app/api/venues/[venueId]/services/route.ts` — re-check that logic still makes sense once staff can have multiple roles, but it's unaffected by this plan's changes.
