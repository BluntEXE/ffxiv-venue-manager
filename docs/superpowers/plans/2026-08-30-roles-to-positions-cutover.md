# Roles→Positions Full Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the venue Role CRUD API routes (`roles/route.ts`, `roles/[roleId]/route.ts`) to read and write exclusively through xvm-api's Positions module — no Prisma `Role` reads or writes left in these two files. This is a full cutover, not a dual-write or migration: existing venues without an `xvmApiVenueId` link (i.e. everyone except the one manually-linked test venue right now) will correctly get a 409 "not connected" response, matching the existing pattern `hours`/`rooms` routes already use. Populating real venues with xvm-api data is a separate, later concern (migration path + testing against real prod-copied venues, worked out before any prod cutover) — out of scope for this plan.

**Architecture:** Add `deletePosition` to the existing `lib/api/xvm-api.ts` client (the only Positions CRUD function missing from today's earlier work). Rewrite both route files to call `listPositions`/`createPosition`/`updatePosition`/`deletePosition` instead of `prisma.role.*`, using the exact `requireXvmVenueId`/`getValidXvmApiToken` gate pattern already established in `hours/route.ts`. Translate xvm-api's `PositionRow` shape back into the response shape the existing `staff/roles/page.tsx` UI already expects (color hex↔int, dollars↔minor-units, `member_ids.length`→`_count.memberships`) using the conversion helpers built earlier today (`lib/api/position-convert.ts`) — so the UI needs minimal changes, mainly: (1) the `id` field type changes from string to number, and (2) the `potPayoutMode`/`contractorSharesPot` form controls get disabled with an explanatory note since xvm-api doesn't accept writes to those fields yet.

**Tech Stack:** Next.js route handlers, Zod validation, the existing `xvm-api.ts` HTTP client, `position-convert.ts` helpers (already built, already tested).

**Explicitly out of scope for this plan:**
- The 5 other files reading `prisma.role`/`MembershipRoleAssignment` directly (`payroll-rates.ts`, `shifts/route.ts`, `shifts/page.tsx`, `staff/[membershipId]/route.ts`, `pot-payroll/route.ts`) — untouched, keep reading Prisma.
- Role/Position member assignment (`additionalRoleIds`, primary `roleId` on a Membership) — lives in `staff/[membershipId]/route.ts`, not touched here.
- Any data migration for real venues — deferred, will be worked out later against a prod-copied test set (same shape as today's Positions migration script exercise).

---

### Task 1: Add `deletePosition` to the xvm-api client

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts` (add one function to the existing `// ── Positions API ──` section)

- [ ] **Step 1: Add the function**

Add immediately after the existing `assignPositionMember` function in `apps/web/lib/api/xvm-api.ts` (in the `// ── Positions API ──` section — do not create a new section, this belongs with the existing Position functions):

```typescript
export async function deletePosition(personToken: string, venueId: string, positionId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/positions/${positionId}`, { method: "DELETE" }, personToken)
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts
git commit -m "feat: add deletePosition to xvm-api client"
```

---

### Task 2: Rewrite `roles/route.ts` (list + create) to use xvm-api only

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/roles/route.ts` (full rewrite)

Read the current file first (`apps/web/app/api/venues/[venueId]/roles/route.ts`) to see the exact response shape `staff/roles/page.tsx` currently depends on — the goal is to preserve that shape as closely as possible (translated field values, not a redesigned API contract), so the page needs minimal changes. Also read `apps/web/app/api/venues/[venueId]/hours/route.ts` for the exact `requireXvmVenueId`/`getValidXvmApiToken`/`invalidateXvmApiCredential` gate pattern to copy — this route must follow that pattern precisely, not invent a new one.

- [ ] **Step 1: Write the new route**

Replace the full contents of `apps/web/app/api/venues/[venueId]/roles/route.ts` with:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import { listPositions, createPosition, XvmApiError, xvmErrorMessage, type PositionRow } from "@/lib/api/xvm-api"
import { hexColorToInt, intColorToHex, dollarsToMinorUnits, minorUnitsToDollars } from "@/lib/api/position-convert"
import { validators } from "@/lib/validation"

const createRoleSchema = z.object({
  name: validators.roleName,
  responsibilities: validators.roleDescription,
  color: z.string().optional(),
  hourlyRate: z.number().positive().nullable().optional(),
})

// Matches the shape staff/roles/page.tsx already expects, so the page needs
// no logic changes — just its TypeScript types (id: string -> number).
function toRoleShape(position: PositionRow) {
  return {
    id: position.id,
    name: position.name,
    color: intColorToHex(position.color),
    responsibilities: position.responsibilities,
    hourlyRate: minorUnitsToDollars(position.hourly_rate_minor),
    potPayoutMode: position.pot_payout_mode,
    contractorSharesPot: position.contractor_shares_pot,
    permissions: null,
    _count: { memberships: position.member_ids.length },
  }
}

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const positions = await listPositions(token, gate.xvmApiVenueId!)
      return NextResponse.json(positions.map(toRoleShape))
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[roles] GET error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof createRoleSchema>
    try {
      data = createRoleSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const position = await createPosition(token, gate.xvmApiVenueId!, {
        name: data.name,
        color: data.color ? hexColorToInt(data.color) : null,
        responsibilities: data.responsibilities ?? null,
        hourly_rate_minor: dollarsToMinorUnits(data.hourlyRate ?? null),
      })
      return NextResponse.json(toRoleShape(position), { status: 201 })
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[roles] POST error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: errors in `staff/roles/page.tsx` (its types still assume the old shape/string id) — these are expected at this point and get fixed in Task 4. Confirm the *route file itself* has no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/roles/route.ts
git commit -m "feat: cut roles list/create route over to xvm-api Positions"
```

---

### Task 3: Rewrite `roles/[roleId]/route.ts` (get/update/delete) to use xvm-api only

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/roles/[roleId]/route.ts` (full rewrite)

xvm-api has no single-position GET endpoint — `GET` here has to call `listPositions` and find the matching id. The `roleId` URL param is a string but now represents an xvm-api integer id, so it needs `Number(roleId)` with a NaN guard (a malformed/old-style cuid roleId in a stale bookmark/link should 404, not crash).

Read the current file (`apps/web/app/api/venues/[venueId]/roles/[roleId]/route.ts`) first for the exact existing response/error shape to preserve, and reuse the `toRoleShape`/`requireXvmVenueId` helpers — since they're identical to Task 2's, define them locally in this file too (matching the existing repo convention of small per-route helper duplication rather than a shared module — see how `hours/route.ts` and `hours/[hoursId]/route.ts` each define their own local `requireXvmVenueId` rather than sharing one).

- [ ] **Step 1: Write the new route**

Replace the full contents of `apps/web/app/api/venues/[venueId]/roles/[roleId]/route.ts` with:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import {
  listPositions,
  updatePosition,
  deletePosition,
  XvmApiError,
  xvmErrorMessage,
  type PositionRow,
} from "@/lib/api/xvm-api"
import { hexColorToInt, intColorToHex, dollarsToMinorUnits, minorUnitsToDollars } from "@/lib/api/position-convert"
import { validators } from "@/lib/validation"

const updateRoleSchema = z.object({
  name: validators.roleName.optional(),
  responsibilities: validators.roleDescription,
  color: z.string().optional(),
  hourlyRate: z.number().positive().nullable().optional(),
})

function toRoleShape(position: PositionRow) {
  return {
    id: position.id,
    name: position.name,
    color: intColorToHex(position.color),
    responsibilities: position.responsibilities,
    hourlyRate: minorUnitsToDollars(position.hourly_rate_minor),
    potPayoutMode: position.pot_payout_mode,
    contractorSharesPot: position.contractor_shares_pot,
    permissions: null,
    _count: { memberships: position.member_ids.length },
  }
}

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; roleId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, roleId } = await context.params
    const positionId = Number(roleId)
    if (!Number.isInteger(positionId)) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const positions = await listPositions(token, gate.xvmApiVenueId!)
      const position = positions.find((p) => p.id === positionId)
      if (!position) {
        return NextResponse.json({ error: "Role not found" }, { status: 404 })
      }
      return NextResponse.json(toRoleShape(position))
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[roles] GET one error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; roleId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, roleId } = await context.params
    const positionId = Number(roleId)
    if (!Number.isInteger(positionId)) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updateRoleSchema>
    try {
      data = updateRoleSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const position = await updatePosition(token, gate.xvmApiVenueId!, positionId, {
        name: data.name,
        color: data.color !== undefined ? hexColorToInt(data.color) : undefined,
        responsibilities: data.responsibilities,
        hourly_rate_minor: data.hourlyRate !== undefined ? dollarsToMinorUnits(data.hourlyRate) : undefined,
      })
      return NextResponse.json(toRoleShape(position))
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[roles] PUT error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; roleId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, roleId } = await context.params
    const positionId = Number(roleId)
    if (!Number.isInteger(positionId)) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deletePosition(token, gate.xvmApiVenueId!, positionId)
      return NextResponse.json({ success: true })
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[roles] DELETE error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 5, window: "1 m" }
)
```

Note: xvm-api's `create_position`/`update_position` return a 409 with message "A position with this name (case-insensitive) already exists" on a name collision, and `PositionUpdate`'s `_REQUIRED_COLUMNS` (`name`) rejects an explicit null on name — both cases already surface correctly through the generic `XvmApiError`/`xvmErrorMessage` handling above, matching how `hours/route.ts` handles equivalent xvm-api validation errors. No bespoke duplicate-name pre-check needed (unlike the old Prisma route, which had to do this manually — xvm-api's own uniqueness constraint + 409 response covers it).

Also note: the old route required tier `OWNER`/`MANAGER` for POST/PUT and `OWNER` only for DELETE, checked against Prisma's `Membership.role`. xvm-api's own `create_position`/`update_position`/`delete_position` endpoints already enforce their own tier requirements server-side (`require_tier(Manager)` per the router source) — so this cutover relies on xvm-api's own authorization, not a duplicated local check. If xvm-api's actual tier requirement for delete turns out to be Manager rather than Owner-only, that's a real behavior change from today's stricter Owner-only Prisma check — flag this in your self-review, don't silently accept a permission loosening without noting it.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: same expected `staff/roles/page.tsx` errors as Task 2 (fixed in Task 4), no errors in the route file itself.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/roles/[roleId]/route.ts"
git commit -m "feat: cut role get/update/delete route over to xvm-api Positions"
```

---

### Task 4: Update `staff/roles/page.tsx` types and disable unsupported fields

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/staff/roles/page.tsx`

This task does NOT redesign the page — it makes the minimum changes needed for it to compile and behave honestly against the new API contract: (1) `id` is now `number`, not `string`, everywhere it's used (state types, map keys, comparison logic, URL/fetch paths); (2) the `potPayoutMode` dropdown and `contractorSharesPot` checkbox get disabled with a short inline note, since xvm-api doesn't accept writes to those fields yet — don't remove the controls, disable them so the UI is honest about *why* rather than making them silently vanish.

- [ ] **Step 1: Read the current file in full**

Read `apps/web/app/dashboard/[slug]/staff/roles/page.tsx` (682 lines) before making changes — this step has no shown diff because the exact edits depend on every place `id: string` is threaded through this file's state/props, which must be found by reading, not guessed from a snippet.

- [ ] **Step 2: Fix the id type**

Find every place in the file typed as `id: string` for a Role (the interface/type near the top of the file, likely around line 50-60 based on the earlier grep showing `permissions`/`potPayoutMode` fields at lines 57-60), and change it to `id: number`. Find every place that does string operations on a role id specifically (e.g. `role.id === someString`, template-literal URL building like `` `/api/venues/${venueId}/roles/${role.id}` ``) and confirm they still work correctly with a number (template literals coerce numbers to strings fine; strict `===` comparisons against a literal string elsewhere need updating to compare against a number instead — search for every `.id ===` and `.id !==` involving a role/position id).

- [ ] **Step 3: Disable the pot-payout controls**

At both places the `potPayoutMode` `<Select>` and the conditional `contractorSharesPot` checkbox appear (there are two near-duplicate blocks in this file per the earlier grep — approximately lines 439-465 and 584-610), add a `disabled` prop to the `<Select>` component and the checkbox `<input>`, and add one short line of explanatory text near each (e.g. "Pot payout settings aren't available yet" or similar short, non-alarming copy matching this app's existing tone — check a neighboring disabled-state message elsewhere in this codebase for the house style before writing your own wording, don't invent a new tone).

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors, anywhere in the repo

- [ ] **Step 5: Run the test suite**

Run: `cd apps/web && pnpm test`
Expected: same pass/fail count as before this task started (this file has no dedicated test file today per a check of the test suite — if that's still true, this step just confirms nothing else broke)

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/staff/roles/page.tsx"
git commit -m "fix: adapt roles page to Positions id type, disable unsupported pot-payout fields"
```

---

### Task 5: Live verification against the real connected test venue

**Files:** none (verification only)

- [ ] **Step 1: Confirm local dev DB and xvm-api-dev are reachable**

Run: `docker ps --format '{{.Names}}\t{{.Status}}' | grep xiv-app`
Expected: `xiv-app-postgres-local` and `xiv-app-redis-local` both `Up`

- [ ] **Step 2: Start the dev server**

Run: `cd apps/web && pnpm dev` (background/separate terminal — this needs to keep running for the next steps)

- [ ] **Step 3: Exercise the roles page against the real connected test venue**

Navigate to the staff roles page for the venue with slug `ddfdsfdfds` (the one with `xvmApiVenueId: ven_xx499NE0rPoa`, already connected). Confirm:
- The existing "Manager" position (created earlier today) shows up in the list, with the correct color swatch rendered (proves `intColorToHex` round-trips correctly through the UI, not just in isolation).
- Creating a new role with a custom color and an hourly rate succeeds, and the created role appears in the list with the right color/rate displayed.
- Editing that role's name/color/rate succeeds and the list reflects the change.
- The pot-payout dropdown/checkbox are visibly disabled with the explanatory note.
- Deleting the newly-created (unassigned) role succeeds.
- Attempting the same flow against a **different, unconnected** dev venue returns the "hasn't been connected to xvm-api yet" message rather than an empty list or a crash — confirms the 409 gate works as intended, not silently showing nothing.

- [ ] **Step 4: Clean up any role created during manual verification**

If Step 3's test role wasn't already deleted as part of the walkthrough, delete it now via the UI or `deletePosition` directly, so `ven_xx499NE0rPoa` is left with only its original "Manager" position, matching the state from the end of today's earlier Positions migration script work.
