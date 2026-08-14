# Zod Validation Registry — Staff Invite Route (Increment 8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `app/api/venues/[venueId]/staff/invite/route.ts`'s POST handler onto zod validation, closing two real gaps: `invitedEmail` has **zero format validation** — any string is accepted and stored, despite `validators.email` already existing in the registry (added at some point in the past, but with **zero current consumers** anywhere in the codebase — this is its first real use); and `invitedName` is completely unbounded.

**Architecture:** Same `.parse()` + try/catch + `z.ZodError` → 400 pattern as every prior increment. `role` is folded into the same schema even though it already has a correctly-working manual `.includes()` check — since a schema is being built for this route anyway, including the one field that was already right costs nothing and keeps the whole request body validated in one place rather than half-schema/half-manual-check. `roleId` (a nullable FK reference, never actually sent by the real client but present in the route's existing logic) gets a basic type/non-empty check for defense-in-depth.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod.

**Confirmed real client request shape (checked during planning, 2026-08-14):** `app/dashboard/[slug]/staff/invite/page.tsx:96-100` — the only caller of this route — always sends `role` (a real string from a `<select>`, one of `STAFF`/`MANAGER`/`OWNER`), `invitedName` (a real string or explicit `null`), `invitedEmail` (a real string or explicit `null`). **`roleId` is never sent by any caller found during planning** (grepped both `staff/invite/page.tsx` and `staff/page.tsx`) — it's a real field the route's existing logic already handles (`let effectiveRoleId: string | null = roleId || null`), just currently unused by the actual UI. No legitimate caller is affected by tightening `invitedEmail`/`invitedName`.

**Real gaps confirmed by reading the route during planning (2026-08-14):**

1. `apps/web/app/api/venues/[venueId]/staff/invite/route.ts:88` — `invitedEmail: invitedEmail || null` — no format check at all. Any string (not just a real email) is written to `Membership.invitedEmail` and used downstream wherever staff invites are displayed/emailed. `validators.email` (`apps/web/lib/validation.ts:36`, `z.string().email("Invalid email").max(255, "Email too long")`) already exists for exactly this shape but has never been consumed by any route — this is its first real wiring-up.
2. `apps/web/app/api/venues/[venueId]/staff/invite/route.ts:87` — `invitedName: invitedName || null` — no length cap at all, unlike every other name-shaped field migrated in this rollout (`characterName` 40, `roleName` 50, `displayName` 50).

- [ ] **Step 1: No action needed** — confirmed above.

---

## Task 1: Migrate `app/api/venues/[venueId]/staff/invite/route.ts`

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/staff/invite/route.ts`

- [ ] **Step 1: Add the zod import and define the invite schema**

Current (`apps/web/app/api/venues/[venueId]/staff/invite/route.ts:1-7`):

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { ensureManagerRole } from "@/lib/api/venue-setup"
```

New:

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { ensureManagerRole } from "@/lib/api/venue-setup"
import { validators } from "@/lib/validation"

const inviteSchema = z.object({
  role: z.enum(["STAFF", "MANAGER", "OWNER"], { message: "Invalid role" }),
  roleId: z.string().min(1).optional().nullable(),
  invitedName: z.string().max(100, "Name too long (max 100 characters)").optional().nullable(),
  invitedEmail: validators.email.optional().nullable(),
})
```

`invitedName` stays a route-local field (single-consumer, matches this rollout's "don't promote single-consumer fields" rule) — 100 characters matches the `customerName` precedent already in the registry for a similarly-shaped "a person's name, not an account" field. `validators.email` is reused directly since it's an exact match for this field's shape and already exists — it just needed `.optional().nullable()` added at the call site (the registry entry itself, `z.string().email().max(255)`, stays required-by-default since a future consumer might legitimately need a required email; this route wraps it as optional/nullable locally rather than modifying the shared field, since — unlike Increment 7's `venueDescription`/`venueLocation`/`url` widening — no other consumer of `validators.email` exists yet to justify widening the shared definition itself).

- [ ] **Step 2: Replace the manual role check and raw destructure with the parsed schema**

Current (`apps/web/app/api/venues/[venueId]/staff/invite/route.ts:22-28`):

```typescript
      const { params } = context
      const { venueId } = await params
    const body = await request.json()
    const { role, roleId, invitedName, invitedEmail } = body

    // Validate role
    if (!["STAFF", "MANAGER", "OWNER"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }
```

New:

```typescript
      const { params } = context
      const { venueId } = await params
    const body = await request.json()
    let role: "STAFF" | "MANAGER" | "OWNER", roleId: string | null | undefined, invitedName: string | null | undefined, invitedEmail: string | null | undefined
    try {
      const parsed = inviteSchema.parse(body)
      role = parsed.role
      roleId = parsed.roleId
      invitedName = parsed.invitedName
      invitedEmail = parsed.invitedEmail
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      throw error
    }
```

Note the existing file has inconsistent indentation around this block (the `const body = await request.json()` line and its siblings are under-indented relative to the surrounding code, visible in the "Current" snippet above) — preserve that file's existing indentation style for the lines you're not changing; don't take this task as a chance to reformat unrelated code. Match whatever indentation the actual current file has at this location, even if it looks inconsistent.

The rest of the function (the owner-inviting-owner check, the `effectiveRoleId`/`ensureManagerRole` logic, `crypto.randomBytes` token generation, the `prisma.membership.create` call, the response) is completely unchanged — it already correctly references `role`, `roleId`, `invitedName`, `invitedEmail` as local variables, which now come from the validated `parsed` object instead of raw destructuring. Specifically confirm the `invitedName: invitedName || null` and `invitedEmail: invitedEmail || null` lines inside the `prisma.membership.create` call's `data: {...}` still work correctly — they will, since `invitedName`/`invitedEmail` are now `string | null | undefined` from the schema (same effective type shape as before, just now validated), and `|| null` still correctly normalizes an empty-ish value to `null` for the Prisma write... actually since the schema already produces `null` for an explicit `null` input and a real string for a real string input, and never produces `undefined` inside this variable if the key was present, the `|| null` at the create-call site remains harmless (a redundant no-op for the normal cases, but doesn't need to be removed — leave it as-is, don't over-refactor beyond the scope of this task).

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/staff/invite/route.ts
git commit -m "fix(web): validate staff invite POST body, close unbounded invitedEmail/invitedName gap"
```

---

## Task 2: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification (session-authenticated, use an active browser session if available)**

Use a real venue the signed-in account has OWNER/MANAGER role at (a disposable `TEST_VENUE`-typed one if available, to avoid creating throwaway pending-invite rows against a real venue's staff list).

1. Regression check: `{ role: "STAFF", invitedName: "Test Person", invitedEmail: "test@example.com" }` → 200, a real invite created with a working `inviteUrl`.
2. `{ role: "STAFF", invitedEmail: "not-an-email" }` → expect 400 (invalid email format, previously accepted as-is).
3. `{ role: "STAFF", invitedName: "a".repeat(101) }` → expect 400 (name over the 100-char cap).
4. `{ role: "NOT_A_ROLE" }` → expect 400 (regression check — this already worked before, confirm the message/shape didn't silently change in a way that breaks the client's error display).
5. `{ role: "STAFF", invitedName: null, invitedEmail: null }` → expect 200 (regression check — the real UI's default "no name/email given" case still works).

If a pending-membership row gets created during verification (steps 1 and 5 will create real rows), clean it up afterward via `prisma.membership.deleteMany({ where: { inviteToken: <the token from the response> } })` or the equivalent `psql` delete, so no stray pending invites are left in the venue's staff list.

- [ ] **Step 3: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms. Reorder in practice as established: push → confirm deploy → deploy → THEN run Step 2's manual verification against the now-live code → update the roadmap doc.
