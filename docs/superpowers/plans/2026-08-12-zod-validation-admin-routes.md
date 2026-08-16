# Zod Validation Registry — Admin Routes (Increment 1) Implementation Plan

**DONE, deployed and fully verified 2026-08-13** — commit `e9420c4`, merged to `main` via `zod-validation-admin-routes` branch (isolated worktree, subagent-driven-development, 4 tasks + final whole-branch review). 45/45 tests, typecheck, build all green; 13/13 smoke checks post-deploy. Manual admin-session verification (Task 5 Step 2) confirmed by the user: `?status=NOT_A_REAL_STATUS` returns 400 with the real enum values listed, an over-2000-char admin note is rejected, and creating an announcement with a link still works (also exercised the migrated `validators.url` reuse from Task 4).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the 4 admin API routes onto `lib/validation.ts`'s shared `validators` registry with one consistent zod-error-handling pattern, closing two real validation gaps found along the way (unchecked feedback status/category, unbounded `adminNotes`).

**Architecture:** Extend `lib/validation.ts`'s `validators` object with the field schemas these routes actually need (feedback status/category enums, an `adminNotes`-shaped bounded string). Each route builds a local `z.object({...})` from those shared pieces and validates with `schema.parse(body)` inside the route's existing try/catch, catching `error instanceof z.ZodError` to return a 400 — this is the majority pattern already in use across the codebase's 26 `.parse()`-based routes (vs. 16 using `safeParse`), and it's what `app/api/admin/announcements/route.ts` already does, so migrating the sibling `feedback` routes onto it is less churn than switching everything to `safeParse`. Future increments of this same roadmap item should follow this same pattern.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod, Vitest.

---

## Task 0: Confirm scope and testing approach (no code — read before starting)

**Enum values, confirmed from `apps/web/prisma/schema.prisma:830-844`:**

```typescript
enum FeedbackCategory {
  BUG_REPORT,
  FEATURE_REQUEST,
  IMPROVEMENT,
  GENERAL,
}
enum FeedbackStatus {
  NEW,
  UNDER_REVIEW,
  PLANNED,
  IN_PROGRESS,
  COMPLETED,
  WONT_FIX,
}
```

These match `app/api/admin/feedback/[feedbackId]/route.ts`'s inline status array exactly — use the Prisma schema as the source of truth going forward, not the route's copy (which this plan removes in Task 2).

**`app/api/admin/announcements/[id]/route.ts` needs no zod schema.** Its only handler is `DELETE`, and the only input is `id`, which comes from the Next.js route segment (`context.params`) — already a guaranteed string by the time the handler runs, not a request body. There is nothing here to validate with zod. This plan does not touch that file. (Confirmed by reading it in full during planning — it has no `request.json()` call at all.)

**No route-handler-level test precedent exists in this codebase.** `app/api/**/*.test.ts` — zero files. The one existing API-adjacent test, `lib/api/transactions.test.ts`, tests a plain exported function (`createTransaction`) with Prisma mocked at the module level, not a `NextRequest` passed through an exported `GET`/`POST` handler wrapped in `withRateLimit(...)`. Building a full request/response test harness for Next.js route handlers is a bigger undertaking than this 4-route increment warrants. This plan's tests (Task 1) cover the _schemas_ directly — real, meaningful unit tests, just not full-request integration tests — and Task 4 covers the routes themselves with manual `curl` verification, matching how this codebase has verified other API-route work.

- [ ] **Step 1: No action needed** — confirmed above.

---

## Task 1: Add feedback field schemas to the shared registry, with tests

**Files:**

- Modify: `apps/web/lib/validation.ts`
- Test: `apps/web/lib/validation.test.ts` (new file — none exists yet for this module)

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/lib/validation.test.ts
import { describe, it, expect } from "vitest"
import { validators } from "./validation"

describe("validators.feedbackStatus", () => {
  it("accepts each real FeedbackStatus enum value", () => {
    for (const status of ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "COMPLETED", "WONT_FIX"]) {
      expect(validators.feedbackStatus.safeParse(status).success).toBe(true)
    }
  })

  it("rejects a value not in the enum", () => {
    expect(validators.feedbackStatus.safeParse("ARCHIVED").success).toBe(false)
  })
})

describe("validators.feedbackCategory", () => {
  it("accepts each real FeedbackCategory enum value", () => {
    for (const category of ["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"]) {
      expect(validators.feedbackCategory.safeParse(category).success).toBe(true)
    }
  })

  it("rejects a value not in the enum", () => {
    expect(validators.feedbackCategory.safeParse("OTHER").success).toBe(false)
  })
})

describe("validators.adminNotes", () => {
  it("accepts a reasonable-length string", () => {
    expect(validators.adminNotes.safeParse("Looks good, ship it.").success).toBe(true)
  })

  it("accepts undefined (optional field)", () => {
    expect(validators.adminNotes.safeParse(undefined).success).toBe(true)
  })

  it("rejects a string over 2000 characters", () => {
    expect(validators.adminNotes.safeParse("a".repeat(2001)).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run lib/validation.test.ts
```

Expected: FAIL — `validators.feedbackStatus is undefined` (property doesn't exist yet).

- [ ] **Step 3: Add the schemas**

In `apps/web/lib/validation.ts`, add to the existing `validators` object (after the `timezone` entry, before the closing `}` at line 43):

```typescript
  feedbackStatus: z.enum(["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "COMPLETED", "WONT_FIX"]),
  feedbackCategory: z.enum(["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"]),
  adminNotes: z.string().max(2000, "Notes too long (max 2000 characters)").optional(),
```

(2000-char cap chosen to match this file's existing `taskDescription`/`payrollNotes` scale of limits — no smaller bound was specified anywhere in the current code, and this is an internal admin-only field, so a generous-but-bounded limit is the right default rather than guessing a tighter one.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run lib/validation.test.ts
```

Expected: PASS, 6/6.

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/validation.ts apps/web/lib/validation.test.ts
git commit -m "feat(web): add feedback status/category/adminNotes to shared validators"
```

---

## Task 2: Migrate `app/api/admin/feedback/[feedbackId]/route.ts` (PATCH)

**Files:**

- Modify: `apps/web/app/api/admin/feedback/[feedbackId]/route.ts`

- [ ] **Step 1: Replace the manual status check with a zod schema**

Current (`apps/web/app/api/admin/feedback/[feedbackId]/route.ts`, inside the `PATCH` handler):

```typescript
const { feedbackId } = await params
const body = await request.json()
const { status, adminNotes } = body

// Validate status if provided
const validStatuses = ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "COMPLETED", "WONT_FIX"]
if (status && !validStatuses.includes(status)) {
  return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 })
}
```

Replace with:

```typescript
const { feedbackId } = await params
const body = await request.json()
const { status, adminNotes } = updateSchema.parse(body)
```

Add this schema definition near the top of the file, after the imports:

```typescript
const updateSchema = z.object({
  status: validators.feedbackStatus.optional(),
  adminNotes: validators.adminNotes,
})
```

Add the imports:

```typescript
import { z } from "zod"
import { validators } from "@/lib/validation"
```

- [ ] **Step 2: Wrap the handler body in the standard zod-error catch**

The handler already has a top-level `try { ... } catch (error) { console.error(...); return NextResponse.json({ error: "Internal server error" }, { status: 500 }) }`. Add a `ZodError` branch before the generic one — read the current catch block to get its exact shape (it was captured during planning as shown below, confirm it still matches before editing), then change:

```typescript
    } catch (error) {
      console.error("Error updating feedback:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
```

to:

```typescript
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      console.error("Error updating feedback:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
```

(This exact `{ error: "Validation error", details: error.issues }` shape matches what `app/api/admin/announcements/route.ts`'s POST handler already returns on a `ZodError` — kept consistent rather than inventing a new error shape.)

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/admin/feedback/\[feedbackId\]/route.ts
git commit -m "refactor(web): validate admin feedback PATCH body with shared zod schema"
```

---

## Task 3: Migrate `app/api/admin/feedback/route.ts` (GET query params)

**Files:**

- Modify: `apps/web/app/api/admin/feedback/route.ts`

- [ ] **Step 1: Replace the unchecked `as any` casts with validated query params**

Current (`apps/web/app/api/admin/feedback/route.ts`, inside the `GET` handler):

```typescript
      const searchParams = request.nextUrl.searchParams
      const status = searchParams.get("status")
      const category = searchParams.get("category")

      const feedback = await prisma.feedback.findMany({
        where: {
          ...(status && { status: status as any }),
          ...(category && { category: category as any }),
        },
```

Replace with:

```typescript
      const queryResult = querySchema.safeParse({
        status: request.nextUrl.searchParams.get("status") ?? undefined,
        category: request.nextUrl.searchParams.get("category") ?? undefined,
      })
      if (!queryResult.success) {
        return NextResponse.json(
          { error: "Invalid query parameters", details: queryResult.error.issues },
          { status: 400 }
        )
      }
      const { status, category } = queryResult.data

      const feedback = await prisma.feedback.findMany({
        where: {
          ...(status && { status }),
          ...(category && { category }),
        },
```

Add this schema after the imports:

```typescript
const querySchema = z.object({
  status: validators.feedbackStatus.optional(),
  category: validators.feedbackCategory.optional(),
})
```

Add the imports:

```typescript
import { z } from "zod"
import { validators } from "@/lib/validation"
```

`safeParse` is used here (not `.parse()`) because query-param validation failing is a routine, expected client-input case for a GET request — this mirrors the existing pattern in `app/api/plugin/shifts/route.ts`'s own query-param validation, which also uses `safeParse` for the same reason (GET query params, not a POST/PATCH body). The `.parse()` + catch pattern from Task 2 stays for body validation on mutating requests, matching `app/api/admin/announcements/route.ts`'s existing POST handler.

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/admin/feedback/route.ts
git commit -m "fix(web): validate admin feedback list query params instead of casting as any"
```

---

## Task 4: Migrate `app/api/admin/announcements/route.ts` onto the shared registry

**Files:**

- Modify: `apps/web/app/api/admin/announcements/route.ts`

This route already validates correctly (local `createSchema`, `.parse()` + `ZodError` catch) — the only change is pulling its `link` field from the shared registry instead of a local one-off, for consistency now that the registry has grown.

- [ ] **Step 1: Reuse `validators.url` for the `link` field**

Current (`apps/web/app/api/admin/announcements/route.ts:17-23`):

```typescript
const createSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  link: z.string().url().optional().nullable(),
  linkLabel: z.string().max(50).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
})
```

Replace with:

```typescript
const createSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  link: validators.url.nullable(),
  linkLabel: z.string().max(50).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
})
```

Add the import:

```typescript
import { validators } from "@/lib/validation"
```

(`title`/`message`/`linkLabel`/`expiresAt` stay as local `z.string(...)` calls — they're announcement-specific shapes with no other caller in the codebase, so promoting them to the shared registry would be speculative reuse with a single consumer. Only `link` matches an existing shared field (`validators.url`, already used by 2 other routes per the registry's current state) — reuse it, don't duplicate its definition.)

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/admin/announcements/route.ts
git commit -m "refactor(web): reuse shared url validator in admin announcements schema"
```

---

## Task 5: Full regression pass + manual verification + deploy

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification against a real (or local) admin session**

```bash
cd apps/web && pnpm dev
```

As an admin user:

- `GET /api/admin/feedback?status=NEW` → 200, filtered results.
- `GET /api/admin/feedback?status=NOT_A_REAL_STATUS` → 400 with a validation-error body (this is the fixed gap — previously this silently returned unfiltered results instead of erroring).
- `PATCH /api/admin/feedback/<id>` with `{ "status": "COMPLETED" }` → 200, status updates.
- `PATCH /api/admin/feedback/<id>` with `{ "status": "NOT_REAL" }` → 400.
- `PATCH /api/admin/feedback/<id>` with `{ "adminNotes": "<2001+ character string>" }` → 400 (previously accepted unbounded).
- Create an announcement via the admin UI with a valid link → still works as before (regression check on Task 4's reuse-only change).

- [ ] **Step 3: Push and deploy**

```bash
cd apps/web/../.. && git push origin main
~/bin/deploy-xiv-web.sh --green
```

- [ ] **Step 4: Post-deploy spot check**

Repeat the two "should now 400" checks from Step 2 against `https://xivvenuemanager.com` directly, confirm no new GlitchTip issues appear for the admin routes in the minutes after deploy.

---

## Remaining rollout

This increment covers 4 of the roadmap's 133 target routes. ~129 remain (37 already use ad-hoc zod without the shared registry; ~92 have no zod at all, after subtracting this plan's 4). Each future increment should:

- Get its own dated plan in `docs/superpowers/plans/`, scoped to a small, coherent batch (by feature area or route prefix, not all at once) — do not try to enumerate the remaining ~129 routes in a single document.
- Follow this plan's established pattern: `.parse()` + catch `z.ZodError` → `{ error: "Validation error", details: error.issues }` (400) for request bodies on mutating routes; `safeParse` for GET query params. Add genuinely-reusable fields to `lib/validation.ts`'s `validators`, keep single-consumer fields local to their route.
- Prioritize routes with a demonstrated real gap (unbounded strings, `as any` casts, manually-inlined enum arrays) over routes that already validate correctly by hand — matching what this increment did for `feedback`'s two real gaps vs. `announcements`' already-correct-but-registry-inconsistent one.
