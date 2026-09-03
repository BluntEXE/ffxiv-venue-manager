# Venue Profile Fields xvm-api Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move venue profile fields (`name`, `description`, `banner_url`, `logo_url`, `district`, `ward`, `plot`, `apartment`→`room`) off Prisma's `Venue` columns onto xvm-api's `VenueUpdate`/`VenueDetail`, closing the write-side gap that made today's public-page migration attempt regress (fields the public page tried reading from xvm-api were never written there by anything).

**Architecture:** One route (`app/api/venues/[venueId]/route.ts`) currently writes all of these fields to Prisma and is the sole write path for all three UI surfaces that edit them (the settings page's profile form, and the banner/logo upload components, which both PATCH this same route). Rewriting its PATCH handler to write to xvm-api instead — via the already-existing `updateVenue`/`VenueUpdate` client function (already used by `settings/route.ts` for visibility fields) — covers all three callers with one change. The settings page's *read* side needs a new source (same "Task 5b" pattern as the gallery plan): it currently reads these fields from `/api/venues?slug=` (Prisma, serves the venue list), which needs to keep serving fields that have no xvm-api equivalent (membership role, `xvmApiVenueId`, etc) while the profile fields move to a new source. A backfill script (same shape as the gallery one) migrates existing venues' current Prisma values into xvm-api once. The public venue page's profile-field read (reverted today, xvm-dashboard#49) gets re-applied last, once real data will actually be there.

**Tech Stack:** Next.js route handlers, `lib/api/xvm-api.ts` (`updateVenue`, `getVenue`, already existing), Prisma (write removed from the migrated fields, read-only for the join key and for fields with no xvm-api equivalent).

---

## Context for the engineer

- **The `apartment` → `room` field mapping.** Prisma's `Venue.apartment` column is UI-labelled "Room" in the current settings form and public-page Location card (`{ k: "Room", v: venue.apartment }`) — it was always the apartment unit number, not a separate "apartment" concept. xvm-api's schema has both an `apartment: int` field and a `room: int` field; the plugin's actual game-data model (`VenueManager/Venue.cs`, the plugin's real `Venue` struct — the ground truth for what data ever gets collected) has `plot`, `ward`, `room`, `district` and **no separate apartment-number field at all**. `type`/housing-kind decides house-vs-apartment; the numeric field is always `plot` (house) or `room` (apartment/chamber), never both, never a third number. Confirmed by the user (2026-09-03): "Apartments are separate to houses in game... pretty sure we have the same thing happening in plugin" — verified true. **Write dashboard's `apartment` value to xvm-api's `room` field. Never write to xvm-api's own `apartment` field — nothing evidences what it's for, and writing an unrelated value there would be worse than leaving it alone.**
- **`location` (freeform legacy text) is out of scope entirely.** Confirmed by reading the current settings page: it's never in the PATCH payload today (not editable via any form), only read as a fallback display on the public page when no structured fields are set. No xvm-api equivalent, genuinely a different bucket than the fields this plan migrates, not touched by any task here.
- **Banner/logo need no new upload mechanism.** `components/banner-upload.tsx` and `components/logo-upload.tsx` both already: upload the raw file to `/api/upload` (existing presigned-URL-to-MinIO flow, the dashboard's own `xiv-venues` bucket — unrelated to and unaffected by the gallery migration, which uses a different MinIO bucket via a different mechanism), then `PATCH /api/venues/${venueId}` with `{ bannerUrl: storedUrl }` / `{ logoUrl: storedUrl }`. Only the PATCH destination changes in this plan (Prisma → xvm-api) — the upload mechanism itself is untouched.
- **Auth**: xvm-api's `PATCH /venues/{venue_id}` already enforces `deps.require_tier(MembershipTier.Manager)` server-side (confirmed in `src/api/routers/venues.py`, same as the gallery route's precedent) — the rewritten route should trust that and drop its own Prisma-based OWNER/MANAGER membership check, same pattern as every other already-migrated route in this codebase.
- **No Prisma fallback, matching the standing rule**: once a field is migrated, the route stops writing it to Prisma at all — no dual-write. If the xvm-api call fails or the venue isn't connected, that's a real error surfaced to the user (a 503/409, matching the existing pattern in `gallery/route.ts` and `settings/route.ts`), not a silent Prisma fallback.
- **Local dev**: `docker-compose.local.yml` Postgres/Redis, `.env.local` already configured from prior sessions, `XVM_API_BASE_URL` points at the shared dev xvm-api instance (`http://192.168.1.122:8001`), which already has `PATCH /venues/{venue_id}` supporting every field this plan needs (confirmed via `VenueUpdate` schema, already live).

## File Structure

- Rewrite: `apps/web/app/api/venues/[venueId]/route.ts` — PATCH handler writes to xvm-api instead of Prisma for the 7 migrated fields (apartment→room mapping happens here); DELETE handler untouched.
- Modify: `apps/web/app/api/venues/[venueId]/settings/route.ts` — extend the existing GET's `getVenue()` call (already made for visibility fields) to also return `name`, `description`, `banner_url`, `logo_url`, `district`, `ward`, `room` (as `apartment` in the response, reversing the mapping so the page doesn't need to know about it).
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx` — read the 7 profile fields from the (now-extended) settings GET response instead of `/api/venues?slug=`'s Prisma-sourced fields; `handleSave`'s PATCH payload to `/api/venues/${venueId}` is unchanged (still sends `apartment`, the route handles the rename).
- Create: `apps/web/backfill-venue-profile.js` — one-time ops script, same shape as `backfill-gallery-images.js` (progress-file idempotency, `--dry-run`, `tsx` runner), migrating existing connected venues' current Prisma profile-field values into xvm-api.
- Modify: `apps/web/app/venues/[slug]/page.tsx` — re-apply the profile-field xvm-api read that was reverted today (xvm-dashboard#49, commit `a8f7084`), now that the write side is real. This is the last task, done only after 1-4 are live-verified.

## Task 1: Rewrite the venue PATCH route

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/route.ts`

- [ ] **Step 1: Read the current file in full to confirm nothing has changed since this plan was written**

Run: `cat apps/web/app/api/venues/\[venueId\]/route.ts`

- [ ] **Step 2: Rewrite the PATCH handler**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updateVenue, type VenueUpdate } from "@/lib/api/xvm-api"

const venueUpdateSchema = z.object({
  name: validators.venueName.optional(),
  description: validators.venueDescription,
  district: validators.venueDistrict,
  ward: validators.venueWard,
  plot: validators.venuePlot,
  apartment: validators.venueApartment,
  bannerUrl: validators.url,
  logoUrl: validators.url,
})

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true, slug: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId, slug: venue.slug }
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    const body = await request.json()
    let parsed: z.infer<typeof venueUpdateSchema>
    try {
      parsed = venueUpdateSchema.parse(body)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      throw error
    }
    const { name, description, district, ward, plot, apartment, bannerUrl, logoUrl } = parsed

    // apartment -> room: Prisma's "apartment" column has always meant the
    // apartment unit number (UI-labelled "Room" already). xvm-api has a
    // separate, unrelated "apartment" field with no evidence of intended use
    // anywhere (no test, no comment, absent from the plugin's real housing
    // data model, which only has plot/ward/room/district). Never write it.
    const xvmUpdate: VenueUpdate = {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description ? description.trim() : null }),
      ...(district !== undefined && { district: district ? district.trim() : null }),
      ...(ward !== undefined && { ward }),
      ...(plot !== undefined && { plot }),
      ...(apartment !== undefined && { room: apartment }),
      ...(bannerUrl !== undefined && { banner_url: bannerUrl ?? null }),
      ...(logoUrl !== undefined && { logo_url: logoUrl ?? null }),
    }

    try {
      const updated = await updateVenue(token, gate.xvmApiVenueId!, xvmUpdate)
      await Promise.all([
        invalidateCache(cacheKeys.venue(venueId)),
        invalidateCache(cacheKeys.venueBySlug(gate.slug!)),
        invalidateCache(cacheKeys.userVenues(session.user.id)),
      ])
      return NextResponse.json(updated)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[venue] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)
```

Note what's deliberately dropped from the original: the Prisma-based OWNER/MANAGER membership check (xvm-api's own `require_tier(Manager)` on `PATCH /venues/{id}` already enforces this, matching every other migrated route's pattern), and the Prisma write entirely (no dual-write, per the standing no-fallback rule).

**Do not touch the `DELETE` handler in this same file** — venue deletion is a dashboard-local lifecycle action with no xvm-api equivalent needed, out of scope for this plan.

- [ ] **Step 3: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit && npx eslint app/api/venues/\[venueId\]/route.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/route.ts
git commit -m "feat: write venue profile fields to xvm-api instead of Prisma"
```

## Task 2: Extend the settings GET to expose profile fields

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/settings/route.ts`

- [ ] **Step 1: Read the current GET handler in full**

Run: `sed -n '86,187p' apps/web/app/api/venues/\[venueId\]/settings/route.ts`

Confirm it still matches: fetches Prisma `venue` for the legacy settings JSON + a few columns, then (if `venue.xvmApiVenueId`) calls `getVenue(token, venue.xvmApiVenueId)` and overlays `task_visibility`/`sales_visibility`/`revenue_visibility`/`event_visibility`/`venue_type` onto the response, with a `visibilityDegraded` flag on failure.

- [ ] **Step 2: Add the profile fields to the same `getVenue` overlay**

In the `if (venue.xvmApiVenueId)` block, alongside the existing visibility/venueType assignments, add:

```typescript
responseBody.name = detail.name
responseBody.description = detail.description
responseBody.bannerUrl = detail.banner_url
responseBody.logoUrl = detail.logo_url
responseBody.district = detail.district
responseBody.ward = detail.ward
responseBody.apartment = detail.room // xvm-api's "room" is what the dashboard has always called "apartment" - see Task 1's note
```

And in the `degraded` branch (the `catch`/failure path that currently deletes the visibility keys rather than serving stale data), add the same fields to the delete list:

```typescript
delete responseBody.name
delete responseBody.description
delete responseBody.bannerUrl
delete responseBody.logoUrl
delete responseBody.district
delete responseBody.ward
delete responseBody.apartment
```

Do NOT add a Prisma fallback for these fields even when `venue.xvmApiVenueId` is null (venue not yet connected) — leave them absent from the response in that case, matching how visibility fields already behave for an unconnected venue (the response simply won't include the key; the settings page's `venue.name ?? ""` -style fallback in Task 3 handles the absent case, it does not mean "read Prisma instead").

- [ ] **Step 3: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit && npx eslint app/api/venues/\[venueId\]/settings/route.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/settings/route.ts
git commit -m "feat: expose venue profile fields from settings GET via xvm-api"
```

## Task 3: Rewire the settings page's read side

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

- [ ] **Step 1: Read the current fetch/populate block (lines ~128-200) and the `handleSave` PATCH block (lines ~264-289) to confirm they still match what this plan found**

Run: `sed -n '128,200p;264,289p' apps/web/app/dashboard/\[slug\]/settings/page.tsx`

- [ ] **Step 2: Move the profile-field population from the `/api/venues?slug=` response to the settings GET response**

The `fetchSettings` effect currently does two fetches in sequence: `/api/venues?slug=${slug}` (sets `venueId`, then the 7 profile fields, then `bannerUrl`/`logoUrl`, then triggers the gallery fetch), followed by `/api/venues/${venue.id}/settings` (sets the `settings` state and a handful of other fields).

Move these seven lines:
```typescript
setVenueName(venue.name ?? "")
setVenueDescription(venue.description ?? "")
setVenueDistrict(venue.district ?? "__none__")
setVenueWard(venue.ward != null ? String(venue.ward) : "")
setVenuePlot(venue.plot != null ? String(venue.plot) : "")
setVenueApartment(venue.apartment != null ? String(venue.apartment) : "")
setHousingType(venue.apartment != null ? "apartment" : "house")
setBannerUrl(venue.bannerUrl ?? null)
setLogoUrl(venue.logoUrl ?? null)
```
out of the `venueResponse`/`venues.find(...)` block, and into the `settingsResponse` block instead, reading from `settingsData` (the parsed JSON of `/api/venues/${venue.id}/settings`) instead of `venue`:
```typescript
setVenueName(settingsData.name ?? "")
setVenueDescription(settingsData.description ?? "")
setVenueDistrict(settingsData.district ?? "__none__")
setVenueWard(settingsData.ward != null ? String(settingsData.ward) : "")
setVenuePlot(settingsData.plot != null ? String(settingsData.plot) : "")
setVenueApartment(settingsData.apartment != null ? String(settingsData.apartment) : "")
setHousingType(settingsData.apartment != null ? "apartment" : "house")
setBannerUrl(settingsData.bannerUrl ?? null)
setLogoUrl(settingsData.logoUrl ?? null)
```
Leave `setVenueDataCenter(venue.dataCenter ?? "")` / `setVenueWorld(venue.world ?? "")` reading from the original `venueResponse` block — `dataCenter`/`world` aren't part of this plan's migrated fields (they're read-only display in this form, not editable, and Task 2 didn't add them to the settings GET response).

Leave `setVenueId`, `setXvmApiVenueId`, `setXvmApiVenueLinkedAt`, the gallery fetch, and the membership-role line exactly where they are (still reading from `venue`/`venueResponse` — none of those are profile fields this plan touches).

- [ ] **Step 3: Confirm `handleSave` needs no change**

Re-read the `profileRes` PATCH block (lines ~272-284) against Task 1's rewritten route — the payload shape (`name`, `description`, `district`, `ward`, `plot`, `apartment`) is unchanged; the route now maps `apartment` → xvm-api's `room` internally, the page doesn't need to know about that. Confirm this by inspection; make no edit here unless something doesn't line up, in which case stop and report back rather than guessing.

- [ ] **Step 4: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit && npx eslint app/dashboard/\[slug\]/settings/page.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/\[slug\]/settings/page.tsx
git commit -m "feat: read venue profile fields from xvm-api-backed settings endpoint"
```

## Task 4: Backfill existing venues' profile fields into xvm-api

**Files:**
- Create: `apps/web/backfill-venue-profile.js`

- [ ] **Step 1: Write the script**

```javascript
// One-time backfill: push existing venues' current Prisma profile-field
// values (name, description, banner, logo, district, ward, plot->room) into
// xvm-api, for venues connected before Task 1 shipped and whose xvm-api
// profile has never been touched since createVenue seeded only
// name/data_center/world. Run once, manually, via `tsx backfill-venue-profile.js`
// from apps/web (pass --dry-run to report without writing). Idempotent per
// field, not per venue: progress is tracked in a local JSON file
// (backfill-venue-profile.progress.json, gitignored) recording which venues
// have already been pushed, so a re-run only retries venues that failed or
// haven't been attempted - same pattern as backfill-gallery-images.js.
//
// Note: this repo's schema.prisma emits a TS-native client to
// ../generated/prisma (not the classic @prisma/client default location), and
// requires the same driver-adapter wiring as lib/prisma.ts. Run this script
// with `tsx`, not plain `node` - tsx resolves the .ts client import; plain
// node's CJS loader cannot. Progress is machine-local - a re-run from a
// different box has no memory of a prior run's successes there.
const fs = require("fs")
const path = require("path")
const { PrismaPg } = require("@prisma/adapter-pg")
const { Pool } = require("pg")
const { PrismaClient } = require("./generated/prisma/client")
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const XVM_API_BASE_URL = process.env.XVM_API_BASE_URL
if (!XVM_API_BASE_URL) {
  console.error("XVM_API_BASE_URL is not set")
  process.exit(1)
}

const DRY_RUN = process.argv.includes("--dry-run")
const PROGRESS_FILE = path.join(__dirname, "backfill-venue-profile.progress.json")

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"))
  } catch {
    return {}
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

async function updateVenue(token, xvmApiVenueId, data) {
  const res = await fetch(`${XVM_API_BASE_URL}/venues/${xvmApiVenueId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`updateVenue ${res.status}: ${await res.text()}`)
  return res.json()
}

async function backfill() {
  const venues = await prisma.venue.findMany({
    where: { xvmApiVenueId: { not: null } },
    select: {
      id: true, slug: true, xvmApiVenueId: true,
      name: true, description: true, bannerUrl: true, logoUrl: true,
      district: true, ward: true, plot: true, apartment: true,
      memberships: {
        where: { role: { in: ["OWNER", "MANAGER"] }, status: "active" },
        select: { userId: true },
      },
    },
  })

  console.log(`Found ${venues.length} xvm-api-connected venue(s).`)
  if (DRY_RUN) console.log("--dry-run: no writes will actually happen.\n")

  const progress = loadProgress()
  const results = { migrated: [], skippedAlreadyDone: [], skippedNoToken: [], failures: [] }

  for (const venue of venues) {
    if (progress[venue.id]) {
      results.skippedAlreadyDone.push(venue.slug)
      continue
    }

    let token = null
    for (const m of venue.memberships) {
      const row = await prisma.xvmApiCredential.findUnique({ where: { userId: m.userId } })
      if (row && row.expiresAt.getTime() - Date.now() > 24 * 60 * 60 * 1000) {
        token = row.token
        break
      }
    }
    if (!token) {
      results.skippedNoToken.push(venue.slug)
      continue
    }

    const data = {
      name: venue.name,
      description: venue.description,
      banner_url: venue.bannerUrl,
      logo_url: venue.logoUrl,
      district: venue.district,
      ward: venue.ward,
      plot: venue.plot,
      room: venue.apartment,
    }

    if (DRY_RUN) {
      results.migrated.push(venue.slug)
      continue
    }

    try {
      await updateVenue(token, venue.xvmApiVenueId, data)
      progress[venue.id] = true
      saveProgress(progress)
      results.migrated.push(venue.slug)
    } catch (err) {
      results.failures.push({ slug: venue.slug, error: String(err) })
    }
  }

  console.log("\n=== Backfill report ===")
  console.log(`Migrated: ${results.migrated.length}`, results.migrated)
  console.log(`Already done (skipped): ${results.skippedAlreadyDone.length}`, results.skippedAlreadyDone)
  console.log(`No valid manager token (skipped): ${results.skippedNoToken.length}`, results.skippedNoToken)
  console.log(`Failures: ${results.failures.length}`)
  for (const f of results.failures) console.log(`  ${f.slug}: ${f.error}`)
}

backfill()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Add the progress file to `.gitignore`**

Add `apps/web/backfill-venue-profile.progress.json` to the root `.gitignore`, next to the gallery backfill's entry.

- [ ] **Step 3: Add the script to the eslint ignore list**

In `apps/web/eslint.config.mjs`'s `globalIgnores` array, add `"backfill-venue-profile.js"` next to `backfill-gallery-images.js`, with the same "run via tsx, not node" comment.

- [ ] **Step 4: Dry-run against local dev data**

```bash
cd apps/web && npx tsc --noEmit && npx eslint backfill-venue-profile.js
set -a && source .env.local && set +a && npx tsx backfill-venue-profile.js --dry-run
```

Confirm it reports cleanly (0 or more venues, no crash) for whatever's in the local dev database.

- [ ] **Step 5: Commit**

```bash
git add apps/web/backfill-venue-profile.js apps/web/eslint.config.mjs .gitignore
git commit -m "chore: add one-time venue-profile backfill script for existing venues"
```

- [ ] **Step 6: Do NOT run this for real against the shared dev or prod xvm-api instance as part of this task.** Same rule as the gallery backfill — that's a separate, explicit decision for whoever owns that call, not something to execute automatically while implementing this task.

## Task 5: Re-apply the public venue page's profile-field xvm-api read

**Files:**
- Modify: `apps/web/app/venues/[slug]/page.tsx`

**Only start this task after Tasks 1-4 are committed and live-verified (Task 6 below) — this task re-does the exact migration that was reverted today (xvm-dashboard#49, commit `a8f7084`) because the write side didn't exist yet. Now it does.**

- [ ] **Step 1: Re-read commit `39caa54` on the `feat/gallery-xvm-api-cutover` branch** (the original, premature profile-field migration, before it was reverted by `a8f7084`) to see the exact shape of the change that needs re-applying:

Run: `git show 39caa54 -- apps/web/app/venues/\[slug\]/page.tsx`

- [ ] **Step 2: Re-apply that diff, with one change from the original**

The original set `displayLocation.location` to a hardcoded `null` (since `PublicVenue` had no location field). That's still correct — `location` stays out of scope per this plan's own context section. Re-apply the rest of the original diff as-is: `publicVenue?.name`, `publicVenue?.description`, `publicVenue?.banner_url`, `publicVenue?.district`/`ward`/`plot`/`apartment` (note: `PublicVenue.apartment` in the TS client type maps to whatever field name Task 1-4 settled on returning — confirm against the current `PublicVenue` interface in `lib/api/xvm-api.ts` rather than assuming it still says `apartment`, since xvm-api's own field is `room` and the dashboard's `getPublicVenue` response shape may or may not rename it; read the interface first), `publicVenue.images`.

Also re-apply `generateMetadata`'s migration from that same commit.

- [ ] **Step 3: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit && npx eslint app/venues/\[slug\]/page.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/venues/\[slug\]/page.tsx
git commit -m "feat: re-apply public venue page profile-field xvm-api read, now that writes exist"
```

## Task 6: Live verification

**Files:** none — verification only.

- [ ] **Step 1: Start the local stack**

```bash
docker start xiv-app-postgres-local xiv-app-redis-local
cd apps/web && pnpm dev
```

- [ ] **Step 2: Edit a venue's profile via Settings.** Change name, description, district/ward/plot (as a house) or district/ward/room (as an apartment, via the housing-type toggle), upload a banner, upload a logo. Save.

- [ ] **Step 3: Reload the Settings page.** Confirm every edited field shows the new value (proves the GET-from-xvm-api round-trip works, not just that the form remembered its own local state).

- [ ] **Step 4: Check via xvm-api directly** (`GET /venues/{xvm_api_venue_id}` with a valid manager token) that the values genuinely landed there, not just in the response the dashboard route happened to echo back.

- [ ] **Step 5: Switch the housing type from apartment to house (or vice versa) and save.** Confirm the previously-set room/plot value doesn't leak into the wrong field once switched — the payload should send `null` for whichever one is no longer active, matching the existing `housingType === "house" ? venuePlot : null` / `housingType === "apartment" ? venueApartment : null` logic already in `handleSave`.

- [ ] **Step 6: Once Task 5 is also live, load the public venue page** (`/venues/<slug>`) and confirm name/description/banner/location all render the same values just set in Settings — this is the actual regression Allegro caught, now genuinely fixed rather than reverted.

- [ ] **Step 7: Test the degraded path.** Temporarily point `XVM_API_BASE_URL` at an unreachable address (or use a venue with no `xvmApiVenueId`), reload Settings, confirm profile fields show blank/default rather than a crash, and confirm the public page (Task 5) shows its degraded state (sections omitted) rather than an error page.

## Explicitly out of scope for this plan

- **`location`** (legacy freeform text): no xvm-api equivalent, never actually editable via any current form, stays Prisma-only permanently — not the kind of gap this plan closes.
- **`venue_type`**: already migrated in an earlier session (visibility fields + venue type were the first fields moved to xvm-api in `settings/route.ts`) — not touched by this plan.
- **`data_center`/`world`**: read-only in the current settings form (set once at venue creation via `createVenue`, never edited after), not part of this plan's write-side scope. If they need to become editable later, that's a `createVenue`-adjacent question, not this plan's.
- **Venue deletion** (`DELETE` handler in the same route file): dashboard-local lifecycle action, no xvm-api equivalent needed, untouched.
- **xvm-api's own `apartment` field**: deliberately never written to. If Allegro later clarifies what it's for, that's a follow-up, not a blocker for this plan (this plan's `room` mapping is correct and complete on its own terms regardless of what `apartment` turns out to mean).
