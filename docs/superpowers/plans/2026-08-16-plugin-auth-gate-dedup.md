# Plugin Route Auth/Rate-Limit Gate Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the identical ~15-20 line auth/rate-limit preamble (IP rate-limit → API-key header check → `validateApiKey` → per-key rate-limit) currently hand-duplicated across 20 `/api/plugin/*` route files into one shared `pluginAuthGate()` helper — findings-report cluster #1, the single largest duplication cluster by file count, flagged HIGH value and security-relevant.

**Architecture:** Add `pluginAuthGate(request, kind)` to `lib/api/plugin-auth.ts` (the module that already owns `validateApiKey`/`generateApiKey`/`revokeApiKey` — the natural home, since this helper is "the" plugin-auth check). It returns a discriminated union: `{ ok: true, auth }` or `{ ok: false, response }`, so each route's own `try/catch`, Zod validation branch, and error-log message text — all of which genuinely differ per route and are NOT part of the duplicated cluster — stay completely untouched. Each route's preamble collapses from ~15-20 lines to 3:
```ts
const gate = await pluginAuthGate(request, "read")
if (!gate.ok) return gate.response
const { auth } = gate
```
This is a pure refactor of the preamble only — every route keeps its own outer `try`, its own `catch` block (with its own log message and any `ZodError` handling), and everything after the preamble (venue-scoping checks, business logic, response shape) untouched.

**Known, deliberate behavior change (confirm before executing):** 18 of the 20 files return a flat `{ error: "Unauthorized" }` for both "missing API key" and "invalid API key" cases. Exactly 2 files — `app/api/plugin/events/active/route.ts` and `app/api/plugin/venues/route.ts` — currently distinguish `"Unauthorized - missing API key"` vs. `"Unauthorized - invalid API key"`. The shared gate standardizes all 20 routes on the majority's plain `"Unauthorized"` (status code 401 unchanged in all cases — only these 2 files' JSON `error` string text changes). Grepped both files' only real consumer (the Dalamud plugin, not part of this repo) — plugin C# code was not available to check in this pass; this is a text-only change behind an unchanged 401 status code, low risk, but flagged explicitly rather than silently folded in.

**Tech Stack:** Next.js 16 App Router route handlers, TypeScript strict, Vitest.

---

## File Structure

- Modify: `apps/web/lib/api/plugin-auth.ts` — add `pluginAuthGate` + `PluginAuth` type.
- Create: `apps/web/lib/api/plugin-auth.test.ts` — unit tests for `pluginAuthGate` (no test file currently exists for this module).
- Modify (Task 2, 5 files): `app/api/plugin/venues/route.ts`, `app/api/plugin/events/active/route.ts`, `app/api/plugin/roles/route.ts`, `app/api/plugin/roles/[venueId]/route.ts`, `app/api/plugin/services/route.ts`.
- Modify (Task 3, 5 files): `app/api/plugin/rooms/route.ts`, `app/api/plugin/rooms/status/route.ts`, `app/api/plugin/inventory-settings/route.ts`, `app/api/plugin/inventory/link-item/route.ts`, `app/api/plugin/inventory/restock/route.ts`.
- Modify (Task 4, 5 files): `app/api/plugin/patrons/ban/route.ts`, `app/api/plugin/patrons/banned/route.ts`, `app/api/plugin/patrons/vip/route.ts`, `app/api/plugin/patron-visits/route.ts` (2 handlers, GET+POST), `app/api/plugin/characters/route.ts`.
- Modify (Task 5, 5 files): `app/api/plugin/shifts/route.ts`, `app/api/plugin/shifts/claim/route.ts`, `app/api/plugin/shifts/clock-in/route.ts`, `app/api/plugin/shifts/clock-out/route.ts`, `app/api/plugin/transactions/route.ts`.

---

### Task 1: Add `pluginAuthGate` to `lib/api/plugin-auth.ts`

**Files:**
- Modify: `apps/web/lib/api/plugin-auth.ts`
- Test: `apps/web/lib/api/plugin-auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/api/plugin-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
    membership: { findMany: vi.fn() },
  },
}))
vi.mock("@/lib/api/plugin-rate-limit", () => ({
  enforcePluginIpRateLimit: vi.fn().mockResolvedValue(null),
  enforcePluginRateLimit: vi.fn().mockResolvedValue(null),
}))

import { prisma } from "@/lib/prisma"
import { enforcePluginIpRateLimit, enforcePluginRateLimit } from "@/lib/api/plugin-rate-limit"
import { pluginAuthGate } from "./plugin-auth"

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/plugin/test", { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("pluginAuthGate", () => {
  it("returns 429 without checking the API key when IP-limited", async () => {
    vi.mocked(enforcePluginIpRateLimit).mockResolvedValueOnce(
      new Response(null, { status: 429 }) as any
    )
    const result = await pluginAuthGate(makeRequest({ "x-api-key": "vm_x" }), "read")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(429)
    expect(prisma.apiKey.findFirst).not.toHaveBeenCalled()
  })

  it("returns 401 Unauthorized when x-api-key header is missing", async () => {
    const result = await pluginAuthGate(makeRequest(), "read")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body).toEqual({ error: "Unauthorized" })
    }
  })

  it("returns 401 Unauthorized when the API key doesn't resolve to a user", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce(null)
    const result = await pluginAuthGate(makeRequest({ "x-api-key": "vm_bad" }), "read")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body).toEqual({ error: "Unauthorized" })
    }
  })

  it("returns the per-key rate-limit response when over budget", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce({
      id: "k1", userId: "u1", venueId: null, user: { id: "u1" },
    } as any)
    vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([{ venueId: "v1" }] as any)
    vi.mocked(enforcePluginRateLimit).mockResolvedValueOnce(
      new Response(null, { status: 429 }) as any
    )
    const result = await pluginAuthGate(makeRequest({ "x-api-key": "vm_ok" }), "write")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(429)
    expect(enforcePluginRateLimit).toHaveBeenCalledWith("vm_ok", "write")
  })

  it("returns ok:true with userId/venues when everything passes", async () => {
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValueOnce({
      id: "k1", userId: "u1", venueId: null, user: { id: "u1", name: "Test" },
    } as any)
    vi.mocked(prisma.membership.findMany).mockResolvedValueOnce([{ venueId: "v1" }, { venueId: "v2" }] as any)
    const result = await pluginAuthGate(makeRequest({ "x-api-key": "vm_ok" }), "read")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.auth.userId).toBe("u1")
      expect(result.auth.venues).toEqual(["v1", "v2"])
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run lib/api/plugin-auth.test.ts`
Expected: FAIL — `pluginAuthGate` is not exported yet.

- [ ] **Step 3: Implement**

In `apps/web/lib/api/plugin-auth.ts`, add the import at the top:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { enforcePluginIpRateLimit, enforcePluginRateLimit } from '@/lib/api/plugin-rate-limit'
```

Then add after `validateApiKey`'s closing brace (before `revokeApiKey`):

```ts
export type PluginAuth = { userId: string; venues: string[]; user: NonNullable<Awaited<ReturnType<typeof validateApiKey>>>['user'] }

export type PluginAuthGateResult =
  | { ok: true; auth: PluginAuth }
  | { ok: false; response: NextResponse }

/**
 * Shared preamble for every /api/plugin/* route: per-IP throttle, API-key
 * presence check, key validation, per-key throttle. Kept out of each
 * route's own try/catch on purpose - callers unwrap this before their own
 * business-logic try/catch begins, so their existing per-route error
 * messages and Zod-validation branches are untouched by this helper.
 */
export async function pluginAuthGate(
  request: NextRequest,
  kind: 'read' | 'write'
): Promise<PluginAuthGateResult> {
  const ipLimited = await enforcePluginIpRateLimit(request)
  if (ipLimited) return { ok: false, response: ipLimited }

  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const auth = await validateApiKey(apiKey)
  if (!auth || !auth.userId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const limited = await enforcePluginRateLimit(apiKey, kind)
  if (limited) return { ok: false, response: limited }

  return { ok: true, auth: { userId: auth.userId, venues: auth.venues, user: auth.user } }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run lib/api/plugin-auth.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run the full suite and type-check**

Run: `cd apps/web && pnpm vitest run && pnpm tsc --noEmit`
Expected: all test files pass (10 files including the new one); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api/plugin-auth.ts apps/web/lib/api/plugin-auth.test.ts
git commit -m "Add pluginAuthGate shared preamble to lib/api/plugin-auth.ts"
```

---

### Task 2: Migrate `venues`, `events/active`, `roles`, `roles/[venueId]`, `services`

**Files:**
- Modify: `apps/web/app/api/plugin/venues/route.ts`
- Modify: `apps/web/app/api/plugin/events/active/route.ts`
- Modify: `apps/web/app/api/plugin/roles/route.ts`
- Modify: `apps/web/app/api/plugin/roles/[venueId]/route.ts`
- Modify: `apps/web/app/api/plugin/services/route.ts`

- [ ] **Step 1: Worked example — migrate `venues/route.ts`**

Current `apps/web/app/api/plugin/venues/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, getUserVenues } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'

/**
 * GET /api/plugin/venues
 * 
 * Returns list of venues the authenticated user has access to.
 * Used by the Dalamud plugin to show available venues.
 */
export async function GET(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get('x-api-key')
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Unauthorized - missing API key' },
        { status: 401 }
      )
    }
    
    const auth = await validateApiKey(apiKey)
    
    if (!auth || !auth.userId) {
      return NextResponse.json(
        { error: 'Unauthorized - invalid API key' },
        { status: 401 }
      )
    }

    const limited = await enforcePluginRateLimit(apiKey, 'read')
    if (limited) return limited

    const venues = await getUserVenues(auth.userId)
    ...
```

Becomes:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserVenues, pluginAuthGate } from '@/lib/api/plugin-auth'

/**
 * GET /api/plugin/venues
 * 
 * Returns list of venues the authenticated user has access to.
 * Used by the Dalamud plugin to show available venues.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, 'read')
    if (!gate.ok) return gate.response
    const { auth } = gate

    const venues = await getUserVenues(auth.userId)
    ...
```

Rules applied, use identically for every file in this task and Tasks 3-5:
- The `validateApiKey` import is dropped from `@/lib/api/plugin-auth` (no longer called directly by the route); `pluginAuthGate` is added to that same import line, alongside whatever else the route already imports from that module (e.g. `getUserVenues` here).
- The whole `import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'` line is deleted — neither function is called directly by the route anymore.
- The preamble (everything from `const __ipLimited = ...` or equivalent, through the `enforcePluginRateLimit(apiKey, kind)` check, inclusive) collapses to the 3-line `gate`/`if (!gate.ok)`/`const { auth }` shown above.
- Every reference to `auth.userId` / `auth.venues` later in the route body is unchanged — `gate.ok === true`'s `auth` has the same shape (`{ userId, venues, user }`) as the old inline `auth` variable.
- The route's own `try`/`catch`, Zod validation branch (if any), and specific `catch` log message/text are **untouched** — do not modify anything below the preamble or the catch block.
- This route (and `events/active`) previously distinguished `"Unauthorized - missing API key"` vs `"Unauthorized - invalid API key"` — both collapse to the shared gate's flat `"Unauthorized"` message, same 401 status code. This is the plan's documented, deliberate scope (see plan header).

- [ ] **Step 2: Migrate `events/active/route.ts`**

Same pattern. Current preamble:

```ts
export async function GET(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized - missing API key' }, { status: 401 })
    }

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized - invalid API key' }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, 'read')
    if (limited) return limited

    const { searchParams } = new URL(request.url)
    ...
```

Becomes:

```ts
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, 'read')
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    ...
```

This file's only import from `@/lib/api/plugin-auth` is `validateApiKey` — replace with `pluginAuthGate`. Delete its `plugin-rate-limit` import line entirely (it imports nothing else from that module).

- [ ] **Step 3: Migrate `roles/route.ts`, `roles/[venueId]/route.ts`, `services/route.ts`**

Read each file first to confirm its exact current imports and preamble (`kind` will be `'read'` for all three, confirmed earlier via `grep -n "enforcePluginRateLimit(apiKey" `). Apply the identical transformation from Steps 1-2: swap the `plugin-auth` import to include `pluginAuthGate` (keeping any other named imports from that module the file already uses, e.g. this file might import other helpers — check before removing anything), delete the `plugin-rate-limit` import line, collapse the preamble to the 3-line gate pattern, leave everything else (including each file's own try/catch and 401 message text, which for these 3 files is already the plain `"Unauthorized"` shared by the majority) untouched.

- [ ] **Step 4: Type-check and verify no dangling imports**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: no errors.

Run: `grep -n "enforcePluginRateLimit\|enforcePluginIpRateLimit\|validateApiKey" apps/web/app/api/plugin/venues/route.ts apps/web/app/api/plugin/events/active/route.ts apps/web/app/api/plugin/roles/route.ts "apps/web/app/api/plugin/roles/[venueId]/route.ts" apps/web/app/api/plugin/services/route.ts`
Expected: no output — confirms none of these 5 files reference the old functions directly anymore (they only go through `pluginAuthGate` now).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/plugin/venues/route.ts apps/web/app/api/plugin/events/active/route.ts apps/web/app/api/plugin/roles/route.ts "apps/web/app/api/plugin/roles/[venueId]/route.ts" apps/web/app/api/plugin/services/route.ts
git commit -m "Migrate venues/events-active/roles/services plugin routes onto pluginAuthGate"
```

---

### Task 3: Migrate `rooms`, `rooms/status`, `inventory-settings`, `inventory/link-item`, `inventory/restock`

**Files:**
- Modify: `apps/web/app/api/plugin/rooms/route.ts`
- Modify: `apps/web/app/api/plugin/rooms/status/route.ts`
- Modify: `apps/web/app/api/plugin/inventory-settings/route.ts`
- Modify: `apps/web/app/api/plugin/inventory/link-item/route.ts`
- Modify: `apps/web/app/api/plugin/inventory/restock/route.ts`

- [ ] **Step 1: Read each file first**

All 5 use the plain `"Unauthorized"` message (confirmed via grep during planning) — no message-text special-casing needed for this task, unlike Task 2. `rooms`/`inventory-settings` are `'read'` kind; `rooms/status`/`inventory/link-item`/`inventory/restock` are `'write'` kind (confirmed via the same grep). Confirm each file's exact current content before editing — do not assume the grep from planning time still holds if anything looks different.

- [ ] **Step 2: Apply the identical transformation to all 5 files**

For each file: swap `validateApiKey` for `pluginAuthGate` in the `@/lib/api/plugin-auth` import (keep any other imports from that module unchanged), delete the `@/lib/api/plugin-rate-limit` import line, collapse the preamble to:

```ts
const gate = await pluginAuthGate(request, "read")  // or "write" per the file's existing kind
if (!gate.ok) return gate.response
const { auth } = gate
```

Leave everything else (try/catch, log messages, business logic, response shapes) untouched.

- [ ] **Step 3: Type-check and verify no dangling imports**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: no errors.

Run: `grep -n "enforcePluginRateLimit\|enforcePluginIpRateLimit\|validateApiKey" apps/web/app/api/plugin/rooms/route.ts apps/web/app/api/plugin/rooms/status/route.ts apps/web/app/api/plugin/inventory-settings/route.ts apps/web/app/api/plugin/inventory/link-item/route.ts apps/web/app/api/plugin/inventory/restock/route.ts`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/plugin/rooms/route.ts apps/web/app/api/plugin/rooms/status/route.ts apps/web/app/api/plugin/inventory-settings/route.ts apps/web/app/api/plugin/inventory/link-item/route.ts apps/web/app/api/plugin/inventory/restock/route.ts
git commit -m "Migrate rooms/inventory plugin routes onto pluginAuthGate"
```

---

### Task 4: Migrate `patrons/ban`, `patrons/banned`, `patrons/vip`, `patron-visits`, `characters`

**Files:**
- Modify: `apps/web/app/api/plugin/patrons/ban/route.ts`
- Modify: `apps/web/app/api/plugin/patrons/banned/route.ts`
- Modify: `apps/web/app/api/plugin/patrons/vip/route.ts`
- Modify: `apps/web/app/api/plugin/patron-visits/route.ts` — **has two exported handlers (GET and POST), each with its own separate preamble to migrate independently.**
- Modify: `apps/web/app/api/plugin/characters/route.ts`

- [ ] **Step 1: Read each file first, paying special attention to `patron-visits/route.ts`**

All use the plain `"Unauthorized"` message. `patrons/ban` is `'write'`, `patrons/banned` is `'read'`, `patrons/vip` is `'read'`, `characters` is `'write'`. `patron-visits/route.ts` has two separate preambles — its POST handler (around line 43 per planning-time grep) is `'write'` kind, its GET handler (around line 151) is `'read'` kind — confirm both against the actual current file content, and migrate each handler's preamble independently (same 3-line gate pattern in each, with that handler's own correct `kind`).

- [ ] **Step 2: Apply the identical transformation to all 5 files (6 preambles total, since `patron-visits` has 2)**

Same rule as Tasks 2-3: swap `validateApiKey` for `pluginAuthGate` in the shared import, delete the `plugin-rate-limit` import, collapse each preamble to the 3-line gate call with the correct `kind` for that specific handler, leave everything else untouched.

- [ ] **Step 3: Type-check and verify no dangling imports**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: no errors.

Run: `grep -n "enforcePluginRateLimit\|enforcePluginIpRateLimit\|validateApiKey" apps/web/app/api/plugin/patrons/ban/route.ts apps/web/app/api/plugin/patrons/banned/route.ts apps/web/app/api/plugin/patrons/vip/route.ts apps/web/app/api/plugin/patron-visits/route.ts apps/web/app/api/plugin/characters/route.ts`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/plugin/patrons/ban/route.ts apps/web/app/api/plugin/patrons/banned/route.ts apps/web/app/api/plugin/patrons/vip/route.ts apps/web/app/api/plugin/patron-visits/route.ts apps/web/app/api/plugin/characters/route.ts
git commit -m "Migrate patrons/patron-visits/characters plugin routes onto pluginAuthGate"
```

---

### Task 5: Migrate `shifts`, `shifts/claim`, `shifts/clock-in`, `shifts/clock-out`, `transactions`

**Files:**
- Modify: `apps/web/app/api/plugin/shifts/route.ts`
- Modify: `apps/web/app/api/plugin/shifts/claim/route.ts`
- Modify: `apps/web/app/api/plugin/shifts/clock-in/route.ts`
- Modify: `apps/web/app/api/plugin/shifts/clock-out/route.ts`
- Modify: `apps/web/app/api/plugin/transactions/route.ts`

- [ ] **Step 1: Read each file first**

All use the plain `"Unauthorized"` message. `shifts` is `'read'`; `shifts/claim`, `shifts/clock-in`, `shifts/clock-out`, `transactions` are all `'write'` (confirmed via planning-time grep). `shifts/clock-in/route.ts`'s preamble was observed further down the file (around line 65 at planning time, vs. most files' ~line 25-35) — this file likely has extra logic (e.g. request-body parsing) before its rate-limit call; read it carefully and only touch the actual preamble block (IP-limit → key check → validate → per-key-limit), not whatever comes before it if the ordering differs from the other files.

- [ ] **Step 2: Apply the identical transformation to all 5 files**

Same rule as Tasks 2-4: swap `validateApiKey` for `pluginAuthGate` in the shared import, delete the `plugin-rate-limit` import, collapse the preamble to the 3-line gate call with the correct `kind`, leave everything else untouched. If `shifts/clock-in/route.ts`'s preamble is genuinely interleaved with other logic (not a clean contiguous block like the other files), stop and report NEEDS_CONTEXT with what you found rather than guessing how to reorder it.

- [ ] **Step 3: Type-check and verify no dangling imports**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: no errors.

Run: `grep -n "enforcePluginRateLimit\|enforcePluginIpRateLimit\|validateApiKey" apps/web/app/api/plugin/shifts/route.ts apps/web/app/api/plugin/shifts/claim/route.ts apps/web/app/api/plugin/shifts/clock-in/route.ts apps/web/app/api/plugin/shifts/clock-out/route.ts apps/web/app/api/plugin/transactions/route.ts`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/plugin/shifts/route.ts apps/web/app/api/plugin/shifts/claim/route.ts apps/web/app/api/plugin/shifts/clock-in/route.ts apps/web/app/api/plugin/shifts/clock-out/route.ts apps/web/app/api/plugin/transactions/route.ts
git commit -m "Migrate shifts/transactions plugin routes onto pluginAuthGate"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check and test suite**

Run: `cd apps/web && pnpm tsc --noEmit && pnpm vitest run`
Expected: tsc clean (aside from the two pre-existing, unrelated `attendance-overview.tsx`/`event-attendance-chart.tsx` TS7031 errors already tracked as out-of-scope noise); all test files pass.

- [ ] **Step 2: Confirm no route file still references the old functions directly**

Run: `grep -rln "enforcePluginRateLimit\|enforcePluginIpRateLimit" apps/web/app/api/plugin --include="*.ts"`
Expected: no output — every one of the 20 route files (21 preambles counting `patron-visits`'s 2 handlers) now goes through `pluginAuthGate` exclusively. (`lib/api/plugin-rate-limit.ts` and `lib/api/plugin-auth.ts` themselves still reference these functions internally — that's expected and correct, only route files should show zero matches.)

- [ ] **Step 3: Live verification against the local dev stack**

Using a real plugin API key generated via the dashboard's `/dashboard/<slug>/settings/api-keys` page (same approach as the prior rate-limit-dedup increment's verification):
- **Happy path:** `curl -s -H "x-api-key: <key>" http://localhost:3000/api/plugin/venues` → 200 with the expected venue list shape.
- **Missing key:** `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/plugin/venues` (no header) → 401, body `{"error":"Unauthorized"}`.
- **Invalid key:** `curl -s -o /dev/null -w "%{http_code}\n" -H "x-api-key: vm_not_a_real_key" http://localhost:3000/api/plugin/venues` → 401, body `{"error":"Unauthorized"}`.
- **One write-kind route smoke check:** pick one `'write'`-kind route from Tasks 3-5 (e.g. `patrons/vip` or `shifts/claim`) and confirm it still 200s (or the expected non-500 status for a deliberately-invalid-but-well-formed body) with a valid key — confirming the `kind: "write"` budget is actually being applied, not silently defaulted to `"read"` by a copy-paste mistake somewhere across 21 preambles.
- **The two message-text-change files:** re-confirm `events/active` and `venues` now both return the flat `{"error":"Unauthorized"}` (not the old split "missing"/"invalid" text) for a missing-key request each — this is the plan's one deliberate, documented behavior change, worth a direct check rather than assuming Task 2's diff did it correctly.
- Confirm no server-side error/exception appears in the dev server's terminal output during any of the above.
- Delete the test API key after (via the dashboard UI's Revoke button, or directly via `DELETE FROM api_keys WHERE name = '<test-key-name>'` against the local Postgres container if the Revoke button's confirm() dialog causes browser-automation issues, as it did in a prior session).

- [ ] **Step 4: Update the roadmap doc**

Add a summary entry to `docs/superpowers/plans/2026-08-11-codebase-cleanup-roadmap.md`'s running log (matching the style of the existing rate-limit-dedup entry added for the prior increment) noting cluster #1 is done — the largest cluster in the Stage 1 findings report — and what (if anything) remains open in the codebase-sweep findings report after this increment.
