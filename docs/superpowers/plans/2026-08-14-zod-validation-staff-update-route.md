# Zod Validation Registry — Staff Membership Update Route (Increment 12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a real gap in `app/api/venues/[venueId]/staff/[membershipId]/route.ts`'s PATCH/PUT handler: `invitedEmail` has **zero format validation** and `invitedName` has **zero length cap** — the exact same fields, on a sibling route, that Increment 8 already fixed on `staff/invite/route.ts` (invite creation). This route (editing an _existing_ membership) never got the same treatment.

**Architecture:** Minimal, surgical swap of 2 field definitions in the existing `updateStaffSchema` — reuse `validators.email` (now in its 2nd real use, after Increment 8) and a route-local 100-char cap on `invitedName` matching Increment 8's precedent exactly. Everything else in this schema (`role`, `roleId`, `status`, `nickname`, `temporaryRole`, `temporaryRoleExpiresAt`, `permanentRole`, `additionalRoleIds`, `tipPooled`) is untouched — not in scope, no demonstrated gap found there during planning.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod.

**Confirmed real gap and zero-reachability status (checked during planning, 2026-08-14):** `apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts:12-13` — `invitedName: z.string().nullable().optional()` and `invitedEmail: z.string().nullable().optional()`, both completely unvalidated (no `.email()`, no `.max()`). Checked the real caller (`app/dashboard/[slug]/staff/[membershipId]/page.tsx`) — it has 3 fetch call sites against this route: one sends `{ role, roleId, additionalRoleIds }`, one sends `{ tipPooled }`, one is a `DELETE` with no body. **None of the 3 ever sends `invitedName`/`invitedEmail`** — same "real gap in the API contract, currently unreachable via any UI path" category as Increment 7's `location` field and Increment 9/10's payroll fields. Still worth fixing: any authenticated OWNER/MANAGER of the venue (or a future UI change) could otherwise write an unbounded string or a malformed non-email string into `Membership.invitedEmail`/`invitedName`.

---

## Task 1: Migrate `invitedEmail`/`invitedName` in `app/api/venues/[venueId]/staff/[membershipId]/route.ts`

**Files:**

- Modify: `apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts`

- [ ] **Step 1: Add the import, swap the 2 fields**

Current (`apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts:1-20`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const updateStaffSchema = z.object({
  role: z.enum(["OWNER", "MANAGER", "STAFF"]).optional(),
  roleId: z.string().nullable().optional(),
  status: z.string().optional(),
  invitedName: z.string().nullable().optional(),
  invitedEmail: z.string().nullable().optional(),
  nickname: z.string().max(50).nullable().optional(),
  temporaryRole: z.enum(["OWNER", "MANAGER", "STAFF"]).nullable().optional(),
  temporaryRoleExpiresAt: z.string().nullable().optional(),
  permanentRole: z.enum(["OWNER", "MANAGER", "STAFF"]).nullable().optional(),
  additionalRoleIds: z.array(z.string()).optional(),
  tipPooled: z.boolean().nullable().optional(),
})
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"

const updateStaffSchema = z.object({
  role: z.enum(["OWNER", "MANAGER", "STAFF"]).optional(),
  roleId: z.string().nullable().optional(),
  status: z.string().optional(),
  invitedName: z.string().max(100, "Name too long (max 100 characters)").nullable().optional(),
  invitedEmail: validators.email.nullable().optional(),
  nickname: z.string().max(50).nullable().optional(),
  temporaryRole: z.enum(["OWNER", "MANAGER", "STAFF"]).nullable().optional(),
  temporaryRoleExpiresAt: z.string().nullable().optional(),
  permanentRole: z.enum(["OWNER", "MANAGER", "STAFF"]).nullable().optional(),
  additionalRoleIds: z.array(z.string()).optional(),
  tipPooled: z.boolean().nullable().optional(),
})
```

`invitedName`'s 100-char cap is route-local (single-consumer, matches Increment 8's identical field on the sibling `staff/invite/route.ts`, kept local there per the same "don't promote single-consumer fields" rule — no registry field exists for this exact shape, and there's no reason to create one for 2 consumers that already each define it locally with the same bound). `invitedEmail` reuses `validators.email` (`z.string().email().max(255)`, defined in `apps/web/lib/validation.ts:36`) wrapped in `.nullable().optional()` at the call site, exactly matching how Increment 8 wrapped it for the sibling route.

Every other field in the schema (`role`, `roleId`, `status`, `nickname`, `temporaryRole`, `temporaryRoleExpiresAt`, `permanentRole`, `additionalRoleIds`, `tipPooled`) is unchanged.

- [ ] **Step 2: Confirm nothing downstream needs changing**

`apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts:146-147` — `if (validatedData.invitedName !== undefined) updateData.invitedName = validatedData.invitedName` and the equivalent line for `invitedEmail` — these already correctly handle the `string | null | undefined` shape the schema produces, no changes needed here. Confirm this by reading the actual current lines before treating this step as complete — if the surrounding logic has drifted from this description, adapt Step 1's field definitions to fit, but do not modify these assignment lines themselves as part of this task.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts"
git commit -m "fix(web): validate staff update invitedEmail/invitedName, close unbounded/unformatted gap"
```

---

## Task 2: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification (session-authenticated, use an active browser session if available)**

Use a real membership on the disposable "Velvet Rift" test venue (the account's own OWNER membership there, from Increments 7-11, works fine as the target — this only touches `invitedName`/`invitedEmail`, cosmetic fields unlikely to be relied on for the account's own real membership, but capture the current values first via `GET`-equivalent so they can be restored, or just verify the round-trip without needing to preserve prior state since these fields are typically null for an OWNER's own auto-created membership anyway).

1. `{ invitedEmail: "not-an-email" }` → expect 400 (previously accepted as-is).
2. `{ invitedName: "a".repeat(101) }` → expect 400 (previously unbounded).
3. `{ invitedEmail: "test@example.com", invitedName: "Test Name" }` → expect 200, values actually set in the response (regression check — confirms the fix doesn't break a legitimate future caller of this contract).
4. `{ invitedEmail: null, invitedName: null }` → expect 200, values cleared back to `null` (restores original state if the membership used for testing didn't already have these set).

- [ ] **Step 3: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms. Reorder in practice as established: push → confirm deploy → deploy → THEN run Step 2's manual verification against the now-live code → update the roadmap doc.
