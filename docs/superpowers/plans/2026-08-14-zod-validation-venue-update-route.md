# Zod Validation Registry — Venue Update Route (Increment 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `app/api/venues/[venueId]/route.ts`'s PATCH handler (the main venue-settings-edit route) onto the shared `validators` registry. Every field it accepts (`name`, `description`, `district`, `ward`, `plot`, `apartment`, `location`) already has a matching registry entry — added back when `app/api/venues/route.ts` (venue _creation_) was migrated — but this _update_ route was never wired up to reuse them, so it still hand-rolls type coercion with no real validation. Also validates `bannerUrl`/`logoUrl` (currently accepted as arbitrary unvalidated strings) against the existing `validators.url`.

**Architecture:** Same `.parse()` + try/catch + `z.ZodError` → 400 pattern as every prior increment. The twist here: this is a **partial-update (PATCH) route where every field is independently optional AND explicitly-nullable** (the real client sends `null` to mean "clear this field" and omits the key entirely to mean "don't touch this field" — these are two different, both-legitimate states the schema must distinguish). Three registry fields (`venueDescription`, `venueLocation`, `url`) currently lack `.nullable()` and need it added — additive-only, safe for their existing consumers (adding `.nullable()` only _accepts more_ input shapes, it can never reject something that previously passed).

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod.

**Confirmed real client request shapes (checked during planning, 2026-08-14):**

- `app/dashboard/[slug]/settings/page.tsx:264-272` (main venue settings save) always sends: `name` (trimmed string or `undefined` if empty — never `null`), `description`/`district`/`ward`/`plot`/`apartment` (real value or explicit `null` — these 5 keys are **always present** in the request body, never omitted). Never sends `location`, `bannerUrl`, or `logoUrl`.
- `components/banner-upload.tsx:32-54` sends **only** `{ bannerUrl: storedUrl }` (a real URL from the now-validated `/api/upload` route's `storedUrl` field) or **only** `{ bannerUrl: null }` (remove) — no other keys.
- `components/logo-upload.tsx:165-188` sends **only** `{ logoUrl: storedUrl }` or **only** `{ logoUrl: null }` — same pattern.
- **No caller currently sends `location`** to this route at all (it's set once at venue creation via `POST /api/venues`, never edited afterward through any UI found during planning). Still validated here for defense-in-depth since the field exists in the route's destructure today and a registry validator already exists for it — if it were ever sent maliciously (unbounded string), it's currently completely unguarded.

**Real gaps confirmed by reading the route during planning (2026-08-14):**

1. `apps/web/app/api/venues/[venueId]/route.ts:39-40` — `ward: ward != null ? Number(ward) : null` (same for `plot`, `apartment`) — `Number(x)` on a non-numeric string produces `NaN`. `NaN` is not a valid value for a Prisma `Int` column; the write throws a Prisma runtime validation error, caught by the route's generic `catch (error) { ... return 500 }` — a malformed `ward`/`plot`/`apartment` currently crashes with a 500 instead of a clean 400. This is the same bug _class_ as Increment 6's upload-route `size` gap (a type-coercion function silently producing a bad value instead of failing loudly) and Increment 5's `notifications` gap (unchecked input reaching Prisma raw).
2. `apps/web/app/api/venues/[venueId]/route.ts:36-44` — `name`, `description`, `district`, `location` are `String(x).trim()`'d with **no length cap at all** — unbounded strings land directly in the `Venue` table and are rendered across the entire app (venue header, discover listings, dashboard nav, staff table's venue-name display, Discord embeds via various `venueWelcomeEmail`/`postNewVenue`-style formatters). The _creation_ route (`app/api/venues/route.ts`) already caps all of these via `validators.venueName`/`venueDescription`/`venueDistrict`/`venueLocation` — this update route just never got the same treatment.
3. `apps/web/app/api/venues/[venueId]/route.ts:43-44` — `bannerUrl`/`logoUrl` are accepted as `String(x)` with **zero format validation** — any string, not just a real URL, gets written to `Venue.bannerUrl`/`Venue.logoUrl` and used directly as an `<img src>` throughout the dashboard and public venue pages.

- [ ] **Step 1: No action needed** — confirmed above.

---

## Task 1: Widen 3 registry fields to accept explicit `null` (additive only)

**Files:**

- Modify: `apps/web/lib/validation.ts`

- [ ] **Step 1: Add `.nullable()` to `venueDescription`, `venueLocation`, and `url`**

Current (`apps/web/lib/validation.ts`, exact lines may have shifted slightly since Increment 3/4 — find by content, not line number):

```typescript
  venueDescription: z.string().max(2000, "Description too long (max 2000 characters)").optional(),
  venueLocation: z.string().max(200, "Location too long (max 200 characters)").optional(),
```

and

```typescript
  webhookUrl: z.string().url("Invalid webhook URL").max(500, "URL too long").optional(),
  url: z.string().url("Invalid URL").max(500, "URL too long").optional(),
```

New:

```typescript
  venueDescription: z.string().max(2000, "Description too long (max 2000 characters)").optional().nullable(),
  venueLocation: z.string().max(200, "Location too long (max 200 characters)").optional().nullable(),
```

and

```typescript
  webhookUrl: z.string().url("Invalid webhook URL").max(500, "URL too long").optional(),
  url: z.string().url("Invalid URL").max(500, "URL too long").optional().nullable(),
```

Only `url` gets `.nullable()` added, not `webhookUrl` — this plan's target route uses `validators.url` for `bannerUrl`/`logoUrl`, not `webhookUrl`. Leave `webhookUrl` untouched (no known consumer needs it nullable, don't widen fields with no demonstrated need — matches this rollout's established "don't invent unneeded flexibility" convention).

This is purely additive: `.nullable()` makes the schema accept one more input shape (`null`) in addition to everything it already accepted (a valid string, or `undefined`/absent). No existing caller of `venueDescription`, `venueLocation`, or `url` (check via `grep -rn "validators.venueDescription\|validators.venueLocation\|validators\.url\b" apps/web/app/api` before editing, to have the actual list in hand) can be broken by this change — none of them currently send `null`, and if they did, they'd have been getting a validation error already (which this change doesn't touch the behavior of for non-null inputs).

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/validation.ts
git commit -m "feat(web): widen venueDescription/venueLocation/url validators to accept explicit null"
```

---

## Task 2: Migrate `app/api/venues/[venueId]/route.ts`'s PATCH handler

**Files:**

- Modify: `apps/web/app/api/venues/[venueId]/route.ts`

- [ ] **Step 1: Add the zod import and define the update schema**

Current (`apps/web/app/api/venues/[venueId]/route.ts:1-6`):

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"
```

New:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"
import { validators } from "@/lib/validation"

const venueUpdateSchema = z.object({
  name: validators.venueName.optional(),
  description: validators.venueDescription,
  district: validators.venueDistrict,
  ward: validators.venueWard,
  plot: validators.venuePlot,
  apartment: validators.venueApartment,
  location: validators.venueLocation,
  bannerUrl: validators.url,
  logoUrl: validators.url,
})
```

`description`, `district`, `ward`, `plot`, `apartment`, `location`, `bannerUrl`, `logoUrl` don't need an extra `.optional()` wrap here — `validators.venueDescription`/`venueLocation`/`url` already end in `.optional().nullable()` after Task 1's change, and `validators.venueDistrict`/`venueWard`/`venuePlot`/`venueApartment` were already `.optional().nullable()` from Increment... (whichever increment originally added them, they predate this plan). Only `name` needs an explicit `.optional()` added here (it's `.min(1)...` with no optional/nullable in the registry, since venue _creation_ requires it — this update route is the first consumer that needs it optional).

- [ ] **Step 2: Replace the manual destructure/coercion with the parsed schema**

Current (`apps/web/app/api/venues/[venueId]/route.ts:21-44`):

```typescript
const { venueId } = await context.params
const body = await request.json()

const venue = await prisma.venue.findUnique({
  where: { id: venueId },
  include: { memberships: { where: { userId: session.user.id } } },
})
if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 })
if (!venue.memberships.length || !["OWNER", "MANAGER"].includes(venue.memberships[0].role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

const { name, description, location, district, ward, plot, apartment, bannerUrl, logoUrl } = body
const updated = await prisma.venue.update({
  where: { id: venueId },
  data: {
    ...(name !== undefined && { name: String(name).trim() }),
    ...(description !== undefined && { description: description ? String(description).trim() : null }),
    ...(district !== undefined && { district: district ? String(district).trim() : null }),
    ...(ward !== undefined && { ward: ward != null ? Number(ward) : null }),
    ...(plot !== undefined && { plot: plot != null ? Number(plot) : null }),
    ...(apartment !== undefined && { apartment: apartment != null ? Number(apartment) : null }),
    ...(location !== undefined && { location: location ? String(location).trim() : null }),
    ...(bannerUrl !== undefined && { bannerUrl: bannerUrl ? String(bannerUrl) : null }),
    ...(logoUrl !== undefined && { logoUrl: logoUrl ? String(logoUrl) : null }),
  },
})
```

New:

```typescript
const { venueId } = await context.params
const body = await request.json()

const venue = await prisma.venue.findUnique({
  where: { id: venueId },
  include: { memberships: { where: { userId: session.user.id } } },
})
if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 })
if (!venue.memberships.length || !["OWNER", "MANAGER"].includes(venue.memberships[0].role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

let parsed: z.infer<typeof venueUpdateSchema>
try {
  parsed = venueUpdateSchema.parse(body)
} catch (error) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
  }
  throw error
}
const { name, description, location, district, ward, plot, apartment, bannerUrl, logoUrl } = parsed

const updated = await prisma.venue.update({
  where: { id: venueId },
  data: {
    ...(name !== undefined && { name: name.trim() }),
    ...(description !== undefined && { description: description ? description.trim() : null }),
    ...(district !== undefined && { district: district ? district.trim() : null }),
    ...(ward !== undefined && { ward }),
    ...(plot !== undefined && { plot }),
    ...(apartment !== undefined && { apartment }),
    ...(location !== undefined && { location: location ? location.trim() : null }),
    ...(bannerUrl !== undefined && { bannerUrl: bannerUrl ?? null }),
    ...(logoUrl !== undefined && { logoUrl: logoUrl ?? null }),
  },
})
```

Key changes in the `data: {...}` builder, explained:

- `ward`/`plot`/`apartment`: the `Number(x)` coercion is gone — `validators.venueWard`/`venuePlot`/`venueApartment` already produce a real `number | null | undefined` via `z.number().int()`, so there's nothing left to coerce. A non-numeric `ward` (e.g. `"abc"`) now fails at `.parse()` with a clean 400 instead of becoming `NaN` and crashing Prisma with a 500.
- `bannerUrl`/`logoUrl`: `bannerUrl ?? null` instead of `bannerUrl ? String(bannerUrl) : null` — `validators.url` already guarantees `bannerUrl` is `string | null | undefined` at this point (a real, format-checked URL, or explicitly `null`), so `?? null` just normalizes `undefined`-that-slipped-through to `null` for the falsy-empty-string edge case... actually since the field is present in the `data` object only when `!== undefined`, and `validators.url` already rejects empty strings as invalid URLs (a `""` fails `.url()`), the `?? null` here only matters if `bannerUrl` is `null` (explicit clear) vs a real validated URL string — both pass through correctly with `?? null` (null stays null, a real string stays itself).
- `name`/`description`/`district`/`location`: still call `.trim()` at the call site — matching Increment 4's established pattern, since none of these registry fields trim internally (only `characterName`/`world` from Increment 3 do).

The rest of the function (cache invalidation, response, the `DELETE` handler below it) is completely unchanged.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/route.ts
git commit -m "fix(web): validate venue PATCH body, close ward/plot/apartment NaN-crash gap"
```

---

## Task 3: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification (session-authenticated, use an active browser session if available — same technique as Increments 4-6's follow-up verification)**

Use a real venue the signed-in account owns (OWNER/MANAGER role required). All calls should target `PATCH /api/venues/<real-venue-id>`.

1. Regression check: `{ name: "Test Venue Name" }` → 200, name actually updates (check the response body).
2. Regression check: use the actual dashboard venue-settings page to change the description, save, confirm it persists — then set it back.
3. `{ ward: "not-a-number" }` → expect 400 with a validation error, NOT a 500 (this is the core bug being fixed — confirm the response is a clean 400, not an opaque 500).
4. `{ description: null }` → expect 200, description actually cleared to `null` in the response (confirms the `.nullable()` widening from Task 1 works and doesn't break the explicit-clear UX the real settings page depends on).
5. `{ name: "a".repeat(101) }` → expect 400 (name over the 100-char cap).
6. `{ bannerUrl: "not-a-url" }` → expect 400 (invalid URL format, previously accepted as-is).
7. `{ bannerUrl: null }` → expect 200, `bannerUrl` cleared (confirms the real `banner-upload.tsx` "remove banner" flow still works).
8. `{ ward: 15 }` on a venue where you can safely change/restore this value → expect 200, `ward` actually set to `15` — then restore to its original value afterward if it was a real venue with a real prior value (or use a disposable test venue for the whole verification pass if a low-stakes one is available, to avoid touching real venue data at all).

- [ ] **Step 3: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms. Reorder in practice as established: push → confirm deploy → deploy → THEN run Step 2's manual verification against the now-live code → update the roadmap doc.
