# Zod Validation Registry — Payroll Entry Update Route (Increment 9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `app/api/venues/[venueId]/payroll/[payrollId]/route.ts`'s PATCH handler onto zod validation for 6 fields (`baseRate`, `hoursWorked`, `bonusAmount`, `periodStart`, `periodEnd`, `notes`) that currently have **zero** validation — a genuine inconsistency within this same file: the sibling POST route (`app/api/venues/[venueId]/payroll/route.ts`, already reviewed during planning, not touched by this task) validates these exact same fields with `parseFloat`/`isNaN`/bounds checks, but the PATCH route skips straight to `new Decimal(x)`/`new Date(x)` with no checks at all.

**Architecture:** Same `.parse()` + try/catch + `z.ZodError` → 400 pattern as every prior increment. **Narrow, surgical scope**: this task only touches the 6 fields listed above. `isPaid` (already correctly type-checked via `typeof isPaid === "boolean"`) and `manualEntryName` (already correctly length-capped inline, with business logic tied to `existingEntry.isManualEntry` that this task does not want to disturb) are left completely untouched — folding already-correct fields into a new schema is fine when it's low-risk (as this rollout has done before), but here `manualEntryName`'s check is intertwined with a conditional business rule, so touching it adds risk for zero benefit. Stay scoped to the 6 fields with a demonstrated real gap.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod.

**Confirmed real client request shape (checked during planning, 2026-08-14):** `app/dashboard/[slug]/payroll/page.tsx:326-350` (`handleMarkAsPaid`) is the **only** caller of this route found anywhere in the codebase, and it only ever sends `{ isPaid: boolean }` — never `baseRate`/`hoursWorked`/`bonusAmount`/`periodStart`/`periodEnd`/`notes`/`manualEntryName`. This means the 6-field validation gap this task closes is **not reachable through any current UI path** — it's a real gap in the route's public API contract (any authenticated OWNER/MANAGER of the venue, or a future UI feature, could trigger it), matching the same "real but currently UI-unreachable" category as Increment 7's `location` field. Since no live caller sends these fields, there is zero regression risk from tightening them — the fix only affects requests that would previously have crashed with a 500 anyway.

**Real gaps confirmed by reading the route during planning (2026-08-14):**

1. `apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts:132` — `if (baseRate !== undefined) updateData.baseRate = new Decimal(baseRate)` — no validation. `new Decimal("abc")` (Decimal.js, the library backing Prisma's `Decimal` type) throws a `DecimalError` for non-numeric input, uncaught by anything more specific than the route's outer `catch (error) { ... return 500 }` — a malformed `baseRate` crashes with a 500 instead of a clean 400. The sibling POST route validates this exact field with `parseFloat`/`isNaN`/range checks (0-999999999).
2. `apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts:133-138` — same gap for `hoursWorked` (POST bounds: 0-9999) and `bonusAmount` (POST bounds: 0-999999999).
3. `apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts:139-140` — `if (periodStart) updateData.periodStart = new Date(periodStart)` — no `isNaN(date.getTime())` check, unlike the POST route which explicitly validates this. An unparseable `periodStart`/`periodEnd` produces a JS `Invalid Date` object, which Prisma rejects at write time with an uncaught error → 500.
4. `apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts:141` — `if (notes !== undefined) updateData.notes = notes` — no length cap, unlike the POST route's explicit 10,000-character limit.

- [ ] **Step 1: No action needed** — confirmed above.

---

## Task 1: Migrate the 6-field validation gap in `app/api/venues/[venueId]/payroll/[payrollId]/route.ts`'s PATCH handler

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts`

- [ ] **Step 1: Add the zod import and define a local schema for the 6 fields**

Current (`apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts:1-8`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
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
import { Prisma } from "@/generated/prisma/client"
const Decimal = Prisma.Decimal
type Decimal = InstanceType<typeof Prisma.Decimal>

const payrollPatchSchema = z.object({
  baseRate: z.coerce.number()
    .min(0, "Invalid base rate. Must be a positive number")
    .max(999999999, "Invalid base rate. Must be a positive number")
    .optional(),
  hoursWorked: z.union([
    z.coerce.number()
      .min(0, "Invalid hours worked. Must be a positive number")
      .max(9999, "Invalid hours worked. Must be a positive number"),
    z.null(),
  ]).optional(),
  bonusAmount: z.union([
    z.coerce.number()
      .min(0, "Invalid bonus amount. Must be a positive number")
      .max(999999999, "Invalid bonus amount. Must be a positive number"),
    z.null(),
  ]).optional(),
  periodStart: z.string()
    .refine((v) => !isNaN(new Date(v).getTime()), "Invalid date format")
    .optional(),
  periodEnd: z.string()
    .refine((v) => !isNaN(new Date(v).getTime()), "Invalid date format")
    .optional(),
  notes: z.string().max(10000, "Notes must be 10,000 characters or less").optional().nullable(),
})
```

Notes on this schema's design:
- `baseRate` uses `z.coerce.number()` (not plain `z.number()`) because the old code's `parseFloat(baseRate)` (in the sibling POST route) accepted either a JSON number or a numeric string — `z.coerce.number()` preserves that same leniency (it calls `Number(x)` internally, same coercion `parseFloat`/`Number` both perform for well-formed numeric strings). A non-numeric string like `"abc"` still fails cleanly (`Number("abc")` is `NaN`, which zod's `z.number()` — the base type `z.coerce.number()` wraps — rejects).
- `hoursWorked`/`bonusAmount` are `z.union([<validated number>, z.null()])` rather than a plain nullable number, because the OLD code's own semantics were "any falsy value (including `0`, empty string, or explicit `null`) becomes `null`" (`hoursWorked ? new Decimal(hoursWorked) : null`) — this task does not change that downstream falsy-collapse behavior (see Step 2), it only adds validation for the case where a truthy, malformed value is sent. `z.null()` in the union lets an explicit `null` pass straight through without going through the numeric coercion/bounds check (which would otherwise reject `null` outright, since `Number(null)` is `0`, not `null`, and coercing `null` to `0` would silently change its meaning).
- `periodStart`/`periodEnd` use a `.refine()` with the exact same check the sibling POST route already does (`isNaN(date.getTime())`) rather than a stricter format like `validators.datetime` (ISO 8601 only) — this preserves identical acceptance behavior to the POST route's proven-working validation rather than guessing at a new, possibly-stricter format with no confirmed real caller to test against.
- `isPaid` and `manualEntryName` are deliberately NOT in this schema — see Task 0/plan header for why.

- [ ] **Step 2: Parse the 6 fields, leave `isPaid`/`manualEntryName` handling completely untouched**

Current (`apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts:81-141`):

```typescript
      const body = await request.json()
      const {
        isPaid,
        manualEntryName,
        baseRate,
        hoursWorked,
        bonusAmount,
        periodStart,
        periodEnd,
        notes,
      } = body

      // Prepare update data
      const updateData: {
        isPaid?: boolean
        paidAt?: Date | null
        paidBy?: string | null
        manualEntryName?: string | null
        baseRate?: Decimal
        hoursWorked?: Decimal | null
        bonusAmount?: Decimal | null
        totalAmount?: Decimal
        periodStart?: Date
        periodEnd?: Date
        notes?: string | null
      } = {}

      // Update manual entry name if provided (only for manual entries)
      if (manualEntryName !== undefined && existingEntry.isManualEntry) {
        if (manualEntryName && manualEntryName.trim().length > 255) {
          return NextResponse.json(
            { error: "Name must be 255 characters or less" },
            { status: 400 }
          )
        }
        updateData.manualEntryName = manualEntryName ? manualEntryName.trim() : null
      }

      // Handle marking as paid/unpaid
      if (typeof isPaid === "boolean") {
        updateData.isPaid = isPaid
        if (isPaid) {
          updateData.paidAt = new Date()
          updateData.paidBy = session.user.id
        } else {
          updateData.paidAt = null
          updateData.paidBy = null
        }
      }

      // Update other fields if provided
      if (baseRate !== undefined) updateData.baseRate = new Decimal(baseRate)
      if (hoursWorked !== undefined) {
        updateData.hoursWorked = hoursWorked ? new Decimal(hoursWorked) : null
      }
      if (bonusAmount !== undefined) {
        updateData.bonusAmount = bonusAmount ? new Decimal(bonusAmount) : null
      }
      if (periodStart) updateData.periodStart = new Date(periodStart)
      if (periodEnd) updateData.periodEnd = new Date(periodEnd)
      if (notes !== undefined) updateData.notes = notes
```

New (only the destructure at the top changes — everything else, including the entire body of the function shown above, is byte-for-byte identical):

```typescript
      const body = await request.json()
      const { isPaid, manualEntryName } = body

      let baseRate: number | undefined,
        hoursWorked: number | null | undefined,
        bonusAmount: number | null | undefined,
        periodStart: string | undefined,
        periodEnd: string | undefined,
        notes: string | null | undefined
      try {
        const parsed = payrollPatchSchema.parse(body)
        baseRate = parsed.baseRate
        hoursWorked = parsed.hoursWorked
        bonusAmount = parsed.bonusAmount
        periodStart = parsed.periodStart
        periodEnd = parsed.periodEnd
        notes = parsed.notes
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
        }
        throw error
      }

      // Prepare update data
      const updateData: {
        isPaid?: boolean
        paidAt?: Date | null
        paidBy?: string | null
        manualEntryName?: string | null
        baseRate?: Decimal
        hoursWorked?: Decimal | null
        bonusAmount?: Decimal | null
        totalAmount?: Decimal
        periodStart?: Date
        periodEnd?: Date
        notes?: string | null
      } = {}

      // Update manual entry name if provided (only for manual entries)
      if (manualEntryName !== undefined && existingEntry.isManualEntry) {
        if (manualEntryName && manualEntryName.trim().length > 255) {
          return NextResponse.json(
            { error: "Name must be 255 characters or less" },
            { status: 400 }
          )
        }
        updateData.manualEntryName = manualEntryName ? manualEntryName.trim() : null
      }

      // Handle marking as paid/unpaid
      if (typeof isPaid === "boolean") {
        updateData.isPaid = isPaid
        if (isPaid) {
          updateData.paidAt = new Date()
          updateData.paidBy = session.user.id
        } else {
          updateData.paidAt = null
          updateData.paidBy = null
        }
      }

      // Update other fields if provided
      if (baseRate !== undefined) updateData.baseRate = new Decimal(baseRate)
      if (hoursWorked !== undefined) {
        updateData.hoursWorked = hoursWorked ? new Decimal(hoursWorked) : null
      }
      if (bonusAmount !== undefined) {
        updateData.bonusAmount = bonusAmount ? new Decimal(bonusAmount) : null
      }
      if (periodStart) updateData.periodStart = new Date(periodStart)
      if (periodEnd) updateData.periodEnd = new Date(periodEnd)
      if (notes !== undefined) updateData.notes = notes
```

Everything from `// Recalculate totalAmount if any payment fields changed` onward (`apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts:143-195`, the `prisma.payrollEntry.update` call and its `include`, the final response) is completely unchanged — it already reads `baseRate`/`hoursWorked`/`bonusAmount` as local variables, which now come from the validated `parsed` object instead of raw destructuring, with identical runtime shape (`number | null | undefined`) to before.

The entire `DELETE` handler below (line 207 onward) is untouched — this task only modifies the `PATCH` handler.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/payroll/[payrollId]/route.ts"
git commit -m "fix(web): validate payroll PATCH numeric/date fields, close crash gap vs sibling POST route"
```

---

## Task 2: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification (session-authenticated, use an active browser session if available)**

This requires a real `PayrollEntry` row to PATCH against. Create a disposable one first (e.g. via the sibling POST route, `POST /api/venues/<venueId>/payroll`, using a disposable test venue like the `TEST_VENUE`-typed one used in Increments 7-8, with `isManualEntry: true` so no real staff membership is touched) — or use an existing payroll entry on a disposable test venue if one already exists. Then, against that entry's ID:

1. Regression check: `{ isPaid: true }` → 200, `isPaid` actually flips (this is the ONLY thing the real UI ever sends — must keep working exactly as before).
2. `{ baseRate: "not-a-number" }` → expect 400, NOT a 500 (the core bug being fixed).
3. `{ hoursWorked: "abc" }` → expect 400.
4. `{ periodStart: "not-a-date" }` → expect 400, NOT a 500.
5. `{ notes: "a".repeat(10001) }` → expect 400.
6. `{ baseRate: 500 }` → expect 200, `baseRate`/`totalAmount` actually update correctly in the response (regression check — confirms the recalculation block still works with a validated numeric value).
7. `{ hoursWorked: null }` → expect 200, `hoursWorked` actually clears to `null` in the response (confirms the `z.union([..., z.null()])` design preserves the old explicit-null-clear behavior).

Delete the disposable payroll entry (and any disposable test venue data created solely for this verification) afterward via `psql` or the DELETE endpoint.

- [ ] **Step 3: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms. Reorder in practice as established: push → confirm deploy → deploy → THEN run Step 2's manual verification against the now-live code → update the roadmap doc.
