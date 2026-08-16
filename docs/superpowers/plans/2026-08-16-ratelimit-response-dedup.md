# Rate-Limit 429-Response Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate 3 hand-maintained copies of the 429 rate-limit response shape (headers + `Retry-After` math) and 2 copies of IP extraction, per findings #2/#3 in `docs/superpowers/plans/2026-08-15-codebase-sweep-findings-report.md` — flagged HIGH value and security-relevant, since a future change to the rate-limit response contract (e.g. adding a header) currently risks silently missing one of the three copies.

**Architecture:** `lib/rate-limit.ts` already owns `checkLimit`/`RateLimitResult`/`budgets` — the canonical rate-limiting module. Add two new exports there: `getIp(req)` (client-IP extraction, currently duplicated verbatim in `lib/api/plugin-rate-limit.ts` and `app/api/auth/[...nextauth]/route.ts`) and `buildRateLimitResponse(rl, message)` (the 429 JSON body + `X-RateLimit-*`/`Retry-After` headers, currently duplicated 3 times: twice inside `plugin-rate-limit.ts` itself, once in the nextauth route). Both call sites are refactored to use the shared versions — pure extraction, no behavior change. This is a pure refactor of already-tested-in-production logic; the plan adds direct unit tests for the two new shared functions since none currently exist for this file.

**Tech Stack:** Next.js 16 App Router route handlers, `NextRequest`/`NextResponse` (confirmed constructible directly in a plain Node/Vitest environment — no edge-runtime mocking needed), Vitest.

---

## File Structure

- Modify: `apps/web/lib/rate-limit.ts` — add `getIp` and `buildRateLimitResponse` exports.
- Create: `apps/web/lib/rate-limit.test.ts` — unit tests for the two new exports (no test file currently exists for this module).
- Modify: `apps/web/lib/api/plugin-rate-limit.ts` — replace both hand-rolled 429 blocks and the local `getIp` with the shared versions.
- Modify: `apps/web/app/api/auth/[...nextauth]/route.ts` — replace the hand-rolled 429 block and local `getIp` with the shared versions.

---

### Task 1: Add `getIp` and `buildRateLimitResponse` to `lib/rate-limit.ts`

**Files:**
- Modify: `apps/web/lib/rate-limit.ts`
- Test: `apps/web/lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/rate-limit.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"
import { getIp, buildRateLimitResponse, type RateLimitResult } from "./rate-limit"

describe("getIp", () => {
  it("prefers the first entry of x-forwarded-for when present", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    })
    expect(getIp(req)).toBe("1.2.3.4")
  })

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { "x-real-ip": "9.9.9.9" },
    })
    expect(getIp(req)).toBe("9.9.9.9")
  })

  it("falls back to cf-connecting-ip when neither of the above is present", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { "cf-connecting-ip": "8.8.8.8" },
    })
    expect(getIp(req)).toBe("8.8.8.8")
  })

  it("falls back to 'anonymous' when no IP header is present", () => {
    const req = new NextRequest("http://localhost/api/test")
    expect(getIp(req)).toBe("anonymous")
  })
})

describe("buildRateLimitResponse", () => {
  it("returns a 429 with the rate-limit headers and given message", async () => {
    const rl: RateLimitResult = { success: false, limit: 60, remaining: 0, reset: Date.now() + 5000 }
    const res = buildRateLimitResponse(rl, "Rate limit 60/60s exceeded")
    expect(res.status).toBe(429)
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60")
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0")
    expect(res.headers.get("X-RateLimit-Reset")).toBe(String(rl.reset))
    const body = await res.json()
    expect(body).toEqual({ error: "Too many requests", message: "Rate limit 60/60s exceeded" })
  })

  it("computes Retry-After as the ceiling of seconds until reset", async () => {
    const reset = Date.now() + 4500
    const rl: RateLimitResult = { success: false, limit: 10, remaining: 0, reset }
    const res = buildRateLimitResponse(rl, "x")
    expect(res.headers.get("Retry-After")).toBe("5")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run lib/rate-limit.test.ts`
Expected: FAIL — `getIp` and `buildRateLimitResponse` are not exported yet.

- [ ] **Step 3: Implement**

In `apps/web/lib/rate-limit.ts`, add the import at the top (currently the file has no `next/server` import at all):

```ts
import { NextRequest, NextResponse } from "next/server"
import { redis, ready } from "@/lib/redis"
```

Then add both functions after the `checkLimit` function (after its closing brace, before the `budgets` export):

```ts
export function getIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "anonymous"
}

export function buildRateLimitResponse(rl: RateLimitResult, message: string): NextResponse {
  return NextResponse.json(
    { error: "Too many requests", message },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.reset),
        "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
      },
    }
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run lib/rate-limit.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `cd apps/web && pnpm vitest run`
Expected: all test files pass (this adds one new file to the existing 8).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/rate-limit.ts apps/web/lib/rate-limit.test.ts
git commit -m "Add getIp/buildRateLimitResponse shared helpers to lib/rate-limit.ts"
```

---

### Task 2: Migrate `lib/api/plugin-rate-limit.ts` onto the shared helpers

**Files:**
- Modify: `apps/web/lib/api/plugin-rate-limit.ts` (full rewrite, 79 lines)

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `apps/web/lib/api/plugin-rate-limit.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { checkLimit, budgets, getIp, buildRateLimitResponse } from "@/lib/rate-limit"

/**
 * Per-IP pre-filter for plugin routes. Runs BEFORE validateApiKey so that
 * missing/bad/revoked keys still get throttled - otherwise an attacker
 * can brute-force the keyspace at full speed since 401 short-circuits
 * before any per-key counter exists.
 *
 * Budget chosen to allow a handful of FFXIV characters on shared NAT
 * polling normally (~2 req/min/char), while capping a key-stuffing
 * attacker to ~1 attempt/sec from any one IP.
 */
const ipBudget = { limit: 60, windowSec: 60 }

export async function enforcePluginIpRateLimit(
  request: NextRequest
): Promise<NextResponse | null> {
  const ip = getIp(request)
  const rl = await checkLimit(`plugin-ip:${ip}`, ipBudget.limit, ipBudget.windowSec)
  if (rl.success) return null
  return buildRateLimitResponse(rl, `Rate limit ${ipBudget.limit}/${ipBudget.windowSec}s exceeded`)
}

/**
 * Per-API-key rate limit check for plugin routes.
 *
 * Call after validateApiKey() succeeds. Returns NextResponse(429) if the
 * caller has exceeded their budget, null otherwise.
 *
 * Keyed by SHA-256 prefix of the API key so the raw key never lands in
 * Redis. Per-key (not per-IP) because multiple venue staff can share a
 * NAT, and a compromised/runaway key is the actual abuse vector.
 */
export async function enforcePluginRateLimit(
  apiKey: string,
  kind: "read" | "write"
): Promise<NextResponse | null> {
  const budget = kind === "read" ? budgets.pluginRead : budgets.pluginWrite
  const id = createHash("sha256").update(apiKey).digest("hex").slice(0, 16)
  const rl = await checkLimit(`plugin:${id}`, budget.limit, budget.windowSec)
  if (rl.success) return null
  return buildRateLimitResponse(rl, `Rate limit ${budget.limit}/${budget.windowSec}s exceeded`)
}
```

Note the two doc comments (on `enforcePluginIpRateLimit` and `enforcePluginRateLimit`) are preserved verbatim — they document real, non-obvious WHY (attack-vector reasoning), not WHAT, and stay per this repo's comment convention. The local `getIp` function is deleted entirely (replaced by the import).

- [ ] **Step 2: Type-check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Grep-confirm the old local `getIp` is gone and nothing else in the repo depended on it being exported from this file**

Run: `grep -rn "from \"@/lib/api/plugin-rate-limit\"" apps/web --include="*.ts" --include="*.tsx"`
Expected: only `enforcePluginIpRateLimit`/`enforcePluginRateLimit` imported anywhere — `getIp` was never exported from this file (it was a private, unexported function), so no external caller can have depended on it.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/api/plugin-rate-limit.ts
git commit -m "Migrate plugin-rate-limit.ts onto shared getIp/buildRateLimitResponse"
```

---

### Task 3: Migrate the NextAuth route's throttle onto the shared helpers

**Files:**
- Modify: `apps/web/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Update the imports**

Replace:

```ts
import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { checkLimit } from "@/lib/rate-limit"
```

with:

```ts
import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextRequest } from "next/server"
import { checkLimit, getIp, buildRateLimitResponse } from "@/lib/rate-limit"
```

(`NextResponse` is dropped from this import — after Step 2 below, the file no longer constructs a `NextResponse` directly.)

- [ ] **Step 2: Replace the hand-rolled 429 block**

Replace:

```ts
async function withAuthThrottle(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
): Promise<Response> {
  if (AUTH_THROTTLE_RE.test(req.nextUrl.pathname)) {
    const ip = getIp(req)
    const rl = await checkLimit(`auth-ip:${ip}`, 10, 60)
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests", message: "Auth flow rate limit exceeded" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": String(rl.remaining),
            "X-RateLimit-Reset": String(rl.reset),
            "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
          },
        }
      )
    }
  }
  return nextAuthHandler(req, ctx)
}
```

with:

```ts
async function withAuthThrottle(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
): Promise<Response> {
  if (AUTH_THROTTLE_RE.test(req.nextUrl.pathname)) {
    const ip = getIp(req)
    const rl = await checkLimit(`auth-ip:${ip}`, 10, 60)
    if (!rl.success) {
      return buildRateLimitResponse(rl, "Auth flow rate limit exceeded")
    }
  }
  return nextAuthHandler(req, ctx)
}
```

- [ ] **Step 3: Delete the now-unused local `getIp` function**

Delete this block entirely (it's replaced by the imported `getIp` from Step 1):

```ts
function getIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "anonymous"
}
```

The file's doc comment above `AUTH_THROTTLE_RE` (explaining which paths are throttled and why, and the budget rationale) stays untouched — real WHY-rationale, not WHAT.

- [ ] **Step 4: Type-check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Grep-confirm no dangling references**

Run: `grep -n "NextResponse\|function getIp" "apps/web/app/api/auth/[...nextauth]/route.ts"`
Expected: no output (confirms the unused `NextResponse` import and the local `getIp` are both fully gone).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/api/auth/[...nextauth]/route.ts"
git commit -m "Migrate NextAuth route's rate-limit throttle onto shared helpers"
```

---

### Task 4: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: clean (aside from the two pre-existing, unrelated `attendance-overview.tsx`/`event-attendance-chart.tsx` TS7031 errors already tracked as out-of-scope noise from an unrelated recharts-types issue — confirm they're the *only* remaining output, if any).

- [ ] **Step 2: Full test suite**

Run: `cd apps/web && pnpm vitest run`
Expected: all test files pass, including the new `rate-limit.test.ts`.

- [ ] **Step 3: Live verification against the local dev stack**

This change touches two security-relevant request paths (plugin API auth throttle, NextAuth sign-in throttle) with genuinely no behavior change intended — the verification goal is confirming the refactor didn't silently break the 429 path or the happy path.

- Start the local dev server (`docs/LOCAL_DEV.md`).
- **Happy path (no regression):** sign in via the dashboard's normal Discord OAuth flow (or, if a real Discord OAuth round-trip isn't practical in this environment, hit a plugin API route — e.g. `GET /api/plugin/venues` — with a valid API key from a real venue/membership) and confirm a normal 200 response, unaffected by the throttle.
- **429 path:** call the plugin IP-rate-limited path enough times in a tight loop to exceed `ipBudget` (60/60s) — e.g. `for i in $(seq 1 65); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/plugin/venues; done` — and confirm the response past the 60th request is `429` with `X-RateLimit-Limit`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset`, and `Retry-After` headers all present and populated (not blank/undefined), and a JSON body of `{"error":"Too many requests","message":"..."}`.
- Confirm no server-side error/exception appears in the dev server's terminal output during either check.

- [ ] **Step 4: Note the deferred cluster**

Cluster #1 from the findings report (the 20-file plugin-route auth/rate-limit call-site boilerplate — `enforcePluginIpRateLimit`/`validateApiKey`/`enforcePluginRateLimit` repeated in every plugin route handler) is a separate, larger extraction (`withPluginAuth(handler)` wrapper) and deliberately not part of this plan — update `docs/superpowers/plans/2026-08-11-codebase-cleanup-roadmap.md`'s "Next step" section noting clusters #2/#3 are done, #1 remains open for a future increment.
