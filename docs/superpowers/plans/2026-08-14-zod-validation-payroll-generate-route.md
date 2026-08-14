# Zod Validation Registry — Payroll Generate Route (Increment 10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `app/api/venues/[venueId]/payroll/generate/route.ts`'s POST handler onto zod validation for 3 fields (`baseRate`, `bonusAmount`, `notes`) that have zero validation — the same bug class as Increment 9's payroll PATCH fix, in a sibling payroll route. `membershipId`, `periodStart`, `periodEnd` already have correct manual validation in this route (`isNaN(date.getTime())`, `endDate < startDate`, required-field checks) and are left untouched.

**Architecture:** Same `.parse()` + try/catch + `z.ZodError` → 400 pattern as every prior increment. Narrow scope, matching Increment 9's approach on the sibling PATCH route: only the 3 fields with a demonstrated gap.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod.

**Confirmed real client request shape (checked during planning, 2026-08-14):** `app/dashboard/[slug]/payroll/page.tsx:413-422` (the only caller) does `baseRate: genRateOverride ? parseFloat(genRateOverride) : undefined` and `bonusAmount: genBonus ? parseFloat(genBonus) : undefined` — client-side `parseFloat` on malformed input produces `NaN`, and `JSON.stringify` serializes `NaN` to `null` (a JSON quirk — `NaN`/`Infinity` aren't valid JSON, `JSON.stringify` silently converts them to `null`). So the real browser UI is *incidentally* protected from ever sending a non-numeric `baseRate`/`bonusAmount` — the actual exposure is a **non-browser caller** (curl, a future API client, or a malicious direct request) sending a JSON string like `{"baseRate": "not-a-number"}`, which the browser UI can never produce but the API itself has always accepted with no check. This is a real gap in the route's public contract, just a lower-likelihood one than Increment 9's — still worth closing since it's the identical crash bug class (`new Decimal("abc")` throws uncaught) already fixed twice elsewhere in this same payroll feature area.

**Real gaps confirmed by reading the route during planning (2026-08-14):**

1. `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts:141-145` — `if (baseRate !== undefined && baseRate !== null) { const overrideRate = new Decimal(baseRate) ... }` — no format/bounds check before `new Decimal()`. Malformed input throws uncaught, caught only by the route's generic `catch (error) { ... return 500 }`.
2. `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts:180-181,193` — `if (bonusAmount) { totalAmount = totalAmount.add(new Decimal(bonusAmount)) }` and `bonusAmount: bonusAmount ? new Decimal(bonusAmount) : null` — same gap.
3. `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts:197` — `notes: notes || null` — no length cap, unlike the sibling POST (`payroll/route.ts`) and PATCH (`payroll/[payrollId]/route.ts`) routes, which both cap `notes` at 10,000 characters.

- [ ] **Step 1: No action needed** — confirmed above.

---

## Task 1: Migrate the 3-field validation gap in `app/api/venues/[venueId]/payroll/generate/route.ts`

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts`

- [ ] **Step 1: Add the zod import and define a local schema for the 3 fields**

Current (`apps/web/app/api/venues/[venueId]/payroll/generate/route.ts:1-9`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { fetchRoleRates, resolveShiftRates } from "@/lib/payroll-rates"
import { resolveDisplayName } from "@/lib/display-name"
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { fetchRoleRates, resolveShiftRates } from "@/lib/payroll-rates"
import { resolveDisplayName } from "@/lib/display-name"
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>

const payrollGenerateOptionalsSchema = z.object({
  baseRate: z.union([
    z.coerce.number().min(0, "Invalid base rate. Must be a positive number").max(999999999, "Invalid base rate. Must be a positive number"),
    z.null(),
  ]).optional(),
  bonusAmount: z.union([
    z.coerce.number().min(0, "Invalid bonus amount. Must be a positive number").max(999999999, "Invalid bonus amount. Must be a positive number"),
    z.null(),
  ]).optional(),
  notes: z.string().max(10000, "Notes must be 10,000 characters or less").optional().nullable(),
})
```

`baseRate`/`bonusAmount` are `z.union([..., z.null()])` for the same reason as Increment 9's payroll PATCH schema: the route's existing code explicitly checks `baseRate !== undefined && baseRate !== null` (i.e. `null` is a meaningful, already-supported "use the default rate" signal, distinct from "not provided"), so the schema must let `null` pass through without going through numeric coercion.

- [ ] **Step 2: Parse the 3 fields, leave `membershipId`/`periodStart`/`periodEnd` validation completely untouched**

Current (`apps/web/app/api/venues/[venueId]/payroll/generate/route.ts:75-95`):

```typescript
      const body = await request.json()
      const { membershipId, periodStart, periodEnd, baseRate, bonusAmount, notes } = body

      // Validate required fields
      if (!membershipId || !periodStart || !periodEnd) {
        return NextResponse.json(
          { error: "membershipId, periodStart, and periodEnd are required" },
          { status: 400 }
        )
      }

      const startDate = new Date(periodStart)
      const endDate = new Date(periodEnd)
      endDate.setUTCHours(23, 59, 59, 999)

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
      }
      if (endDate < startDate) {
        return NextResponse.json(
          { error: "Period end must be after period start" },
          { status: 400 }
        )
      }
```

New (only the destructure line changes — the required-field check and all date validation below it stay byte-for-byte identical):

```typescript
      const body = await request.json()
      const { membershipId, periodStart, periodEnd } = body

      let baseRate: number | null | undefined, bonusAmount: number | null | undefined, notes: string | null | undefined
      try {
        const parsedOptionals = payrollGenerateOptionalsSchema.parse(body)
        baseRate = parsedOptionals.baseRate
        bonusAmount = parsedOptionals.bonusAmount
        notes = parsedOptionals.notes
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
        }
        throw error
      }

      // Validate required fields
      if (!membershipId || !periodStart || !periodEnd) {
        return NextResponse.json(
          { error: "membershipId, periodStart, and periodEnd are required" },
          { status: 400 }
        )
      }

      const startDate = new Date(periodStart)
      const endDate = new Date(periodEnd)
      endDate.setUTCHours(23, 59, 59, 999)

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
      }
      if (endDate < startDate) {
        return NextResponse.json(
          { error: "Period end must be after period start" },
          { status: 400 }
        )
      }
```

The new validation block runs BEFORE the existing `membershipId`/`periodStart`/`periodEnd` required-field check — this is a deliberate, low-risk ordering choice (validate the optional-field *shapes* first, then check the separate required-field *presence*), not a functional requirement; either order is fine since the two checks are independent of each other's fields. Everything else in the function (the `new Decimal(baseRate)` usage at the override-rate branch, the `bonusAmount ? new Decimal(bonusAmount) : null` line, the `notes: notes || null` line, the shift-fetching/aggregation logic, the `prisma.payrollEntry.create` call, the response) is completely unchanged — it already correctly references `baseRate`/`bonusAmount`/`notes` as local variables, which now come from the validated `parsedOptionals` object instead of raw destructuring.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/payroll/generate/route.ts"
git commit -m "fix(web): validate payroll generate baseRate/bonusAmount/notes, close Decimal-crash gap"
```

---

## Task 2: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification (session-authenticated, use an active browser session if available)**

This route generates a payroll entry from completed shifts, so a full happy-path regression check needs a real staff membership with completed, unpaid shifts in the target period — likely not available on a disposable test venue. Scope verification to what's checkable without that setup:

1. `{ baseRate: "not-a-number", membershipId: "<any-real-membership-id>", periodStart: "2026-01-01", periodEnd: "2026-01-07" }` → expect 400 (validation error), NOT a 500 — this is checkable regardless of whether the membership has eligible shifts, since validation now runs before the shift-lookup logic.
2. `{ bonusAmount: "abc", membershipId: "<any-real-membership-id>", periodStart: "2026-01-01", periodEnd: "2026-01-07" }` → expect 400.
3. `{ notes: "a".repeat(10001), membershipId: "<any-real-membership-id>", periodStart: "2026-01-01", periodEnd: "2026-01-07" }` → expect 400.
4. `{ baseRate: null, membershipId: "<any-real-membership-id>", periodStart: "2026-01-01", periodEnd: "2026-01-07" }` → expect the request to proceed past validation (likely landing on "No eligible shifts" or similar downstream business-logic error, NOT a validation error) — confirms `null` is still accepted as "use default rate," not rejected.
5. If a disposable test venue has a real staff membership with completed unpaid shifts available, a full happy-path regression check (valid `baseRate` override, entry actually created) is worth doing — but do not force-create shift data solely for this check if it's not already available; steps 1-4 are sufficient to confirm the fix without it.

- [ ] **Step 3: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms. Reorder in practice as established: push → confirm deploy → deploy → THEN run Step 2's manual verification against the now-live code → update the roadmap doc.
