# Zod Validation Registry — Character/Patron-Visit Routes (Increment 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring 3 route handlers that all deal in FFXIV character identity (`characterName`/`world`) onto `lib/validation.ts`'s shared `validators` registry, reusing the `characterName`/`world` schemas added in Increment 2 rather than adding new ones, and closing four real gaps found by reading the actual source.

**Architecture:** Same pattern as Increments 1-2 (`docs/superpowers/plans/2026-08-12-zod-validation-admin-routes.md`, `2026-08-13-zod-validation-plugin-write-routes.md`): each route builds a local `z.object({...})` from `validators` pieces plus any route-local fields, validates with `schema.parse(body)` inside the route's existing try/catch, and adds a `z.ZodError` branch ahead of the existing generic-500 fallback — matching the exact shape already shipped in `app/api/plugin/patrons/ban/route.ts` (imports `z` from `'zod'`, catches `error instanceof z.ZodError`, returns `{ error: 'Validation error', details: error.issues }` at 400).

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod, Vitest.

**Scope note:** Increment 2's plan explicitly flagged `app/api/user-characters/route.ts` as "the identical unvalidated `characterName`/`world` pattern but a session-authenticated route, not a plugin-API-key route... left for a future increment." This increment is that future increment, plus its two closest siblings in the same feature area (`app/api/plugin/characters/route.ts` — the plugin-API-key counterpart, its own doc comment literally cross-references `user-characters`; and `app/api/plugin/patron-visits/route.ts` — same character-identity fields, plus its own separate real gaps).

**Out of scope:** `app/api/plugin/patrons/vip/route.ts` and `app/api/plugin/patrons/banned/route.ts` were checked during planning (2026-08-14) — both are GET-only, query-param-only (`venueId`, already checked against `auth.venues.includes(venueId)`), no request body to validate. Adding zod there would be registry-consistency only, not a real gap — skipped per Increment 1's stated priority rule ("prioritize routes with a demonstrated real gap... over routes that already validate correctly by hand"). `app/api/user-characters/[id]/route.ts` (DELETE) was also checked — no body, nothing to validate, skipped for the same reason.

---

## Task 0: Confirm scope and gaps (no code — read before starting)

**Real gaps confirmed by reading the 3 target routes during planning (2026-08-14):**

1. `apps/web/app/api/user-characters/route.ts:54-63` — `characterName`/`world` are trimmed then only truthy-checked (`if (!characterName || !world)`). No length cap on either — a malicious or buggy client could send a multi-kilobyte `characterName` straight into the `UserCharacter` table, which is used downstream by `logPatronVisit`'s dedupe query and the staff/patron classification join.
2. `apps/web/app/api/plugin/characters/route.ts:39-46` — identical pattern to #1 (this route's own doc comment describes itself as the plugin-API-key counterpart to `user-characters`), same unbounded-string gap.
3. `apps/web/app/api/plugin/patron-visits/route.ts:49` — **real logic bug**: the required-fields check is `if (!venueId || !characterName || !action || !timestamp)` — `world` is silently excluded from the check despite `PatronVisitPayload` typing it as a required `string`. An omitted `world` flows through as `undefined` into `logPatronVisit`'s dedupe query (`prisma.patronLog.findFirst({ where: { venueId, characterName, world: data.world, ... } })`) — Prisma treats a `where` field set to `undefined` as "don't filter on this", so the dedupe lookup silently stops scoping by world, and a character name that exists on two different worlds at the same venue could dedupe against the wrong world's last-known state. Also unbounded `characterName` (same class as #1/#2), an unvalidated `action` field (typed as `'enter' | 'leave' | 'present'` in the interface but never checked against that enum at runtime — any string passes through to `logPatronVisit`, which only special-cases exact `"ENTER"`/`"PRESENT"` after `.toUpperCase()` and treats everything else, including typos, as a LEAVE), and an unvalidated `timestamp` (passed straight into `new Date(timestamp)` with no format check — an unparseable string produces `Invalid Date`, which Prisma will reject at insert with an opaque error caught by the generic 500 handler instead of a clear 400).
4. `apps/web/app/api/plugin/patron-visits/route.ts:11-17,46,65-71` — `countChange` is optional in the payload and, if the caller supplies it, is forwarded verbatim to `logPatronVisit` (`countChange,` at line 70), which uses it as-is (`data.countChange ?? (isEnter ? 1 : -1)`) instead of always deriving it from `action`. The function's own doc comment states _"The Dalamud plugin's request model has no `countChange` field, so `data.countChange` is always undefined for plugin-sourced logs. Derive it from action instead of trusting the caller"_ — but the route code doesn't actually enforce that; a caller that does supply `countChange` (e.g. `999999`) has it written straight into the `PatronLog.countChange` column, which venue analytics (peak patrons, attendance-by-hour, totals) sums directly. Confirmed the real plugin client (`~/VenueManager/VenueManager/XIVAppPatronApi.cs:16-29`) never sends this field — it's purely an unvalidated attacker-facing surface today.

**Confirmed plugin request shapes** (read from `~/VenueManager/VenueManager/XIVAppPatronApi.cs` and `Plugin.cs` during planning, 2026-08-14):

- `timestamp` is always sent as `DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")` — e.g. `"2026-08-14T06:31:12Z"`. Zod's `z.string().datetime()` (already in the registry as `validators.datetime`) accepts this: default precision is "any number of fractional-second digits, including zero", and it requires the literal `Z` suffix which the plugin always sends.
- `action` is always sent as lowercase `"enter"` or `"leave"` (`Plugin.cs:1407,1418,1461`) in current usage; `"present"` appears in the TS interface's documented union and is kept in the enum for forward-compatibility (matches existing interface, not a new value being introduced).

**No route-handler-level test precedent exists in this codebase** (same finding as Increments 1-2 — `app/api/**/*.test.ts` is empty). This plan's tests (Task 1) cover schema _reuse_ at the route level isn't separately unit-tested since `characterName`/`world` already have dedicated tests from Increment 2 — Task 1 just confirms no new registry fields are needed. Task 4 covers manual verification: `user-characters` is session-authenticated (browser tab), `plugin/characters` and `plugin/patron-visits` are `x-api-key`-authenticated (same curl-with-a-real-key approach Increment 2 used, against the same disposable `TestingOut`/slug `t` test venue).

- [ ] **Step 1: No action needed** — confirmed above.

---

## Task 1: Confirm no new registry fields are needed

**Files:** none (read-only check)

`characterName` and `world` already exist in `apps/web/lib/validation.ts` (added in Increment 2, lines 46-47) with their own tests in `apps/web/lib/validation.test.ts`. This increment's 3 routes all reuse those two fields directly — no new shared registry entries are needed for them. The `action`/`timestamp`/`countChange` fields used only by `patron-visits` are single-consumer within this increment's scope, so per Increments 1-2's "don't promote single-consumer fields" rule they stay local to that route's schema (Task 3), except `timestamp` which reuses the already-shared `validators.datetime`.

- [ ] **Step 1: Run the existing validation tests to confirm the baseline is green before touching route code**

```bash
cd apps/web && npx vitest run lib/validation.test.ts
```

Expected: PASS (all existing tests, including the Increment-2-added `characterName`/`world` describe blocks).

---

## Task 2: Migrate `app/api/user-characters/route.ts`

**Files:**

- Modify: `apps/web/app/api/user-characters/route.ts`

- [ ] **Step 1: Replace the manual truthy checks with a zod schema**

Current (`apps/web/app/api/user-characters/route.ts:1-5, 43-63`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { nanoid } from "nanoid"
```

```typescript
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const characterName = (body.characterName ?? "").trim()
  const world = (body.world ?? "").trim()
  const isPrimary = Boolean(body.isPrimary)

  if (!characterName || !world) {
    return NextResponse.json(
      { error: "characterName and world are required" },
      { status: 400 }
    )
  }
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { nanoid } from "nanoid"
import { z } from "zod"
import { validators } from "@/lib/validation"

const linkCharacterSchema = z.object({
  characterName: validators.characterName,
  world: validators.world,
  isPrimary: z.boolean().optional().default(false),
})
```

```typescript
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let characterName: string
  let world: string
  let isPrimary: boolean
  try {
    const parsed = linkCharacterSchema.parse(body)
    characterName = parsed.characterName.trim()
    world = parsed.world.trim()
    isPrimary = parsed.isPrimary
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    throw error
  }
```

The rest of the function (the `prisma.$transaction` block and its `catch (err: any)` for the `P2002` unique-constraint case) is unchanged — leave it exactly as-is below this point. The new zod parse happens before that existing try/catch, not inside it, so the two error-handling paths stay separate (validation errors are a distinct concern from the DB-level unique-constraint race).

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/user-characters/route.ts
git commit -m "feat(web): validate user-characters POST body with shared characterName/world schema"
```

---

## Task 3: Migrate `app/api/plugin/characters/route.ts`

**Files:**

- Modify: `apps/web/app/api/plugin/characters/route.ts`

- [ ] **Step 1: Replace the manual truthy checks with a zod schema**

Current (`apps/web/app/api/plugin/characters/route.ts:1-4, 34-46`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateApiKey } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"
```

```typescript
const body = await request.json().catch(() => null)
if (!body) {
  return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
}

const characterName = (body.characterName ?? "").trim()
const world = (body.world ?? "").trim()
if (!characterName || !world) {
  return NextResponse.json({ error: "characterName and world are required" }, { status: 400 })
}
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateApiKey } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"
import { z } from "zod"
import { validators } from "@/lib/validation"

const linkCharacterSchema = z.object({
  characterName: validators.characterName,
  world: validators.world,
})
```

```typescript
const body = await request.json().catch(() => null)
if (!body) {
  return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
}

let characterName: string
let world: string
try {
  const parsed = linkCharacterSchema.parse(body)
  characterName = parsed.characterName.trim()
  world = parsed.world.trim()
} catch (error) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
  }
  throw error
}
```

The existing outer `try { ... } catch (error) { console.error(...); return 500 }` around the whole handler body is unchanged — the new inner try/catch for the zod parse sits inside it, and its `throw error` re-throw (for the non-ZodError case, which shouldn't happen here but keeps the pattern uniform with Task 2) is caught by that outer catch same as before.

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/plugin/characters/route.ts
git commit -m "feat(web): validate plugin/characters POST body with shared characterName/world schema"
```

---

## Task 4: Migrate `app/api/plugin/patron-visits/route.ts`

**Files:**

- Modify: `apps/web/app/api/plugin/patron-visits/route.ts`

- [ ] **Step 1: Add a local schema covering all 5 body fields, replace the manual check, and stop trusting client-supplied `countChange`**

Current (`apps/web/app/api/plugin/patron-visits/route.ts:1-18, 45-54`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { validateApiKey, checkPermission, logPatronVisit, getPatronVisits } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"
import { venueEventBus } from "@/lib/sse/venue-events"
import { nanoid } from "nanoid"
import { prisma } from "@/lib/prisma"
import { postVenueGraduation, postPatronVisitXp } from "@/lib/discord-feed"

const GRADUATION_MILESTONES = [100, 500, 1000]

interface PatronVisitPayload {
  venueId: string
  characterName: string
  world: string
  action: "enter" | "leave" | "present"
  timestamp: string
  countChange?: number
}
```

```typescript
const body: PatronVisitPayload = await request.json()
const { venueId, characterName, world, action, timestamp, countChange } = body

// Validate required fields
if (!venueId || !characterName || !action || !timestamp) {
  return NextResponse.json(
    { error: "Missing required fields: venueId, characterName, action, timestamp" },
    { status: 400 }
  )
}
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { validateApiKey, checkPermission, logPatronVisit, getPatronVisits } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"
import { venueEventBus } from "@/lib/sse/venue-events"
import { nanoid } from "nanoid"
import { prisma } from "@/lib/prisma"
import { postVenueGraduation, postPatronVisitXp } from "@/lib/discord-feed"
import { validators } from "@/lib/validation"

const GRADUATION_MILESTONES = [100, 500, 1000]

const patronVisitSchema = z.object({
  venueId: z.string().min(1, "venueId is required"),
  characterName: validators.characterName,
  world: validators.world,
  action: z.enum(["enter", "leave", "present"], { message: "action must be one of: 'enter', 'leave', 'present'" }),
  timestamp: validators.datetime,
})
```

Note `countChange` is deliberately dropped from the schema entirely, not just bounded — the function's own doc comment (`lib/api/plugin-auth.ts`, `logPatronVisit`) already states the real plugin client never sends it and that it should always be derived from `action`. Task Step 3 below stops forwarding it so the code actually matches that documented intent instead of silently accepting a client-supplied override.

```typescript
const body = await request.json()
let venueId: string, characterName: string, world: string, action: "enter" | "leave" | "present", timestamp: string
try {
  const parsed = patronVisitSchema.parse(body)
  venueId = parsed.venueId
  characterName = parsed.characterName
  world = parsed.world
  action = parsed.action
  timestamp = parsed.timestamp
} catch (error) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
  }
  throw error
}
```

- [ ] **Step 2: Remove the now-dead `PatronVisitPayload` interface**

It's fully superseded by `patronVisitSchema` — delete the `interface PatronVisitPayload { ... }` block shown in the "Current" snippet above (it's unused once the schema replaces the manual destructure).

- [ ] **Step 3: Stop forwarding client-supplied `countChange` to `logPatronVisit`**

Current (`apps/web/app/api/plugin/patron-visits/route.ts:65-73`, after the required-fields check and permission check):

```typescript
const result = await logPatronVisit({
  venueId,
  characterName,
  world,
  action,
  countChange,
  timestamp: new Date(timestamp),
  loggedBy: auth.userId,
})
```

New (drop the `countChange` line — `logPatronVisit` already derives it correctly from `action` when its own `countChange` param is `undefined`, per that function's existing `data.countChange ?? (isEnter ? 1 : -1)` line, unchanged in this plan):

```typescript
const result = await logPatronVisit({
  venueId,
  characterName,
  world,
  action,
  timestamp: new Date(timestamp),
  loggedBy: auth.userId,
})
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors. `action`'s type is now narrowed to `'enter' | 'leave' | 'present'` by the zod parse (matching `logPatronVisit`'s existing `data.action: string` param, which is fine — it's a wider type on the callee side already).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/plugin/patron-visits/route.ts
git commit -m "fix(web): validate patron-visits POST body, stop forwarding unvalidated countChange"
```

---

## Task 5: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification — `user-characters` (session-authenticated, browser)**

Sign in to `https://xivvenuemanager.com` in a browser tab with any real account, go to account/character settings (wherever the "link a character" form lives), and:

1. Submit a normal character name + world → should still succeed exactly as before (regression check).
2. If the form allows typing 41+ characters into the name field (may be capped client-side already), submitting should now 400 with the "Character name too long" message instead of silently truncating server-side or failing deeper in the stack.

- [ ] **Step 3: Manual verification — `plugin/characters` and `plugin/patron-visits` (curl + real API key)**

Same approach as Increment 2 (`docs/superpowers/plans/2026-08-13-zod-validation-plugin-write-routes.md`, Task 6): get a real API key for a disposable test venue. Increment 2 used a `TestingOut`/slug `t` test venue for this — reuse the same venue if it still exists, otherwise create an equivalent disposable one and remove the key afterward.

```bash
# Should now 400 — characterName over 40 chars:
curl -s -X POST https://xivvenuemanager.com/api/plugin/characters \
  -H "x-api-key: <your-test-key>" -H "Content-Type: application/json" \
  -d "{\"characterName\":\"$(printf 'a%.0s' {1..41})\",\"world\":\"Balmung\"}"

# Should now succeed — normal values (regression check):
curl -s -X POST https://xivvenuemanager.com/api/plugin/characters \
  -H "x-api-key: <your-test-key>" -H "Content-Type: application/json" \
  -d '{"characterName":"Test Character","world":"Balmung"}'

# Should now 400 — world missing entirely (previously silently accepted as undefined):
curl -s -X POST https://xivvenuemanager.com/api/plugin/patron-visits \
  -H "x-api-key: <your-test-key>" -H "Content-Type: application/json" \
  -d '{"venueId":"<venue-id>","characterName":"Test Character","action":"enter","timestamp":"2026-08-14T06:31:12Z"}'

# Should now 400 — invalid action:
curl -s -X POST https://xivvenuemanager.com/api/plugin/patron-visits \
  -H "x-api-key: <your-test-key>" -H "Content-Type: application/json" \
  -d '{"venueId":"<venue-id>","characterName":"Test Character","world":"Balmung","action":"teleport","timestamp":"2026-08-14T06:31:12Z"}'

# Should now 400 — malformed timestamp:
curl -s -X POST https://xivvenuemanager.com/api/plugin/patron-visits \
  -H "x-api-key: <your-test-key>" -H "Content-Type: application/json" \
  -d '{"venueId":"<venue-id>","characterName":"Test Character","world":"Balmung","action":"enter","timestamp":"not-a-date"}'

# Should still succeed with the plugin's real timestamp format (regression check):
curl -s -X POST https://xivvenuemanager.com/api/plugin/patron-visits \
  -H "x-api-key: <your-test-key>" -H "Content-Type: application/json" \
  -d '{"venueId":"<venue-id>","characterName":"Test Character","world":"Balmung","action":"enter","timestamp":"2026-08-14T06:31:12Z"}'
```

Replace `<your-test-key>`/`<venue-id>` with real values. The `patron-visits` success calls will write real `PatronLog` rows against the test venue — acceptable since it's disposable, but note them for cleanup if the test venue itself isn't being deleted afterward.

- [ ] **Step 4: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms — same as every prior increment, deploy is a separate explicit step, not bundled into this task.
