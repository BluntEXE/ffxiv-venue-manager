# Zod Validation Registry — Account Self-Service Routes (Increment 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring 3 session-authenticated "manage my own account" route handlers onto zod validation: `app/api/user/profile/route.ts` (PATCH, unbounded `displayName`), `app/api/plugin/keys/route.ts` (POST, unbounded API key `name`), `app/api/notifications/route.ts` (PATCH, untyped `ids` field that can cause a raw Prisma 500 instead of a clean 400).

**Architecture:** Same pattern as Increments 1-4: each route builds a local `z.object({...})` (or, for `notifications`, uses `.safeParse` since it's a low-stakes optional field with no auth-adjacent risk), validates the body, and returns `{ error: 'Validation error', details: ... }` at 400 on failure. Reference for the `.parse()`+try/catch shape: `apps/web/app/api/admin/feedback/[feedbackId]/route.ts`.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod, Vitest.

**Scope note — new registry fields:** `displayName` and the plugin-key `name` field are each used as *writable input* by exactly one route (confirmed by grepping `app/api` for `displayName`/`name` — other hits are read-only `select`/output fields, not accepted from a request body). Per Increments 1-2's "don't promote single-consumer fields" rule, both stay local to their route rather than being added to `apps/web/lib/validation.ts`'s shared `validators` registry. `notifications`' `ids` field is also single-consumer and stays local. **No new registry fields in this increment.**

**Out of scope:** `apps/web/app/api/user/account/route.ts` (DELETE) — checked during planning, no request body at all, nothing to validate. `apps/web/app/api/plugin/keys/[keyId]/route.ts` (DELETE) — checked, takes the key ID from the URL path param only, no body. `apps/web/app/api/venues/[venueId]/gallery/route.ts` (POST/DELETE) — checked, already has a *stronger*-than-generic check (a bucket-URL-prefix allowlist tied to `MINIO_PUBLIC_URL`/`MINIO_BUCKET` env vars) that a generic `.url()` zod check would weaken, not strengthen — not a real gap, skipped per the established "prioritize real gaps over registry-consistency-only changes" rule.

---

## Task 0: Confirm scope and gaps (no code — read before starting)

**Real gaps confirmed by reading the 3 target routes during planning (2026-08-14):**

1. `apps/web/app/api/user/profile/route.ts:10-13` — `displayName` is destructured from the raw body and checked only for truthiness/type/non-empty-after-trim (`if (!displayName || typeof displayName !== "string" || displayName.trim().length < 1)`). **No upper bound at all** — a user could set an arbitrarily long `displayName`, which is then written to `User.displayName` and rendered throughout the app (staff lists, patron-log attribution, feedback admin view, Discord embeds via `formatFeedbackSubmittedEmbed`'s `safeUserName` truncation — that one's already capped at the Discord-embed layer, but the raw DB value and every *other* render site, e.g. the staff table, is not).
2. `apps/web/app/api/plugin/keys/route.ts:53-55` — `name` (the human-readable label for a generated API key, e.g. "My Dalamud Plugin") gets the same truthy-only check (`if (!name || !name.trim())`), no upper bound, written straight to `ApiKey.name` and rendered in the dashboard's API-keys listing table.
3. `apps/web/app/api/notifications/route.ts:26-32` — `const ids: string[] | undefined = body.ids` is a **bare type assertion with zero runtime check**. If a caller sends `ids: 123` or `ids: "not-an-array"` or `ids: [1, 2, 3]` (numbers, not strings), the value flows straight into `prisma.notification.updateMany({ where: { ..., id: { in: ids } } } })` — Prisma will throw a runtime validation error for the malformed `in` clause, which this route's total lack of a try/catch means becomes an unhandled promise rejection → Next.js's generic framework-level 500, not a clean 400 with a useful message. Lower severity than #1/#2 (this route is scoped to the caller's own notifications either way, `userId: session.user.id` is always in the `where`, so it's a robustness/error-quality gap, not a data-integrity or cross-user-access gap) but still a real, demonstrated gap matching this rollout's stated priority ("routes with a demonstrated real gap... over routes that already validate correctly by hand").

**No route-handler-level test precedent exists in this codebase** (same finding as every prior increment). This plan adds no new registry fields, so there's nothing new to unit-test in `lib/validation.test.ts` — Task 4 covers manual verification of all 3 routes directly (all 3 are session-authenticated, browser-only, same limitation noted in Increments 3-4 for session routes: verification here means confirming behavior via an authenticated session, which may need to happen via curl replay of a real browser session's cookies rather than a fully scripted approach — see Task 4 for specifics).

- [ ] **Step 1: No action needed** — confirmed above.

---

## Task 1: Migrate `app/api/user/profile/route.ts`

**Files:**
- Modify: `apps/web/app/api/user/profile/route.ts`

- [ ] **Step 1: Replace the manual check with a zod schema**

Current (full file, `apps/web/app/api/user/profile/route.ts`):

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { displayName } = await req.json()
  if (!displayName || typeof displayName !== "string" || displayName.trim().length < 1) {
    return NextResponse.json({ error: "Display name is required" }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { displayName: displayName.trim() },
    select: { id: true, displayName: true },
  })

  return NextResponse.json(user)
}
```

New (full file):

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(50, "Display name too long (max 50 characters)"),
})

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  let displayName: string
  try {
    displayName = profileSchema.parse(body).displayName
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    throw error
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { displayName },
    select: { id: true, displayName: true },
  })

  return NextResponse.json(user)
}
```

Note the schema uses `.trim()` directly (unlike the shared `feedbackSubject`/`feedbackDescription` validators from Increment 4, which deliberately don't trim) — this is a new, route-local schema with no existing call-site convention to preserve, so trimming inside the schema (Increment 3's eventual pattern for `characterName`/`world`, after that increment's own fix) is the cleaner choice here: it means `displayName` downstream is already the final, trimmed value with no separate `.trim()` call needed at the `prisma.user.update` call site, unlike Increment 4's routes which had to preserve a pre-existing separate trim.

The 50-character cap matches this codebase's existing convention for short display-name-shaped fields (see `apps/web/lib/validation.ts:22`, `roleName: z.string().min(1, ...).max(50, ...)`) — not a new precedent, just consistent sizing for a similar kind of field.

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/user/profile/route.ts
git commit -m "feat(web): validate user profile PATCH body, cap displayName length"
```

---

## Task 2: Migrate `app/api/plugin/keys/route.ts`

**Files:**
- Modify: `apps/web/app/api/plugin/keys/route.ts`

- [ ] **Step 1: Replace the manual check with a zod schema**

Current (`apps/web/app/api/plugin/keys/route.ts:1-6, 47-55`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { nanoid } from "nanoid"
import { hashApiKey } from "@/lib/api/plugin-auth"
```

```typescript
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { venueId, name } = await request.json()

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { nanoid } from "nanoid"
import { hashApiKey } from "@/lib/api/plugin-auth"

const createKeySchema = z.object({
  venueId: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Name is required").max(50, "Name too long (max 50 characters)"),
})
```

```typescript
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  let venueId: string | undefined
  let name: string
  try {
    const parsed = createKeySchema.parse(body)
    venueId = parsed.venueId
    name = parsed.name
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    throw error
  }
```

Everything below this point (the `venueId ? ... : ...` branching for venue-scoped vs. account-wide key creation, the `prisma.apiKey.create` call) is unchanged — it already correctly handles `venueId` as optional/possibly-undefined (the original code's `if (venueId) { ... } else { ... }` branch), and `name` is already `.trim()`-ed by the schema so the existing `name: name.trim()` call at the `prisma.apiKey.create` site should be simplified to `name,` (the value is already trimmed — don't double-trim, just don't call `.trim()` again since it's redundant, not harmful, but the plan's convention elsewhere in this rollout is to not leave redundant calls in migrated code).

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/plugin/keys/route.ts
git commit -m "feat(web): validate plugin key creation body, cap name length"
```

---

## Task 3: Migrate `app/api/notifications/route.ts`

**Files:**
- Modify: `apps/web/app/api/notifications/route.ts`

- [ ] **Step 1: Replace the bare type assertion with a zod schema**

Current (`apps/web/app/api/notifications/route.ts:1-4, 26-40`):

```typescript
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
```

```typescript
/** PATCH — mark all (or specific IDs) as read */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] | undefined = body.ids

  await prisma.notification.updateMany({
    where: {
      userId: session.user.id,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { read: true },
  })

  return NextResponse.json({ ok: true })
}
```

New:

```typescript
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const markReadSchema = z.object({
  ids: z.array(z.string()).optional(),
})
```

```typescript
/** PATCH — mark all (or specific IDs) as read */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = markReadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
  }
  const { ids } = parsed.data

  await prisma.notification.updateMany({
    where: {
      userId: session.user.id,
      ...(ids ? { id: { in: ids } } : {}),
    },
    data: { read: true },
  })

  return NextResponse.json({ ok: true })
}
```

This route uses `.safeParse()` instead of `.parse()`+try/catch (the pattern every other route in this rollout has used) — deliberately, because this is the first route in the whole zod-validation rollout where the field being validated is **fully optional with a meaningful "absent" behavior** (no `ids` = mark *all* notifications read, not an error case) and the route already had a `.catch(() => ({}))` on the `req.json()` call, indicating its existing style already favors graceful fallback over throwing. `.safeParse()` avoids a try/catch block entirely for a single simple check, matching the codebase's own precedent for GET query-param validation in Increment 1 (`app/api/admin/feedback/route.ts`'s `querySchema.safeParse`). If this feels inconsistent when actually implementing, `.parse()`+try/catch (matching Tasks 1-2 in this same plan) is equally acceptable — this is a style choice, not a correctness requirement, and either form is spec-compliant.

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/notifications/route.ts
git commit -m "fix(web): validate notifications PATCH ids, replace unchecked type assertion"
```

---

## Task 4: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification**

All 3 routes are session-authenticated (NextAuth JWT-strategy session, browser cookie — not a bearer token like Increment 4's mobile route, and not hand-signable the same simple way since NextAuth's session cookie is JWE-encrypted by default, not a plain HS256 JWS). Two options, in preference order:

**Option A — real browser session (preferred):** if a session exists in a browser tab this session can drive (check via `mcp__playwright-brave__browser_navigate` to `https://xivvenuemanager.com/dashboard` — if it doesn't redirect to the homepage/signin, a session is active), use it directly:
1. `user/profile`: use the account settings UI to change display name to a normal value (regression check), then use devtools/network-tab replay to submit a 51+ character name → expect 400.
2. `plugin/keys`: use the dashboard's API Keys page to create a key with a normal name (regression check), then replay with a 51+ character name → expect 400.
3. `notifications`: mark notifications read via whatever UI surfaces this (a notification bell/dropdown) — regression check only, the `ids`-type-confusion case isn't reachable through normal UI interaction, so this specific fix is validated by code review + the fact that Prisma's `in` clause behavior with malformed input is well-understood, not by a live repro.

**Option B — no active browser session:** these 3 routes can't be verified the way Increment 4's mobile route was (no simple hand-signable token) without either (a) actually completing a Discord OAuth login in a real browser, which needs interactive user involvement, or (b) extracting a real session cookie value from an already-authenticated browser session via devtools and replaying it with curl. If neither is available, note in the roadmap doc (same as Increment 4's web route) that these 3 routes rely on unit-equivalent confidence — identical schema shape to already-reviewed patterns, passed 2-stage code review, typecheck/build/test all green — rather than a live end-to-end request, and ask the user whether to pursue Option A before considering the increment fully verified.

- [ ] **Step 3: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms. Reorder in practice as established in Increment 3/4: push → confirm deploy → deploy → THEN attempt Step 2's manual verification against the now-live code → update the roadmap doc.
