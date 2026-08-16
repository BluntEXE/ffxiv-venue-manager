# Staff Display Name Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every place a staff member's name is shown (shifts, payroll, staff table, sales, Discord webhooks, the activity timeline) resolve through one consistent chain: FFXIV character name → venue nickname → account display name → Discord name → "Unknown". Plus a small dismissible nudge banner for users with no linked character.

**Architecture:** One new pure helper (`resolveDisplayName`) takes plain strings and returns the resolved name — no DB access, safe in server or client code. Every query that currently fetches a staff member's `user` relation gets extended with `displayName` and a primary-character sub-select (`orderBy: [{isPrimary:"desc"},{createdAt:"asc"}], take:1`). Every inline `nickname ?? user.name`-style expression gets replaced with a call to the helper.

**Tech Stack:** Next.js App Router (server components + API routes), Prisma.

**Testing note:** No component/API test framework exists in this project. Verification is `tsc --noEmit` per task, plus a manual browser pass (Task 12) matching how every prior feature in this codebase was verified.

**Repo:** `/home/ehno/xiv-app`. All paths below are relative to that root.

---

### Task 1: `resolveDisplayName` helper

**Files:**

- Create: `apps/web/lib/display-name.ts`

- [ ] **Step 1: Write the file**

```typescript
// apps/web/lib/display-name.ts

/**
 * One resolution order for "what do we call this staff member" everywhere
 * on the site and in Discord webhooks: their FFXIV character (what other
 * players actually know them as) first, then whatever nickname/display
 * name they or their manager set, then their raw Discord OAuth name as a
 * last resort.
 */
export function resolveDisplayName(input: {
  characterName?: string | null
  nickname?: string | null
  displayName?: string | null
  discordName?: string | null
}): string {
  return input.characterName || input.nickname || input.displayName || input.discordName || "Unknown"
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `display-name.ts`

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/web/lib/display-name.ts
git commit -m "feat(names): add resolveDisplayName helper (character > nickname > displayName > Discord name)"
```

---

### Task 2: Shifts calendar — type + `ShiftDayDialog`

**Files:**

- Modify: `apps/web/lib/shift-format.ts`
- Modify: `apps/web/components/shift-day-dialog.tsx`

- [ ] **Step 1: Extend `CalendarShift.membership.user` type**

In `apps/web/lib/shift-format.ts`, change:

```typescript
  membership: {
    nickname: string | null
    user: { id: string; name: string | null; image: string | null } | null
  } | null
```

to:

```typescript
  membership: {
    nickname: string | null
    user: {
      id: string
      name: string | null
      displayName: string | null
      image: string | null
      characters: { characterName: string }[]
    } | null
  } | null
```

- [ ] **Step 2: Swap `staffLabel` to use the resolver**

In `apps/web/components/shift-day-dialog.tsx`, change the import line:

```typescript
import {
  fmtHour,
  statusBadgeClass,
  utcDayKey,
  type CalendarShift,
  type StaffMember,
  type RoleOption,
} from "@/lib/shift-format"
```

to:

```typescript
import {
  fmtHour,
  statusBadgeClass,
  utcDayKey,
  type CalendarShift,
  type StaffMember,
  type RoleOption,
} from "@/lib/shift-format"
import { resolveDisplayName } from "@/lib/display-name"
```

Then change:

```typescript
function staffLabel(shift: CalendarShift): string {
  return shift.membership?.nickname ?? shift.membership?.user?.name ?? "Unknown"
}
```

to:

```typescript
function staffLabel(shift: CalendarShift): string {
  return resolveDisplayName({
    characterName: shift.membership?.user?.characters?.[0]?.characterName,
    nickname: shift.membership?.nickname,
    displayName: shift.membership?.user?.displayName,
    discordName: shift.membership?.user?.name,
  })
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `shift-format.ts` or `shift-day-dialog.tsx` yet — the queries feeding `CalendarShift` are extended in Task 3, so this task alone will show a type error until Task 3 lands. That's expected; note it and proceed, or do Tasks 2 and 3 as one commit if your workflow prefers a green `tsc` at every commit.

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app
git add apps/web/lib/shift-format.ts apps/web/components/shift-day-dialog.tsx
git commit -m "feat(names): resolve shift-day-dialog staff names through resolveDisplayName"
```

---

### Task 3: Shifts page — queries + 5 display spots

**Files:**

- Modify: `apps/web/app/dashboard/[slug]/shifts/page.tsx`

- [ ] **Step 1: Add the import**

Near the other imports:

```typescript
import { resolveDisplayName } from "@/lib/display-name"
```

- [ ] **Step 2: Extend the `weekShifts` and `activeShifts` queries**

Change:

```typescript
    prisma.shift.findMany({
      where: {
        venueId: venue.id,
        scheduledStart: { gte: weekStart, lt: weekEnd },
      },
      include: {
        membership: { include: { user: { select: { id: true, name: true, image: true } } } },
        role: { select: { name: true } },
      },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.shift.findMany({
      where: { venueId: venue.id, status: "ACTIVE" },
      include: {
        membership: { include: { user: { select: { id: true, name: true, image: true } } } },
      },
    }),
```

to:

```typescript
    prisma.shift.findMany({
      where: {
        venueId: venue.id,
        scheduledStart: { gte: weekStart, lt: weekEnd },
      },
      include: {
        membership: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                displayName: true,
                image: true,
                characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
              },
            },
          },
        },
        role: { select: { name: true } },
      },
      orderBy: { scheduledStart: "asc" },
    }),
    prisma.shift.findMany({
      where: { venueId: venue.id, status: "ACTIVE" },
      include: {
        membership: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                displayName: true,
                image: true,
                characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
              },
            },
          },
        },
      },
    }),
```

- [ ] **Step 3: Extend the `calendarShifts` query's `select`**

Change:

```typescript
          membership: { select: { nickname: true, user: { select: { id: true, name: true, image: true } } } },
          role: { select: { name: true } },
        },
        orderBy: { scheduledStart: "asc" },
      })
    : []
```

to:

```typescript
          membership: {
            select: {
              nickname: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  image: true,
                  characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
                },
              },
            },
          },
          role: { select: { name: true } },
        },
        orderBy: { scheduledStart: "asc" },
      })
    : []
```

- [ ] **Step 4: Extend the `activeStaff` query and `staffForDialog` mapping**

Change:

```typescript
const activeStaff = await prisma.membership.findMany({
  where: { venueId: venue.id, status: "active", userId: { not: null } },
  include: { user: { select: { id: true, name: true, image: true } } },
})
const staffForDialog = activeStaff.map((m) => ({
  id: m.id,
  name: m.nickname ?? m.user?.name ?? "Unknown",
  image: m.user?.image ?? null,
}))
```

to:

```typescript
const activeStaff = await prisma.membership.findMany({
  where: { venueId: venue.id, status: "active", userId: { not: null } },
  include: {
    user: {
      select: {
        id: true,
        name: true,
        displayName: true,
        image: true,
        characters: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
          select: { characterName: true },
        },
      },
    },
  },
})
const staffForDialog = activeStaff.map((m) => ({
  id: m.id,
  name: resolveDisplayName({
    characterName: m.user?.characters?.[0]?.characterName,
    nickname: m.nickname,
    displayName: m.user?.displayName,
    discordName: m.user?.name,
  }),
  image: m.user?.image ?? null,
}))
```

- [ ] **Step 5: Swap the staff-grid `name` assignment**

Change:

```typescript
        name: shift.membership?.nickname ?? shift.membership?.user?.name ?? "Unknown",
```

to:

```typescript
        name: resolveDisplayName({
          characterName: shift.membership?.user?.characters?.[0]?.characterName,
          nickname: shift.membership?.nickname,
          displayName: shift.membership?.user?.displayName,
          discordName: shift.membership?.user?.name,
        }),
```

- [ ] **Step 6: Swap the 4 remaining inline spots in the actions section**

Change:

```typescript
                        <AvatarFallback className="text-[0.65rem] font-bold">
                          {(shift.membership?.nickname ?? shift.membership?.user?.name)?.slice(0, 2).toUpperCase() ?? "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {shift.membership?.nickname ?? shift.membership?.user?.name ?? "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatServerTime(shift.scheduledStart, "time")} — {formatServerTime(shift.scheduledEnd, "time")} {tzLabel}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className={statusBadge[shift.status] ?? ""}>
                          {shift.status}
                        </Badge>
                        {canManage && shift.status === "SCHEDULED" && (
                          <ClockShiftButton venueSlug={slug} shiftId={shift.id} action="clock-in" staffName={shift.membership?.nickname ?? shift.membership?.user?.name ?? "staff"} />
                        )}
                        {canManage && shift.status === "ACTIVE" && (
                          <ClockShiftButton venueSlug={slug} shiftId={shift.id} action="clock-out" staffName={shift.membership?.nickname ?? shift.membership?.user?.name ?? "staff"} />
                        )}
```

to:

```typescript
                        <AvatarFallback className="text-[0.65rem] font-bold">
                          {resolveDisplayName({
                            characterName: shift.membership?.user?.characters?.[0]?.characterName,
                            nickname: shift.membership?.nickname,
                            displayName: shift.membership?.user?.displayName,
                            discordName: shift.membership?.user?.name,
                          }).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {resolveDisplayName({
                            characterName: shift.membership?.user?.characters?.[0]?.characterName,
                            nickname: shift.membership?.nickname,
                            displayName: shift.membership?.user?.displayName,
                            discordName: shift.membership?.user?.name,
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatServerTime(shift.scheduledStart, "time")} — {formatServerTime(shift.scheduledEnd, "time")} {tzLabel}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className={statusBadge[shift.status] ?? ""}>
                          {shift.status}
                        </Badge>
                        {canManage && shift.status === "SCHEDULED" && (
                          <ClockShiftButton venueSlug={slug} shiftId={shift.id} action="clock-in" staffName={resolveDisplayName({
                            characterName: shift.membership?.user?.characters?.[0]?.characterName,
                            nickname: shift.membership?.nickname,
                            displayName: shift.membership?.user?.displayName,
                            discordName: shift.membership?.user?.name,
                          })} />
                        )}
                        {canManage && shift.status === "ACTIVE" && (
                          <ClockShiftButton venueSlug={slug} shiftId={shift.id} action="clock-out" staffName={resolveDisplayName({
                            characterName: shift.membership?.user?.characters?.[0]?.characterName,
                            nickname: shift.membership?.nickname,
                            displayName: shift.membership?.user?.displayName,
                            discordName: shift.membership?.user?.name,
                          })} />
                        )}
```

- [ ] **Step 7: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `shifts/page.tsx` or `shift-day-dialog.tsx` (Task 2's dependency is now satisfied)

- [ ] **Step 8: Commit**

```bash
cd ~/xiv-app
git add "apps/web/app/dashboard/[slug]/shifts/page.tsx"
git commit -m "feat(names): resolve shifts page staff names through resolveDisplayName"
```

---

### Task 4: Live dashboard — `activeShifts` query + `onShiftStaff`

**Files:**

- Modify: `apps/web/app/dashboard/[slug]/live/page.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { resolveDisplayName } from "@/lib/display-name"
```

- [ ] **Step 2: Extend the query**

Change:

```typescript
const activeShifts = await prisma.shift.findMany({
  where: { venueId: venue.id, status: "ACTIVE" },
  include: {
    membership: {
      include: { user: { select: { name: true, image: true } } },
    },
  },
  take: 10,
})
```

to:

```typescript
const activeShifts = await prisma.shift.findMany({
  where: { venueId: venue.id, status: "ACTIVE" },
  include: {
    membership: {
      include: {
        user: {
          select: {
            name: true,
            displayName: true,
            image: true,
            characters: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              take: 1,
              select: { characterName: true },
            },
          },
        },
      },
    },
  },
  take: 10,
})
```

- [ ] **Step 3: Swap the `onShiftStaff` mapping**

Change:

```typescript
            onShiftStaff={activeShifts.map(s => ({
              name: s.membership?.nickname ?? s.membership?.user?.name ?? s.membership?.invitedName ?? "Staff",
              role: s.membership?.role ?? "STAFF",
            }))}
```

to:

```typescript
            onShiftStaff={activeShifts.map(s => {
              const name = resolveDisplayName({
                characterName: s.membership?.user?.characters?.[0]?.characterName,
                nickname: s.membership?.nickname,
                displayName: s.membership?.user?.displayName,
                discordName: s.membership?.user?.name ?? s.membership?.invitedName,
              })
              return {
                name: name === "Unknown" ? "Staff" : name,
                role: s.membership?.role ?? "STAFF",
              }
            })}
```

Note: `invitedName` (a placeholder set for staff who haven't accepted their invite and have no `User` row yet) is folded into the `discordName` slot ahead of the final `"Unknown"` fallback — it's the right tier for "we don't have a real account yet, but we have _something_ to call them," and this preserves the original chain's exact fallback order (nickname → Discord name → invitedName → "Staff") with character name added on top. The `name === "Unknown" ? "Staff" : name` line preserves the original code's final fallback word ("Staff", not "Unknown") for this specific call site, since that's what the live dashboard used before — computed once, not called twice.

- [ ] **Step 4: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `live/page.tsx`

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app
git add "apps/web/app/dashboard/[slug]/live/page.tsx"
git commit -m "feat(names): resolve live dashboard on-shift staff names through resolveDisplayName"
```

---

### Task 5: Staff management page + `StaffTable`

**Files:**

- Modify: `apps/web/app/dashboard/[slug]/staff/page.tsx`
- Modify: `apps/web/components/staff-table.tsx`

- [ ] **Step 1: Add the import to the page**

In `apps/web/app/dashboard/[slug]/staff/page.tsx`, near the other imports (this page is a server component, so import server-safe — `resolveDisplayName` has no DB access and is fine here, but this page doesn't actually need to call it itself; it only needs to pass raw name fields through to `StaffTable`, which resolves client-side for edit-reactivity — see Step 3).

- [ ] **Step 2: Extend the `staff` query**

Change:

```typescript
const staff = await prisma.membership.findMany({
  where: { venueId: venue.id },
  include: {
    user: {
      select: {
        id: true,
        name: true,
        image: true,
        discordId: true,
      },
    },
    customRole: true,
    additionalRoles: { include: { role: { select: { name: true, color: true } } } },
  },
  orderBy: [
    { role: "asc" }, // OWNER first, then MANAGER, then STAFF
    { createdAt: "asc" },
  ],
})
```

to:

```typescript
const staff = await prisma.membership.findMany({
  where: { venueId: venue.id },
  include: {
    user: {
      select: {
        id: true,
        name: true,
        displayName: true,
        image: true,
        discordId: true,
        characters: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
          select: { characterName: true },
        },
      },
    },
    customRole: true,
    additionalRoles: { include: { role: { select: { name: true, color: true } } } },
  },
  orderBy: [
    { role: "asc" }, // OWNER first, then MANAGER, then STAFF
    { createdAt: "asc" },
  ],
})
```

- [ ] **Step 3: Pass the raw fields through to `StaffTable`**

Change:

```typescript
        <StaffTable
          members={activeStaff.map(m => ({
            id: m.id,
            role: m.role as "OWNER" | "MANAGER" | "STAFF",
            customRole: m.customRole ? { name: m.customRole.name, color: m.customRole.color ?? "#9399b2" } : null,
            additionalRoles: m.additionalRoles
              .filter(ar => ar.roleId !== m.roleId)
              .map(ar => ({ name: ar.role.name, color: ar.role.color ?? "#9399b2" })),
            joinedAt: m.createdAt.toISOString(),
            isOnShift: onShiftIds.has(m.id),
            nickname: m.nickname ?? null,
            user: m.user ? { id: m.user.id, name: m.user.name, image: m.user.image } : null,
            venueId: venue.id,
          }))}
          slug={slug}
          canManage={canManageStaff}
        />
```

to:

```typescript
        <StaffTable
          members={activeStaff.map(m => ({
            id: m.id,
            role: m.role as "OWNER" | "MANAGER" | "STAFF",
            customRole: m.customRole ? { name: m.customRole.name, color: m.customRole.color ?? "#9399b2" } : null,
            additionalRoles: m.additionalRoles
              .filter(ar => ar.roleId !== m.roleId)
              .map(ar => ({ name: ar.role.name, color: ar.role.color ?? "#9399b2" })),
            joinedAt: m.createdAt.toISOString(),
            isOnShift: onShiftIds.has(m.id),
            nickname: m.nickname ?? null,
            user: m.user ? {
              id: m.user.id,
              name: m.user.name,
              displayName: m.user.displayName,
              image: m.user.image,
              characterName: m.user.characters[0]?.characterName ?? null,
            } : null,
            venueId: venue.id,
          }))}
          slug={slug}
          canManage={canManageStaff}
        />
```

- [ ] **Step 4: Extend `StaffMember` type and add the import in `staff-table.tsx`**

In `apps/web/components/staff-table.tsx`, change:

```typescript
import { ChevronDown, Check, Pencil, X } from "lucide-react"

export type StaffMember = {
  id: string
  role: "OWNER" | "MANAGER" | "STAFF"
  customRole: { name: string; color: string } | null
  additionalRoles: { name: string; color: string }[]
  joinedAt: string
  isOnShift: boolean
  nickname: string | null
  user: { id: string; name: string | null; image: string | null } | null
  venueId: string
}
```

to:

```typescript
import { ChevronDown, Check, Pencil, X } from "lucide-react"
import { resolveDisplayName } from "@/lib/display-name"

export type StaffMember = {
  id: string
  role: "OWNER" | "MANAGER" | "STAFF"
  customRole: { name: string; color: string } | null
  additionalRoles: { name: string; color: string }[]
  joinedAt: string
  isOnShift: boolean
  nickname: string | null
  user: {
    id: string
    name: string | null
    displayName: string | null
    image: string | null
    characterName: string | null
  } | null
  venueId: string
}

function memberDisplayName(member: Pick<StaffMember, "nickname" | "user">): string {
  return resolveDisplayName({
    characterName: member.user?.characterName,
    nickname: member.nickname,
    displayName: member.user?.displayName,
    discordName: member.user?.name,
  })
}
```

- [ ] **Step 5: Swap the search filter**

Change:

```typescript
if (search) {
  const q = search.toLowerCase()
  if (
    !(m.nickname ?? m.user?.name ?? "").toLowerCase().includes(q) &&
    !(m.user?.name ?? "").toLowerCase().includes(q) &&
    !(m.customRole?.name ?? "").toLowerCase().includes(q)
  )
    return false
}
```

to:

```typescript
if (search) {
  const q = search.toLowerCase()
  if (
    !memberDisplayName(m).toLowerCase().includes(q) &&
    !(m.user?.name ?? "").toLowerCase().includes(q) &&
    !(m.customRole?.name ?? "").toLowerCase().includes(q)
  )
    return false
}
```

- [ ] **Step 6: Swap the avatar-initials and primary-name display**

Change:

```typescript
                        <AvatarFallback className="text-[0.65rem] font-bold bg-gradient-to-br from-[var(--xiv-blue)] to-blue-700 text-white">
                          {(member.nickname ?? member.user?.name)?.slice(0, 2).toUpperCase() ?? "??"}
                        </AvatarFallback>
```

to:

```typescript
                        <AvatarFallback className="text-[0.65rem] font-bold bg-gradient-to-br from-[var(--xiv-blue)] to-blue-700 text-white">
                          {memberDisplayName(member).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
```

Change:

```typescript
                            <span className="text-sm font-medium">
                              {member.nickname ?? member.user?.name ?? "Unknown"}
                            </span>
```

to:

```typescript
                            <span className="text-sm font-medium">
                              {memberDisplayName(member)}
                            </span>
```

- [ ] **Step 7: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `staff/page.tsx` or `staff-table.tsx`

- [ ] **Step 8: Commit**

```bash
cd ~/xiv-app
git add "apps/web/app/dashboard/[slug]/staff/page.tsx" apps/web/components/staff-table.tsx
git commit -m "feat(names): resolve staff table names through resolveDisplayName"
```

---

### Task 6: Staff API route (`/api/venues/[venueId]/staff`)

**Files:**

- Modify: `apps/web/app/api/venues/[venueId]/staff/route.ts`

This route feeds the payroll page's staff dropdown (Task 8) via `fetch`. It already selects `displayName`; only needs the character sub-select added.

- [ ] **Step 1: Read the file and locate the `user: { select: {...} }` block inside the `GET` handler's `prisma.membership.findMany` call** (the one already shown in exploration: `select: { id: true, name: true, image: true, discordId: true, displayName: true }`).

- [ ] **Step 2: Extend it**

Change:

```typescript
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                discordId: true,
                displayName: true,
```

to:

```typescript
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                discordId: true,
                displayName: true,
                characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
```

(Leave the closing braces of the existing `select` object exactly as they are — this only adds one new key.)

- [ ] **Step 3: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `api/venues/[venueId]/staff/route.ts`

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app
git add "apps/web/app/api/venues/[venueId]/staff/route.ts"
git commit -m "feat(names): include primary character in staff API response"
```

---

### Task 7: Payroll API routes (4 files) + payroll page (3 display spots)

**Files:**

- Modify: `apps/web/app/api/venues/[venueId]/payroll/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate-all/route.ts`
- Modify: `apps/web/app/dashboard/[slug]/payroll/page.tsx`

- [ ] **Step 1: `payroll/route.ts` — extend both `user: { select: {...} }` occurrences**

This file has the `user` select shape `{ id: true, name: true, image: true, displayName: true }` appearing twice (once in the GET list query, once in the POST-created-entry response). For **each** occurrence, change:

```typescript
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  displayName: true,
                },
              },
```

to:

```typescript
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  displayName: true,
                  characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
                },
              },
```

- [ ] **Step 2: `payroll/[payrollId]/route.ts` — extend the `user` select**

Change:

```typescript
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  displayName: true,
                },
              },
```

to:

```typescript
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  displayName: true,
                  characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
                },
              },
```

- [ ] **Step 3: `payroll/generate/route.ts` — extend both `user` selects and the name computation**

First `user` select (feeds `shiftDetails`/eligible-shifts context):

Change:

```typescript
                user: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                    displayName: true,
                  },
                },
```

to:

```typescript
                user: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                    displayName: true,
                    characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
                  },
                },
```

Second `user` select (feeds `staffMembership`, used by the name computation below):

Change:

```typescript
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              image: true,
            },
          },
```

to:

```typescript
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              image: true,
              characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
            },
          },
```

Add the import near the top of the file:

```typescript
import { resolveDisplayName } from "@/lib/display-name"
```

Then change the name computation:

```typescript
        staff: {
          membershipId: staffMembership.id,
          name: staffMembership.user?.displayName || staffMembership.user?.name || "Unknown",
          image: staffMembership.user?.image,
```

to:

```typescript
        staff: {
          membershipId: staffMembership.id,
          name: resolveDisplayName({
            characterName: staffMembership.user?.characters?.[0]?.characterName,
            nickname: staffMembership.nickname,
            displayName: staffMembership.user?.displayName,
            discordName: staffMembership.user?.name,
          }),
          image: staffMembership.user?.image,
```

- [ ] **Step 4: `payroll/generate-all/route.ts` — extend the `user` select and both name computations**

Change:

```typescript
      user: { select: { id: true, name: true, displayName: true, image: true } },
```

to:

```typescript
      user: {
        select: {
          id: true,
          name: true,
          displayName: true,
          image: true,
          characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
        },
      },
```

Add the import near the top of the file:

```typescript
import { resolveDisplayName } from "@/lib/display-name"
```

Then change the first name computation:

```typescript
          name: r.member.user?.displayName || r.member.user?.name || "Unknown",
          image: r.member.user?.image ?? null,
```

to:

```typescript
          name: resolveDisplayName({
            characterName: r.member.user?.characters?.[0]?.characterName,
            nickname: r.member.nickname,
            displayName: r.member.user?.displayName,
            discordName: r.member.user?.name,
          }),
          image: r.member.user?.image ?? null,
```

Then change the second name computation:

```typescript
            name: r.member.user?.displayName || r.member.user?.name || "Unknown",
            shiftCount: r.resolution.includedShiftIds.length,
```

to:

```typescript
            name: resolveDisplayName({
              characterName: r.member.user?.characters?.[0]?.characterName,
              nickname: r.member.nickname,
              displayName: r.member.user?.displayName,
              discordName: r.member.user?.name,
            }),
            shiftCount: r.resolution.includedShiftIds.length,
```

- [ ] **Step 5: `payroll/page.tsx` — add the import and the 3 client-side display spots**

Add near the top:

```typescript
import { resolveDisplayName } from "@/lib/display-name"
```

The `staff` state (rendered at the two `SelectItem`/dropdown spots) comes from `fetch(/api/venues/${slug}/staff)` — Task 6's route, which returns the Prisma array shape `characters: [{ characterName }]`. The `entries` state (rendered in the payroll table) comes from `fetch(/api/venues/${slug}/payroll)` — Task 7 Step 1's route, same array shape. Both client-side interfaces need `characters: { characterName: string }[]` added as a sibling field to `displayName: string | null` (not a flattened `characterName` field — that shape is only used internally by `generate`/`generate-all`'s server-computed preview responses, which this page's `staff`/`entries` state doesn't consume). Locate the two `interface` blocks shown in exploration (one for payroll entries' `membership.user`, one for the standalone `StaffMember` type) and add `characters: { characterName: string }[]` to each.

Change:

```typescript
{
  member.nickname ?? member.user?.displayName ?? member.user?.name ?? "Unknown"
}
{
  member.hourlyRate ? ` (${member.hourlyRate} Gil/hr)` : ""
}
```

to:

```typescript
{
  resolveDisplayName({
    characterName: member.user?.characters?.[0]?.characterName,
    nickname: member.nickname,
    displayName: member.user?.displayName,
    discordName: member.user?.name,
  })
}
{
  member.hourlyRate ? ` (${member.hourlyRate} Gil/hr)` : ""
}
```

Change:

```typescript
                          <SelectItem key={member.id} value={member.id}>
                            {member.nickname ?? member.user?.displayName ?? member.user?.name ?? "Unknown"}
                          </SelectItem>
```

to:

```typescript
                          <SelectItem key={member.id} value={member.id}>
                            {resolveDisplayName({
                              characterName: member.user?.characters?.[0]?.characterName,
                              nickname: member.nickname,
                              displayName: member.user?.displayName,
                              discordName: member.user?.name,
                            })}
                          </SelectItem>
```

Change:

```typescript
const name = entry.isManualEntry
  ? entry.manualEntryName || "Unknown"
  : (entry.membership?.nickname ?? entry.membership?.user?.displayName ?? entry.membership?.user?.name ?? "Unknown")
```

to:

```typescript
const name = entry.isManualEntry
  ? entry.manualEntryName || "Unknown"
  : resolveDisplayName({
      characterName: entry.membership?.user?.characters?.[0]?.characterName,
      nickname: entry.membership?.nickname,
      displayName: entry.membership?.user?.displayName,
      discordName: entry.membership?.user?.name,
    })
```

- [ ] **Step 6: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing any of the 5 files touched in this task

- [ ] **Step 7: Commit**

```bash
cd ~/xiv-app
git add "apps/web/app/api/venues/[venueId]/payroll" "apps/web/app/dashboard/[slug]/payroll/page.tsx"
git commit -m "feat(names): resolve payroll staff names through resolveDisplayName"
```

---

### Task 8: Sales — `transactions.ts` + `discord-webhook.ts`

**Files:**

- Modify: `apps/web/lib/api/transactions.ts`
- Modify: `apps/web/lib/discord-webhook.ts` (no code change — signature already compatible, listed for reference only)

- [ ] **Step 1: Add the import**

In `apps/web/lib/api/transactions.ts`, near the other imports:

```typescript
import { resolveDisplayName } from "@/lib/display-name"
```

- [ ] **Step 2: Extend the `staff` select and add a membership lookup for nickname**

`Transaction.staff` relates directly to `User` (no `Membership` relation on `Transaction`), so the venue-specific nickname needs its own lookup. Change:

```typescript
      staff: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  // Discord webhook (fire-and-forget - never block the response)
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      discordWebhookUrl: true,
      settings: true,
    },
  })
```

to:

```typescript
      staff: {
        select: {
          id: true,
          name: true,
          displayName: true,
          characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
        },
      },
    },
  })

  // The nickname is venue-specific and Transaction has no direct Membership
  // relation (only staffId -> User), so look it up separately.
  const staffMembership = newTransaction.staff
    ? await prisma.membership.findFirst({
        where: { userId: newTransaction.staff.id, venueId },
        select: { nickname: true },
      })
    : null

  const resolvedStaffName = newTransaction.staff
    ? resolveDisplayName({
        characterName: newTransaction.staff.characters[0]?.characterName,
        nickname: staffMembership?.nickname,
        displayName: newTransaction.staff.displayName,
        discordName: newTransaction.staff.name,
      })
    : null

  // Discord webhook (fire-and-forget - never block the response)
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      discordWebhookUrl: true,
      settings: true,
    },
  })
```

- [ ] **Step 3: Use the resolved name in the webhook embed**

Change:

```typescript
const embed = formatSaleLoggedEmbed({
  amount: Number(newTransaction.amount),
  service: newTransaction.service,
  customerName: sanitizeDiscordContent(newTransaction.customerName, {
    maxLength: 100,
    stripUrls: true,
  }),
  staff: newTransaction.staff,
})
```

to:

```typescript
const embed = formatSaleLoggedEmbed({
  amount: Number(newTransaction.amount),
  service: newTransaction.service,
  customerName: sanitizeDiscordContent(newTransaction.customerName, {
    maxLength: 100,
    stripUrls: true,
  }),
  staff: resolvedStaffName ? { name: resolvedStaffName } : null,
})
```

- [ ] **Step 4: Use the resolved name in the SSE payload**

Change:

```typescript
venueEventBus.emit(venueId, {
  id: newTransaction.id,
  type: "sale",
  venueId,
  timestamp: newTransaction.createdAt.toISOString(),
  data: {
    amount: Number(newTransaction.amount),
    customerName: newTransaction.customerName,
    service: newTransaction.service,
    staff: newTransaction.staff,
    notes: newTransaction.notes,
  },
})
```

to:

```typescript
venueEventBus.emit(venueId, {
  id: newTransaction.id,
  type: "sale",
  venueId,
  timestamp: newTransaction.createdAt.toISOString(),
  data: {
    amount: Number(newTransaction.amount),
    customerName: newTransaction.customerName,
    service: newTransaction.service,
    staff: resolvedStaffName ? { id: newTransaction.staff?.id, name: resolvedStaffName } : null,
    notes: newTransaction.notes,
  },
})
```

This keeps `data.staff.id`/`data.staff.name` shaped exactly as `live-dashboard.tsx`'s SSE consumer already expects (`data.staff?.id === currentUserId`, `data.staff.name`) — no changes needed there.

- [ ] **Step 5: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `transactions.ts`

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app
git add apps/web/lib/api/transactions.ts
git commit -m "feat(names): resolve sale-logged staff name for webhook + live SSE feed"
```

---

### Task 9: Staff-joined webhook (`invites/[token]/accept`)

**Files:**

- Modify: `apps/web/app/api/invites/[token]/accept/route.ts`

- [ ] **Step 1: Add the import**

```typescript
import { resolveDisplayName } from "@/lib/display-name"
```

- [ ] **Step 2: Extend the `updatedMembership` query's `user` select**

Change:

```typescript
      include: {
        venue: {
          select: {
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            name: true,
          },
        },
      },
    })
```

to:

```typescript
      include: {
        venue: {
          select: {
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            name: true,
            displayName: true,
            characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
          },
        },
      },
    })
```

- [ ] **Step 3: Use the resolved name in the webhook call**

Change:

```typescript
const embed = formatStaffJoinedEmbed({
  name: session.user.name || null,
  role: membership.role,
})
```

to:

```typescript
const embed = formatStaffJoinedEmbed({
  name: resolveDisplayName({
    characterName: updatedMembership.user?.characters?.[0]?.characterName,
    nickname: updatedMembership.nickname,
    displayName: updatedMembership.user?.displayName,
    discordName: updatedMembership.user?.name ?? session.user.name,
  }),
  role: membership.role,
})
```

- [ ] **Step 4: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `invites/[token]/accept/route.ts`

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app
git add "apps/web/app/api/invites/[token]/accept/route.ts"
git commit -m "feat(names): resolve staff-joined webhook name through resolveDisplayName"
```

---

### Task 10: Activity timeline (`/api/venues/[venueId]/timeline`)

**Files:**

- Modify: `apps/web/app/api/venues/[venueId]/timeline/route.ts`

- [ ] **Step 1: Add the import**

```typescript
import { resolveDisplayName } from "@/lib/display-name"
```

- [ ] **Step 2: Extend the transactions query's `staff` select and resolve the name**

Change:

```typescript
        staff: {
          select: {
            id: true,
            name: true,
            image: true,
            memberships: {
              where: { venueId },
              select: {
                role: true,
                customRole: { select: { name: true, color: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    for (const t of transactions) {
      items.push({
        id: `sale_${t.id}`,
        type: "sale",
        timestamp: t.createdAt,
        data: {
          amount: Number(t.amount),
          customerName: t.customerName,
          notes: t.notes,
          service: t.service,
          event: t.event,
          staff: t.staff,
        },
      })
    }
```

to:

```typescript
        staff: {
          select: {
            id: true,
            name: true,
            displayName: true,
            image: true,
            characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
            memberships: {
              where: { venueId },
              select: {
                nickname: true,
                role: true,
                customRole: { select: { name: true, color: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    for (const t of transactions) {
      const resolvedStaffName = t.staff
        ? resolveDisplayName({
            characterName: t.staff.characters[0]?.characterName,
            nickname: t.staff.memberships[0]?.nickname,
            displayName: t.staff.displayName,
            discordName: t.staff.name,
          })
        : null
      items.push({
        id: `sale_${t.id}`,
        type: "sale",
        timestamp: t.createdAt,
        data: {
          amount: Number(t.amount),
          customerName: t.customerName,
          notes: t.notes,
          service: t.service,
          event: t.event,
          staff: t.staff ? { ...t.staff, name: resolvedStaffName } : null,
        },
      })
    }
```

Keeping the rest of `t.staff`'s fields (id, memberships, etc.) via the spread means any other consumer reading `data.staff.id` or `.memberships` keeps working; only `.name` changes to the resolved value.

- [ ] **Step 3: Extend the shifts query and swap `staffName`**

Change:

```typescript
    const shifts = await prisma.shift.findMany({
      where: shiftWhere as any,
      include: {
        membership: {
          include: {
            user: { select: { id: true, name: true, image: true } },
            customRole: { select: { name: true, color: true } },
          },
        },
      },
      orderBy: { actualStart: "desc" },
      take: limit,
    })

    for (const s of shifts) {
      const staffName = s.membership?.user?.name ?? "Unknown"
      const roleName = s.membership?.customRole?.name ?? s.membership?.role ?? "Staff"
```

to:

```typescript
    const shifts = await prisma.shift.findMany({
      where: shiftWhere as any,
      include: {
        membership: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                displayName: true,
                image: true,
                characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
              },
            },
            customRole: { select: { name: true, color: true } },
          },
        },
      },
      orderBy: { actualStart: "desc" },
      take: limit,
    })

    for (const s of shifts) {
      const staffName = resolveDisplayName({
        characterName: s.membership?.user?.characters?.[0]?.characterName,
        nickname: s.membership?.nickname,
        displayName: s.membership?.user?.displayName,
        discordName: s.membership?.user?.name,
      })
      const roleName = s.membership?.customRole?.name ?? s.membership?.role ?? "Staff"
```

- [ ] **Step 4: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `timeline/route.ts`

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app
git add "apps/web/app/api/venues/[venueId]/timeline/route.ts"
git commit -m "feat(names): resolve timeline sale + shift staff names through resolveDisplayName"
```

---

### Task 11: Character-link nudge banner

**Files:**

- Create: `apps/web/components/character-link-nudge.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`
- Modify: `apps/web/app/dashboard/[slug]/page.tsx`

- [ ] **Step 1: Write the component**

```typescript
// apps/web/components/character-link-nudge.tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"

/**
 * Shown only when the logged-in user has no linked FFXIV character at all
 * (computed server-side by the page, not tracked as a dismissal here) - the
 * point is to keep nagging until they actually link one, not to nag once
 * and never again. Dismissing just hides it for the current page view;
 * it reappears next visit if still applicable. Deliberately a separate
 * component from AnnouncementBanner, not merged into it, so it can never
 * be confused with or crowd out a real announcement.
 */
export function CharacterLinkNudge() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div
      className="relative rounded-xl overflow-hidden mb-3"
      style={{
        background: "linear-gradient(135deg, rgba(249,226,175,0.08) 0%, rgba(249,226,175,0.03) 100%)",
        border: "1px solid rgba(249,226,175,0.25)",
      }}
    >
      <div className="px-5 py-3.5 pr-10 flex items-center gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground flex-1 min-w-0">
          Link your FFXIV character so sales, shifts, and staff lists show your character
          name instead of your Discord name.
        </p>
        <Link
          href="/dashboard/account/characters"
          className="text-sm font-semibold text-[var(--xiv-blue)] hover:underline flex-shrink-0"
        >
          Link a character
        </Link>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Wire into the main dashboard page**

In `apps/web/app/dashboard/page.tsx`, add the import near the other component imports:

```typescript
import { CharacterLinkNudge } from "@/components/character-link-nudge"
```

Add the character-count query right after the existing `announcements` query:

```typescript
const announcements = await prisma.announcement.findMany({
  where: {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    dismissals: { none: { userId: session.user.id } },
  },
  select: { id: true, title: true, message: true, link: true, linkLabel: true },
  orderBy: { createdAt: "desc" },
})
```

becomes:

```typescript
const announcements = await prisma.announcement.findMany({
  where: {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    dismissals: { none: { userId: session.user.id } },
  },
  select: { id: true, title: true, message: true, link: true, linkLabel: true },
  orderBy: { createdAt: "desc" },
})

const hasLinkedCharacter =
  (await prisma.userCharacter.count({
    where: { userId: session.user.id },
  })) > 0
```

Then render it right below `<AnnouncementBanner>`:

```typescript
      <AnnouncementBanner announcements={announcements} />
```

becomes:

```typescript
      <AnnouncementBanner announcements={announcements} />
      {!hasLinkedCharacter && <CharacterLinkNudge />}
```

- [ ] **Step 3: Wire into the venue dashboard page**

In `apps/web/app/dashboard/[slug]/page.tsx`, add the same import:

```typescript
import { CharacterLinkNudge } from "@/components/character-link-nudge"
```

Add the same character-count query right after its existing `announcements` query:

```typescript
const announcements = await prisma.announcement.findMany({
  where: {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    dismissals: { none: { userId: session.user.id } },
  },
  select: { id: true, title: true, message: true, link: true, linkLabel: true },
  orderBy: { createdAt: "desc" },
})
```

becomes:

```typescript
const announcements = await prisma.announcement.findMany({
  where: {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    dismissals: { none: { userId: session.user.id } },
  },
  select: { id: true, title: true, message: true, link: true, linkLabel: true },
  orderBy: { createdAt: "desc" },
})

const hasLinkedCharacter =
  (await prisma.userCharacter.count({
    where: { userId: session.user.id },
  })) > 0
```

Then render it right below `<AnnouncementBanner>`:

```typescript
        <AnnouncementBanner announcements={announcements} />
```

becomes:

```typescript
        <AnnouncementBanner announcements={announcements} />
        {!hasLinkedCharacter && <CharacterLinkNudge />}
```

- [ ] **Step 4: Verify it type-checks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors referencing `character-link-nudge.tsx`, `dashboard/page.tsx`, or `dashboard/[slug]/page.tsx`

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app
git add apps/web/components/character-link-nudge.tsx apps/web/app/dashboard/page.tsx "apps/web/app/dashboard/[slug]/page.tsx"
git commit -m "feat(onboarding): nudge users with no linked character to add one"
```

---

### Task 12: Manual verification in the browser

**Files:** none (verification only)

This project has no test framework — verification is manual, against the running dev server, matching how every prior feature in this codebase was verified.

- [ ] **Step 1: Start the dev server and confirm `tsc --noEmit` is fully clean**

Run: `cd apps/web && npx tsc --noEmit`
Expected: zero errors across the whole project (not just the files touched in this plan)

Run: `cd apps/web && pnpm dev`
Expected: starts without errors

- [ ] **Step 2: Verify the fallback chain for an account with no linked character**

Log in as a staff member with no `UserCharacter` row. Confirm:

- The character-link nudge banner appears on `/dashboard` and on a venue's `/dashboard/<slug>` page, below any real announcements (if none are active, confirm the nudge still renders correctly on its own)
- Their name shows as nickname (if set) or Discord name (if not) everywhere: shifts week grid, shifts calendar day dialog, live dashboard on-shift list, staff table, payroll dropdown/table

- [ ] **Step 3: Verify the fallback chain for an account with a linked character**

Either use an account that already has one, or link one via `/dashboard/account/characters` for a test account. Confirm:

- The nudge banner no longer appears for that account
- Their character name now shows everywhere from Step 2, taking priority over nickname/Discord name

- [ ] **Step 4: Verify the sales webhook and live feed**

Log a sale (via the web dashboard's Log Sale flow or the plugin, whichever is available) as the character-linked account. Confirm:

- The live activity feed on `/dashboard/<slug>/live` shows the character name in the sale entry, not the Discord name
- If a Discord webhook is configured for the test venue, confirm the "Sale Logged" embed's "Logged By" field shows the character name
- Reload the live page and confirm the historical activity feed (loaded from `/api/venues/[venueId]/timeline`) also shows the character name for that same sale

- [ ] **Step 5: Verify the staff-joined webhook**

If feasible to test (requires a fresh invite-accept flow and a configured webhook), confirm the "New staff member" embed shows the joining account's resolved name, not just their raw Discord name.

- [ ] **Step 6: Check the browser console**

Confirm no errors or warnings across all pages touched in Steps 2-5.
