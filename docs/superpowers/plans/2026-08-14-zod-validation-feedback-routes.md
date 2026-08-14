# Zod Validation Registry — Feedback Submission Routes (Increment 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the 2 feedback-submission route handlers (`app/api/feedback/route.ts` — web, session-authenticated; `app/api/mobile/feedback/route.ts` — mobile, token-authenticated) onto `lib/validation.ts`'s shared `validators` registry, closing two real gaps: unbounded `subject`/`description` strings, and a manually-inlined category enum array duplicating a registry field that already exists.

**Architecture:** Same pattern as Increments 1-3: each route builds a local `z.object({...})` from `validators` pieces, validates with `schema.parse(body)` inside the route's existing try/catch, and adds a `z.ZodError` branch ahead of the existing generic-500 fallback. Reference for the exact shape: `app/api/admin/feedback/[feedbackId]/route.ts` (already migrated in Increment 1) — imports `z` from `'zod'` and `validators` from `@/lib/validation`, catches `error instanceof z.ZodError`, returns `{ error: 'Validation error', details: error.issues }` at 400.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod, Vitest.

**Scope note:** `validators.feedbackCategory`, `validators.feedbackSubject`, and `validators.feedbackDescription` were all added to the registry in Increment 1 (`docs/superpowers/plans/2026-08-12-zod-validation-admin-routes.md`) but have only ever been consumed by the admin-facing GET (query-param filter) and PATCH (status/notes update) routes for feedback — never by either of the two routes that actually create a `Feedback` row from raw user input. This increment closes that gap. **No new registry fields are needed** — this is a pure reuse increment, the tightest-scoped one so far.

---

## Task 0: Confirm scope and gaps (no code — read before starting)

**Real gaps confirmed by reading the 2 target routes during planning (2026-08-14):**

1. `apps/web/app/api/feedback/route.ts:33-48` — `category`/`subject`/`description` are destructured from the raw body with only a truthy check (`if (!category || !subject || !description)`), then `category` is checked against a **manually re-declared** local array (`const validCategories = ["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"]`) that duplicates `validators.feedbackCategory` (`z.enum(["NEW", ...])`... actually `z.enum(["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"])`, `apps/web/lib/validation.ts:44`) exactly, field-for-field, with no shared source of truth — if the valid category set ever changes, this route and the registry can silently drift apart. `subject` and `description` have **no length cap at all** — written straight into `Feedback.subject`/`Feedback.description` with no bound, unlike `validators.feedbackSubject` (max 200) and `validators.feedbackDescription` (min 10, max 5000) which already exist and are designed for exactly this data. `url` (from `request.body.url`, sent by the client as `window.location.href` — confirmed by reading `components/feedback-dialog.tsx:59`) is passed through with **no validation at all**, not even a truthy check — `validators.url` already exists (`.url().max(500)`) and is unused here.
2. `apps/web/app/api/mobile/feedback/route.ts:6,15-21` — identical shape to #1: a separately-maintained `const VALID_CATEGORIES = [...] as const` module-level array (same 4 values, same drift risk), unbounded `subject`/`description` via `String(subject).trim()`/`String(description).trim()` with no length check, and no `url` field at all (mobile route hardcodes `url: "mobile-app"` server-side, so nothing to validate there).

**Downstream consumers confirmed by reading during planning:** Both routes' `subject`/`description` feed a Discord webhook embed via `formatFeedbackSubmittedEmbed` (`apps/web/lib/discord-webhook.ts:591-599`) — that function already truncates via its own internal `sanitizeForDiscord(..., 256)`/`sanitizeForDiscord(..., 1024)` calls before building the embed, so **oversized input does not currently break the Discord notification** (that specific downstream risk is already mitigated, don't cite it as a reason for this change). The real reasons for this increment are: (a) unbounded values land in the `Feedback` table and the admin feedback-triage UI (`app/admin/feedback/page.tsx` and its list view) with no cap, and (b) the duplicated category array is a maintenance/drift hazard the registry pattern exists specifically to prevent.

**No route-handler-level test precedent exists in this codebase** (same finding as every prior increment — `app/api/**/*.test.ts` is empty). This plan's tests (Task 1, if any were needed) are unnecessary here since `feedbackCategory`/`feedbackSubject`/`feedbackDescription`/`url` all already have behavior implicitly covered by their existing definitions — no new registry entries means no new schema tests to write. Task 3 covers manual verification: `app/api/feedback` is session-authenticated (browser tab, via the existing `feedback-dialog.tsx` UI — no curl-with-API-key workaround needed, unlike the plugin routes in Increments 2-3), `app/api/mobile/feedback` is mobile-token-authenticated (`requireMobileAuth` — check `lib/mobile-auth-guard.ts` for what that expects; likely needs a curl-with-a-real-mobile-session-token approach, documented in Task 3).

- [ ] **Step 1: No action needed** — confirmed above.

---

## Task 1: Migrate `app/api/feedback/route.ts`

**Files:**
- Modify: `apps/web/app/api/feedback/route.ts`

- [ ] **Step 1: Replace the manual truthy/enum checks with a zod schema**

Current (`apps/web/app/api/feedback/route.ts:1-6, 30-49`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { sendDiscordWebhook, formatFeedbackSubmittedEmbed } from "@/lib/discord-webhook"
```

```typescript
      const body = await request.json()
      const { category, subject, description, url } = body

      // Validate required fields
      if (!category || !subject || !description) {
        return NextResponse.json(
          { error: "Missing required fields: category, subject, description" },
          { status: 400 }
        )
      }

      // Validate category
      const validCategories = ["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"]
      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { error: "Invalid category. Must be one of: BUG_REPORT, FEATURE_REQUEST, IMPROVEMENT, GENERAL" },
          { status: 400 }
        )
      }
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { sendDiscordWebhook, formatFeedbackSubmittedEmbed } from "@/lib/discord-webhook"
import { validators } from "@/lib/validation"

const feedbackSchema = z.object({
  category: validators.feedbackCategory,
  subject: validators.feedbackSubject,
  description: validators.feedbackDescription,
  url: validators.url,
})
```

```typescript
      const body = await request.json()
      let category: (typeof feedbackSchema)["_output"]["category"], subject: string, description: string, url: string | undefined
      try {
        const parsed = feedbackSchema.parse(body)
        category = parsed.category
        subject = parsed.subject
        description = parsed.description
        url = parsed.url
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
        }
        throw error
      }
```

The type annotation for `category` above (`(typeof feedbackSchema)["_output"]["category"]`) is deliberately verbose to avoid hand-writing the enum union — if this feels awkward when actually implementing, an equally correct and more readable alternative is to just destructure directly from `parsed` without pre-declaring `let` types:

```typescript
      const body = await request.json()
      let parsed: z.infer<typeof feedbackSchema>
      try {
        parsed = feedbackSchema.parse(body)
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
        }
        throw error
      }
      const { category, subject, description, url } = parsed
```

Use this second form — it's cleaner and matches how `z.infer` is idiomatically used elsewhere if you check other schemas in this codebase. Either is spec-compliant; prefer the `z.infer` version.

The existing outer `try { ... } catch (error) { console.error(...); return addCors(...500...) }` around the whole handler body (further down in the file, wrapping the `prisma.feedback.create` call and the Discord webhook fire-and-forget) is unchanged — the new inner try/catch for the zod parse sits inside it, same nesting pattern as Increment 3's routes.

**Note on `url`:** it's already effectively optional in the old code (no truthy check on it), and `validators.url` is itself `.optional()` in the registry (`apps/web/lib/validation.ts:31`) — so this is a straight tightening (format + length now enforced when present) with no behavior change for the common case (the client always sends `window.location.href`, a valid URL, per `components/feedback-dialog.tsx:59`).

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/feedback/route.ts
git commit -m "feat(web): validate feedback POST body with shared feedback validators"
```

---

## Task 2: Migrate `app/api/mobile/feedback/route.ts`

**Files:**
- Modify: `apps/web/app/api/mobile/feedback/route.ts`

- [ ] **Step 1: Replace the manual truthy/enum checks with a zod schema**

Current (`apps/web/app/api/mobile/feedback/route.ts:1-6, 13-21`):

```typescript
import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"
import { sendDiscordWebhook, formatFeedbackSubmittedEmbed } from "@/lib/discord-webhook"

const VALID_CATEGORIES = ["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"] as const
```

```typescript
  const body = await req.json().catch(() => ({}))
  const { category, subject, description } = body

  if (!category || !subject || !description) {
    return NextResponse.json({ error: "Missing required fields: category, subject, description" }, { status: 400 })
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 })
  }
```

New:

```typescript
import { NextResponse } from "next/server"
import { z } from "zod"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"
import { sendDiscordWebhook, formatFeedbackSubmittedEmbed } from "@/lib/discord-webhook"
import { validators } from "@/lib/validation"

const feedbackSchema = z.object({
  category: validators.feedbackCategory,
  subject: validators.feedbackSubject,
  description: validators.feedbackDescription,
})
```

```typescript
  const body = await req.json().catch(() => ({}))
  let parsed: z.infer<typeof feedbackSchema>
  try {
    parsed = feedbackSchema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    throw error
  }
  const { category, subject, description } = parsed
```

**Note:** the old code did `subject: String(subject).trim()` / `description: String(description).trim()` when building the `prisma.feedback.create` call further down. `validators.feedbackSubject`/`feedbackDescription` (`apps/web/lib/validation.ts:28-29`) do **not** `.trim()` internally (unlike `characterName`/`world` from Increment 3) — so **keep the existing `.trim()` calls** on the now-validated `subject`/`description` at the `prisma.feedback.create` call site (i.e. write `subject: subject.trim()`, `description: description.trim()` there, same as the pre-existing code, just now operating on the zod-validated values instead of the raw destructured ones — don't drop the trim, and don't add `.trim()` to the schema itself, since that would silently change what counts as "under the minimum length" for whitespace-padded input in a way this task doesn't need to touch). This route has no outer try/catch at all in the original code (unlike the web route) — let the `z.ZodError` check happen inline as shown; a non-Zod error thrown from `.parse()` (not expected given the schema shape, but included for consistency with every other migrated route in this rollout) would propagate as an unhandled rejection, same as any other unexpected error already would in this route today — no regression, matches the existing risk profile.

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/mobile/feedback/route.ts
git commit -m "feat(web): validate mobile feedback POST body with shared feedback validators"
```

---

## Task 3: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification — `app/api/feedback` (session-authenticated, browser)**

Sign in to `https://xivvenuemanager.com` in a browser tab, open the feedback dialog (the UI component that calls this route — `components/feedback-dialog.tsx`, likely reachable from a help/feedback button in the dashboard nav), and:
1. Submit a normal category + subject + description → should still succeed exactly as before (regression check) — the client-side UI already caps description at 2000 chars (below the 5000 registry max) so this won't naturally exercise the new server-side cap, that's expected.
2. If feasible, use the browser devtools network tab to replay the POST with a `subject` over 200 characters or an empty `description` → should now get a 400 with a clear "too long"/"too short" validation message instead of silently succeeding.

- [ ] **Step 3: Manual verification — `app/api/mobile/feedback` (mobile-token-authenticated, curl)**

This route is authenticated differently from every prior increment: `requireMobileAuth` (`apps/web/lib/mobile-auth-guard.ts`) expects an `Authorization: Bearer <jwt>` header, verified against `MOBILE_JWT_SECRET` via `verifyMobileJwt` (`apps/web/lib/auth/mobile-auth.ts:28-31`, HS256, `jose` library). The JWT payload shape is `{ sub: string, email: string | null, name: string | null, image: string | null }` (`sub` is the userId) and tokens expire in 15 minutes (`apps/web/lib/auth/mobile-auth.ts:23`).

To mint a real, valid test token: run a short script inside the live `venue-manager-next` (or `venue-manager`) container, which already has `MOBILE_JWT_SECRET` in its environment and `jose` as an installed dependency — e.g. `docker exec venue-manager-next node -e "..."` using `jose`'s `SignJWT` with the exact same header/claims/expiry/secret shape as `signMobileJwt` above, signing a payload with `sub` set to a disposable test venue owner's userId (Increments 2-3 used `TestingOut`/slug `t`, owner userId `cmq8ugi4d000101rurduj6yw1` — reuse if it still exists). This mirrors how Increments 2-3 generated disposable plugin API keys directly rather than going through a full OAuth/login flow.

Once a valid token is minted, verify:
1. A `subject` over 200 characters → 400.
2. A `description` under 10 characters (or empty) → 400.
3. An invalid `category` (e.g. `"NOT_A_CATEGORY"`) → 400.
4. Normal values → 201 (regression check) — this will create a real `Feedback` row; either use throwaway values that are obviously test data (e.g. subject `"[zod-inc4-test] verification"`) and delete the row afterward via `psql`, or check whether a disposable test account/venue from prior increments' verification already has a usable mobile session to reuse.

- [ ] **Step 4: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms — deploy is a separate explicit step, not bundled into this task. Manual verification (Step 2/3 above) requires the code to actually be deployed first, same lesson learned in Increment 3 — don't attempt Step 2/3 against production before Step 4's push *and* an actual deploy have happened; reorder in practice to: push → (ask user to confirm deploy) → deploy → then run Steps 2/3 against the now-live code → update the roadmap doc.
