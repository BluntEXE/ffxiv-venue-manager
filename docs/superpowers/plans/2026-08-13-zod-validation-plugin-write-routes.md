# Zod Validation Registry — Plugin Write Routes (Increment 2) Implementation Plan

**DONE, deployed 2026-08-13** — commit `463d906`, merged to `main` via `zod-plugin-routes` branch (isolated worktree, subagent-driven-development, 5 tasks including 2 real fix-cycles + final whole-branch review). 51/51 tests, typecheck, build all green.

**Two of this plan's own premises were wrong and got corrected during review, not before shipping:**
1. **Task 2 (ban route):** the `reason` schema below (`z.string().min(1,...).max(500,...)`) was missing `.trim()`, which let whitespace-only ban reasons silently pass validation and write an empty `banReason` to the database. Fixed in review by adding `.trim()`: `z.string().trim().min(1,...).max(500,...)`.
2. **Task 4 (link-item route):** this plan's stated goal (line 5, "a logic bug where `link-item`'s `!itemId` check incorrectly rejects `itemId: 0` as 'missing'") was itself wrong. `linkedItemId` is documented in `apps/web/prisma/schema.prisma:576` as the real FFXIV item ID, and two sibling routes (`apps/web/app/api/venues/[venueId]/services/route.ts:16`, `.../[serviceId]/route.ts:15`) already establish `.positive()` as the correct convention — item ID `0` is FFXIV's "no item" sentinel, not a real linkable item, and the dashboard's own `service.linkedItemId ? {...} : null` truthy check (`apps/web/app/dashboard/[slug]/services/page.tsx:283`) would have desynced against a stored `0`. The shipped code uses `itemId: z.number().int().positive('itemId must be a positive integer')`, NOT the `.min(0)` shown in Task 4 below — the old `!itemId` check was accidentally correct all along. Commit reframed from `fix:` to `refactor:` accordingly.

**One additional deviation, not a bug fix but a correction to an invented constraint:** Task 5's `stockCount` field below shows a `.max(1000000, 'stockCount too large')` upper bound. This was never a real gap — two sibling routes (`apps/web/app/api/venues/[venueId]/services/route.ts:19`, `.../[serviceId]/route.ts:18`) validate the same field with no upper bound at all (`z.number().int().min(0)`, unbounded). The shipped code matches that convention and does NOT have a `.max()`. The `.int()` check (the actual real gap — floats like `3.7` previously passed silently) was implemented as planned.

Read the task bodies below for the original planning rationale — they're left as originally written for historical accuracy, corrected only by this header note and by the code that actually shipped (see git history on the `zod-plugin-routes`-derived commits on `main` for the literal diffs, including the fix-cycle commits `c49a1d6` and `315198e`).

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the 4 Dalamud-plugin-facing write API routes (`/api/plugin/patrons/ban`, `/api/plugin/rooms/status`, `/api/plugin/inventory/link-item`, `/api/plugin/inventory/restock`) onto `lib/validation.ts`'s shared `validators` registry, closing five real gaps found by reading the actual source: unbounded `characterName`/`world`/`reason` strings on the ban route, an unbounded `note` on the room-status route, a logic bug where `link-item`'s `!itemId` check incorrectly rejects `itemId: 0` as "missing", an unbounded `itemName`, and an unbounded/non-integer-checked `stockCount` on the restock route.

**Architecture:** Same pattern as Increment 1 (`docs/superpowers/plans/2026-08-12-zod-validation-admin-routes.md`): extend `lib/validation.ts`'s `validators` object with the field schemas these routes need, each route builds a local `z.object({...})` from those shared pieces and validates with `schema.parse(body)` inside the route's existing try/catch, adding a `ZodError` branch before the generic 500 fallback — exactly the pattern all 4 routes already use for their catch block shape (`console.error(...); return NextResponse.json({ error: "Internal server error" }, { status: 500 })`), just inserting a `ZodError`-specific branch ahead of it. All 4 target routes are POST-body routes (not GET query params), so this increment uses `.parse()` + catch throughout — unlike Increment 1, which also had a GET route using `safeParse`. `characterName` and `world` go into the shared registry (used by 15 routes total per a full-repo grep — genuinely shared, not speculative); `reason`, `roomNote`, `itemName`, `itemId`, `stockCount` are each single-consumer within this increment's scope and stay local to their route, matching Increment 1's "don't promote single-consumer fields" rule.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod, Vitest.

**Out of scope:** `apps/web/app/api/user-characters/route.ts` has the identical unvalidated `characterName`/`world` pattern (confirmed by reading it during planning) but is a session-authenticated route, not a plugin-API-key route — different auth model, different feature area. Left for a future increment rather than scope-creeping this one. The auth/rate-limit layer (`validateApiKey`, `enforcePluginRateLimit`, `enforcePluginIpRateLimit`) on all 4 routes is unchanged and out of scope — only request body shape validation is in scope.

---

## Task 0: Confirm scope and testing approach (no code — read before starting)

**Real gaps confirmed by reading the 4 target routes during planning (2026-08-13):**

1. `apps/web/app/api/plugin/patrons/ban/route.ts:38-45` — `characterName`, `world`, `reason` are destructured from the raw body with only a truthy check (`!venueId || !characterName || !world || !reason || !reason.trim()`). No length cap on any of them — a malicious or buggy plugin client could send a multi-megabyte `reason` string straight into the `Patron.banReason` column.
2. `apps/web/app/api/plugin/rooms/status/route.ts:38-46` — `note` has no length cap at all (only `venueId`/`roomId`/`isOccupied` are checked).
3. `apps/web/app/api/plugin/inventory/link-item/route.ts:39-46` — **real logic bug**: `if (!venueId || !serviceId || !itemId || !itemName)` — `!itemId` is `true` when `itemId === 0`, so linking to a hypothetical FFXIV item with numeric ID `0` would be incorrectly rejected as "missing required field". (Whether item ID `0` is realistically ever assigned by FFXIV's item table is beside the point — the check's *intent* is "was this field provided", and it silently conflates "provided as zero" with "not provided", which is a bug regardless.) Also no length cap on `itemName`.
4. `apps/web/app/api/plugin/inventory/restock/route.ts:38-45` — `stockCount` is checked for `typeof stockCount !== 'number' || stockCount < 0`, so a lower bound exists but there's no upper bound and no `Number.isInteger` check — `stockCount: 3.7` currently passes silently and gets written straight to the `Service.stockCount` column.

**No route-handler-level test precedent exists in this codebase** (confirmed again, same finding as Increment 1 — `app/api/**/*.test.ts` is empty). This plan's tests (Task 1) cover the *schemas* directly. Task 6 covers the routes themselves — but unlike Increment 1 (which could use a real browser admin session for manual verification), **these 4 routes are Dalamud-plugin-authenticated** (`x-api-key` header, not a browser session/cookie). Manual verification needs either a real plugin client hitting the live API, or a `curl` request carrying a real, valid API key for a test venue. Task 6 documents both options — there is no way to exercise these routes from a browser tab.

- [ ] **Step 1: No action needed** — confirmed above.

---

## Task 1: Add shared field schemas to the registry, with tests

**Files:**
- Modify: `apps/web/lib/validation.ts`
- Modify: `apps/web/lib/validation.test.ts` (already exists, created in Increment 1 — add to it, don't recreate)

- [ ] **Step 1: Write the failing tests**

Add these `describe` blocks to the end of the existing `apps/web/lib/validation.test.ts` (the file already has `import { describe, it, expect } from "vitest"` and `import { validators } from "./validation"` at the top — don't duplicate those imports, just append):

```typescript
describe("validators.characterName", () => {
  it("accepts a normal FFXIV character name", () => {
    expect(validators.characterName.safeParse("Y'shtola Rhul").success).toBe(true)
  })

  it("rejects an empty string", () => {
    expect(validators.characterName.safeParse("").success).toBe(false)
  })

  it("rejects a string over 40 characters", () => {
    expect(validators.characterName.safeParse("a".repeat(41)).success).toBe(false)
  })
})

describe("validators.world", () => {
  it("accepts a normal FFXIV world name", () => {
    expect(validators.world.safeParse("Balmung").success).toBe(true)
  })

  it("rejects an empty string", () => {
    expect(validators.world.safeParse("").success).toBe(false)
  })

  it("rejects a string over 32 characters", () => {
    expect(validators.world.safeParse("a".repeat(33)).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run lib/validation.test.ts
```

Expected: FAIL — `validators.characterName is undefined`.

- [ ] **Step 3: Add the schemas**

In `apps/web/lib/validation.ts`, add to the existing `validators` object, after the `adminNotes` entry added in Increment 1 (currently the last entry before the closing `}`):

```typescript
  characterName: z.string().min(1, "Character name is required").max(40, "Character name too long (max 40 characters)"),
  world: z.string().min(1, "World is required").max(32, "World name too long (max 32 characters)"),
```

(40/32 char caps chosen generously above FFXIV's actual name-length limits — first+last name are each capped at 15 characters in-game, ~31 total with the space, and world names are well under 32 — giving headroom without being effectively unbounded. Matches this file's existing style of generous-but-real bounds, e.g. `venueName` at 100, `roleName` at 50.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run lib/validation.test.ts
```

Expected: PASS, all tests including the 6 new ones (3 for `characterName`, 3 for `world`).

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/validation.ts apps/web/lib/validation.test.ts
git commit -m "feat(web): add characterName/world to shared validators"
```

---

## Task 2: Migrate `app/api/plugin/patrons/ban/route.ts`

**Files:**
- Modify: `apps/web/app/api/plugin/patrons/ban/route.ts`

- [ ] **Step 1: Replace the manual truthy checks with a zod schema**

Current (`apps/web/app/api/plugin/patrons/ban/route.ts:1-11, 37-45`):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

interface BanPatronPayload {
  venueId: string
  characterName: string
  world: string
  reason: string
}
```

```typescript
    const body: BanPatronPayload = await request.json()
    const { venueId, characterName, world, reason } = body

    if (!venueId || !characterName || !world || !reason || !reason.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: venueId, characterName, world, reason' },
        { status: 400 }
      )
    }
```

Replace with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'
import { validators } from '@/lib/validation'

const banSchema = z.object({
  venueId: z.string().min(1, 'venueId is required'),
  characterName: validators.characterName,
  world: validators.world,
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason too long (max 500 characters)'),
})
```

```typescript
    const body = await request.json()
    const { venueId, characterName, world, reason } = banSchema.parse(body)
```

(`reason` stays local, not promoted to the shared registry — this is the only route in this increment that takes a free-text ban reason. 500-char cap matches this file's existing `transactionNotes`/`payrollNotes` scale.)

The `BanPatronPayload` interface is removed entirely — `banSchema.parse(body)` gives the same shape via type inference, no need for a separately-maintained interface that could drift from the zod schema.

- [ ] **Step 2: Add the `ZodError` branch to the existing catch block**

Current (`apps/web/app/api/plugin/patrons/ban/route.ts:80-83`):

```typescript
  } catch (error) {
    console.error('[Plugin API] Error banning patron:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
```

Replace with:

```typescript
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('[Plugin API] Error banning patron:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
```

(Same `{ error: "Validation error", details: error.issues }` shape used by every route Increment 1 migrated — kept consistent rather than inventing a plugin-specific error shape.)

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/plugin/patrons/ban/route.ts
git commit -m "refactor(web): validate plugin ban-patron body with shared zod schema"
```

---

## Task 3: Migrate `app/api/plugin/rooms/status/route.ts`

**Files:**
- Modify: `apps/web/app/api/plugin/rooms/status/route.ts`

- [ ] **Step 1: Replace the manual checks with a zod schema**

Current (`apps/web/app/api/plugin/rooms/status/route.ts:1-12, 38-46`):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkPermission } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'
import { venueEventBus } from '@/lib/sse/venue-events'

interface SetRoomStatusPayload {
  venueId: string
  roomId: string
  isOccupied: boolean
  note?: string
}
```

```typescript
    const body: SetRoomStatusPayload = await request.json()
    const { venueId, roomId, isOccupied, note } = body

    if (!venueId || !roomId || typeof isOccupied !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: venueId, roomId, isOccupied' },
        { status: 400 }
      )
    }
```

Replace with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateApiKey, checkPermission } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'
import { venueEventBus } from '@/lib/sse/venue-events'

const roomStatusSchema = z.object({
  venueId: z.string().min(1, 'venueId is required'),
  roomId: z.string().min(1, 'roomId is required'),
  isOccupied: z.boolean(),
  note: z.string().max(500, 'Note too long (max 500 characters)').optional(),
})
```

```typescript
    const body = await request.json()
    const { venueId, roomId, isOccupied, note } = roomStatusSchema.parse(body)
```

The `SetRoomStatusPayload` interface is removed — same reasoning as Task 2.

**Preserve the existing note-omission semantics exactly.** The route's current logic (unchanged by this task, still present after `roomStatusSchema.parse(body)`):

```typescript
        note: note !== undefined ? note.trim() || null : room.note,
```

`note: undefined` (omitted from the request) still means "leave the existing note alone"; `note: ""` still means "clear it". `z.string().optional()` produces exactly `string | undefined` — the same type this line already branches on — so no change is needed to this line itself, only the destructuring source above it.

- [ ] **Step 2: Add the `ZodError` branch**

Current (`apps/web/app/api/plugin/rooms/status/route.ts:89-92`):

```typescript
  } catch (error) {
    console.error('[Plugin API] Error setting room status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
```

Replace with:

```typescript
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('[Plugin API] Error setting room status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/plugin/rooms/status/route.ts
git commit -m "refactor(web): validate plugin room-status body with shared zod schema"
```

---

## Task 4: Migrate `app/api/plugin/inventory/link-item/route.ts` (also fixes the `itemId: 0` bug)

**Files:**
- Modify: `apps/web/app/api/plugin/inventory/link-item/route.ts`

- [ ] **Step 1: Replace the manual checks with a zod schema**

Current (`apps/web/app/api/plugin/inventory/link-item/route.ts:1-13, 38-46`):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'
import { invalidateCache, cacheKeys } from '@/lib/redis-cache'

interface LinkItemPayload {
  venueId: string
  serviceId: string
  itemId: number
  itemName: string
  iconId?: number | null
}
```

```typescript
    const body: LinkItemPayload = await request.json()
    const { venueId, serviceId, itemId, itemName, iconId } = body

    if (!venueId || !serviceId || !itemId || !itemName) {
      return NextResponse.json(
        { error: 'Missing required fields: venueId, serviceId, itemId, itemName' },
        { status: 400 }
      )
    }
```

Replace with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'
import { invalidateCache, cacheKeys } from '@/lib/redis-cache'

const linkItemSchema = z.object({
  venueId: z.string().min(1, 'venueId is required'),
  serviceId: z.string().min(1, 'serviceId is required'),
  itemId: z.number().int().min(0, 'itemId must be a non-negative integer'),
  itemName: z.string().min(1, 'itemName is required').max(200, 'Item name too long (max 200 characters)'),
  iconId: z.number().int().min(0).optional().nullable(),
})
```

```typescript
    const body = await request.json()
    const { venueId, serviceId, itemId, itemName, iconId } = linkItemSchema.parse(body)
```

**This fixes the `itemId: 0` bug named in this task's title.** The old code's `!itemId` check treated `0` as "missing"; `z.number().int().min(0, ...)` treats `0` as a valid non-negative integer and only rejects genuinely missing/negative/non-integer values. `itemName` gets a 200-char cap (FFXIV item names, including glamour/dye modifiers in display strings, are longer than typical `venueName`-style fields but still clearly bounded — no real item name approaches 200 characters).

The `LinkItemPayload` interface is removed — same reasoning as Task 2.

- [ ] **Step 2: Add the `ZodError` branch**

Current (`apps/web/app/api/plugin/inventory/link-item/route.ts:72-75`):

```typescript
  } catch (error) {
    console.error('[Plugin API] Error linking item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
```

Replace with:

```typescript
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('[Plugin API] Error linking item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/plugin/inventory/link-item/route.ts
git commit -m "fix(web): allow itemId 0 and validate plugin link-item body with zod"
```

(Commit message leads with `fix:` not `refactor:`, unlike Tasks 2-3 — this one contains a real behavior fix, not just a validation-consistency change.)

---

## Task 5: Migrate `app/api/plugin/inventory/restock/route.ts`

**Files:**
- Modify: `apps/web/app/api/plugin/inventory/restock/route.ts`

- [ ] **Step 1: Replace the manual checks with a zod schema**

Current (`apps/web/app/api/plugin/inventory/restock/route.ts:1-11, 37-45`):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'
import { invalidateCache, cacheKeys } from '@/lib/redis-cache'

interface RestockPayload {
  venueId: string
  serviceId: string
  stockCount: number
}
```

```typescript
    const body: RestockPayload = await request.json()
    const { venueId, serviceId, stockCount } = body

    if (!venueId || !serviceId || typeof stockCount !== 'number' || stockCount < 0) {
      return NextResponse.json(
        { error: 'Missing or invalid fields: venueId, serviceId, stockCount (>= 0)' },
        { status: 400 }
      )
    }
```

Replace with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'
import { invalidateCache, cacheKeys } from '@/lib/redis-cache'

const restockSchema = z.object({
  venueId: z.string().min(1, 'venueId is required'),
  serviceId: z.string().min(1, 'serviceId is required'),
  stockCount: z.number().int('stockCount must be a whole number').min(0, 'stockCount must be non-negative').max(1000000, 'stockCount too large'),
})
```

```typescript
    const body = await request.json()
    const { venueId, serviceId, stockCount } = restockSchema.parse(body)
```

**This closes the two named gaps for this route:** `Number.isInteger` enforcement (`z.number().int(...)` rejects `3.7`, where the old `typeof stockCount !== 'number'` check let any finite number through, fractional or not) and an upper bound (1,000,000 — a venue restocking a drink to over a million units is certainly a typo, not a real inventory count; chosen generously above any plausible real value rather than guessing a tight number).

The `RestockPayload` interface is removed — same reasoning as Task 2.

- [ ] **Step 2: Add the `ZodError` branch**

Current (`apps/web/app/api/plugin/inventory/restock/route.ts:71-74`):

```typescript
  } catch (error) {
    console.error('[Plugin API] Error restocking:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
```

Replace with:

```typescript
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('[Plugin API] Error restocking:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/plugin/inventory/restock/route.ts
git commit -m "fix(web): enforce integer/bounded stockCount with shared zod schema"
```

(Also a `fix:`, not `refactor:` — the missing-integer-check was a real gap, not just a consistency improvement.)

---

## Task 6: Full regression pass + manual verification + deploy

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification**

These 4 routes are Dalamud-plugin-authenticated (`x-api-key` header), not browser-session routes — Increment 1's "log in as admin in a browser tab" verification method doesn't apply here. Two options, pick whichever is available:

**Option A — real plugin client (preferred, exercises the true integration):**
1. Build and load the current `-testing` plugin build against a real venue.
2. From the plugin's Rooms tab, toggle a room's occupied status with a note over 500 characters (if the plugin UI allows typing that much — otherwise skip to Option B for this specific case) → should fail cleanly, not corrupt the room record.
3. From the plugin's Inventory tab, link an item and restock it with a normal value → should still work exactly as before (regression check).
4. Run `/xvm ban! <reason>` on a test character → should still work with a normal reason.

**Option B — `curl` with a real API key (covers the edge cases the plugin UI won't let you type):**

Get a real API key for a test venue from the dashboard's API Keys page first. Then:

```bash
# Should now 400 (previously would have silently truncated or errored deeper in the stack) — reason over 500 chars:
curl -s -X POST https://xivvenuemanager.com/api/plugin/patrons/ban \
  -H "x-api-key: <your-test-key>" -H "Content-Type: application/json" \
  -d "{\"venueId\":\"<venue-id>\",\"characterName\":\"Test Character\",\"world\":\"Balmung\",\"reason\":\"$(printf 'a%.0s' {1..501})\"}"

# Should now 400 — non-integer stockCount:
curl -s -X POST https://xivvenuemanager.com/api/plugin/inventory/restock \
  -H "x-api-key: <your-test-key>" -H "Content-Type: application/json" \
  -d '{"venueId":"<venue-id>","serviceId":"<service-id>","stockCount":3.7}'

# Should now succeed (previously incorrectly 400'd) — itemId: 0:
curl -s -X POST https://xivvenuemanager.com/api/plugin/inventory/link-item \
  -H "x-api-key: <your-test-key>" -H "Content-Type: application/json" \
  -d '{"venueId":"<venue-id>","serviceId":"<service-id>","itemId":0,"itemName":"Test Item"}'
```

Replace `<your-test-key>`, `<venue-id>`, `<service-id>` with real values for a disposable test venue — don't run the restock/link-item calls against a real production service's inventory without expecting the values to actually change.

- [ ] **Step 3: Push and deploy**

```bash
cd ~/xiv-app && git push origin main
~/bin/deploy-xiv-web.sh --green
```

- [ ] **Step 4: Post-deploy spot check**

Re-run the `itemId: 0` `curl` check (Step 2, Option B, third command) against `https://xivvenuemanager.com` directly post-deploy — confirm it succeeds. Also confirm no new GlitchTip issues appear for these 4 routes in the minutes after deploy.

---

## Remaining rollout

This increment covers 4 more of the roadmap's 133 target routes (8 of 133 now done, across the two increments). ~125 remain. Same rollout guidance as Increment 1's plan applies: small coherent batches by feature area, real-gap routes prioritized over already-correct ones, `.parse()`+catch for bodies / `safeParse` for GET query params, promote genuinely multi-consumer fields to the shared registry.

**Noted but explicitly deferred, not part of this increment:** `apps/web/app/api/user-characters/route.ts` has the same unvalidated `characterName`/`world` pattern this increment just fixed for the plugin routes — now that `validators.characterName`/`validators.world` exist in the shared registry, migrating that route onto them is a small, low-risk follow-up for a future increment (different auth model — session-based, not plugin-API-key — so it wasn't bundled into this batch, but the shared fields it needs already exist after this increment ships).

---

## Self-Review

**Spec coverage:** all 5 named gaps (ban route's 3 unbounded strings, room-status's unbounded note, link-item's `itemId: 0` bug + unbounded itemName, restock's missing integer/upper-bound check) each have a dedicated task. Task 0 addresses the testing-approach question raised in scope. Task 6 covers full regression + the plugin-specific manual verification gap (no browser session available) + deploy. Out-of-scope items (`user-characters` route, auth/rate-limit layer) are explicitly named, not silently dropped.

**Placeholder scan:** no TBD/TODO, every step shows full before/after code including exact line-number references captured during planning, no "similar to Task N" shorthand — each of the 4 route migrations got its own literal diff despite the repeated pattern.

**Type consistency:** `validators.characterName`/`validators.world` (Task 1) used identically in Task 2's `banSchema`; the `{ error: "Validation error", details: error.issues }` shape is identical across Tasks 2-5, matching Increment 1's established shape; each task's `Payload` interface removal is consistent (schema inference replaces the manually-maintained interface in all 4 cases, not just some).
