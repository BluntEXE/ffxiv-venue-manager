# Gallery xvm-api Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move venue gallery images off Prisma's `Venue.galleryImages` string array (backed by the dashboard's own `xiv-venues` MinIO bucket) onto xvm-api's `VenueImageRow`/`VenueDetail.images` (backed by xvm-api's own `xvm-api-media` bucket, with server-side validation and WebP re-encoding).

**Architecture:** xvm-api already has this feature built and live (`POST /venues/{venue_id}/images` takes a multipart file upload, re-encodes and stores it, returns an image row with `id`/`image_url`/`sort_order`; `DELETE /venues/{venue_id}/images/{image_id}` removes one). The dashboard's `lib/api/xvm-api.ts` already has the client functions for this shape on the Rooms domain (`uploadRoomImage`/`deleteRoomImage`, unused so far) — this plan adds the venue-level equivalents and rewires `gallery-manager.tsx` to call them directly instead of going through the dashboard's own presigned-URL-to-MinIO dance. The public read path (`app/venues/[slug]/page.tsx`) and the settings-page gallery list also need to read from the new shape.

**Tech Stack:** Next.js route handlers, `lib/api/xvm-api.ts` (typed fetch client), FormData/multipart upload, existing `xvmApiErrorResponse`/`getValidXvmApiToken` helpers.

---

## Context for the engineer

- Two separate MinIO buckets exist on the same server (`192.168.1.122:9000`): `xiv-venues` (dashboard's own, used today for gallery uploads via `/api/upload`) and `xvm-api-media` (xvm-api's own, already live — confirmed via `docker exec xvm-api-dev env`, `APIV2_MEDIA_BACKEND=minio`, `APIV2_MINIO_BUCKET=xvm-api-media`). This migration moves gallery images from the first bucket to the second.
- xvm-api's image endpoint does real work the dashboard's current path doesn't: it caps uploads at 8 MB (`MAX_UPLOAD_BYTES`), rejects invalid image types with a 400, and **re-encodes to WebP** server-side (`src/api/images.py`, `process_image`). The dashboard's current empty-state copy says "max 10 MB" — that's already wrong today and gets fixed as part of this migration (8 MB, matching the real cap).
- There is no server-side cap on the *number* of images per venue in xvm-api (`VenueImageService.create` just appends). The dashboard's current 9-image UI cap is a client-side-only convention — keep it, since nothing about the new backend changes that intent.
- Auth: xvm-api's endpoints require `MembershipTier.Manager` (`deps.require_tier(MembershipTier.Manager)`), matching the dashboard's existing OWNER/MANAGER-only Prisma check. No behavior change there.
- `VenueImageRow` shape: `{ id: number, image_url: string, sort_order: number }`. This replaces the current `string[]` of bare URLs — every consumer keying off "the image is just a URL" needs to switch to keying off `id` (for delete) and `.image_url` (for display).
- **Gate:** this plan only touches Prisma's `Venue.galleryImages` column and the `/api/venues/[venueId]/gallery` route plus its three UI consumers. It explicitly does **not** touch `Venue.logo_url`/`banner_url`-equivalent fields, venue name/description, or any of the visibility/venueType settings already migrated in `settings/route.ts` — those are a different, not-yet-scoped plan (see the "Explicitly out of scope" section).
- Local dev: local Postgres/Redis via `docker-compose.local.yml` are already running from a prior session (`xiv-app-postgres-local`, `xiv-app-redis-local`); `apps/web/.env.local` already exists with real Discord OAuth creds and `XVM_API_BASE_URL=http://192.168.1.122:8001` (the live dev xvm-api instance, already serving this feature — confirmed via `curl .../openapi.json`). No new setup needed to live-test this plan; just `pnpm dev` from `apps/web`.

## File Structure

- Modify: `apps/web/lib/api/xvm-api.ts` — add `listVenueImages` is unnecessary (images come embedded in `getVenue`'s `VenueDetail.images`); add `uploadVenueImage` and `deleteVenueImage`, mirroring the existing `uploadRoomImage`/`deleteRoomImage` pair.
- Rewrite: `apps/web/app/api/venues/[venueId]/gallery/route.ts` — `POST` becomes a multipart pass-through to xvm-api instead of `{url: string}` JSON; `DELETE` takes an `imageId: number` instead of a `url: string`.
- Modify: `apps/web/components/gallery-manager.tsx` — upload flow drops the presigned-URL/MinIO-PUT dance (three fetches) down to one multipart POST; image list becomes `VenueImageRow[]` instead of `string[]`; delete keys off `id`.
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx` — `galleryImages` state and the fetch that populates it from `/api/venues/[venueId]` (or wherever it currently reads `venue.galleryImages` — trace this at Task 5, the settings GET route wasn't touched by this plan and its current response shape needs checking against whatever this plan's new route returns) change from `string[]` to `VenueImageRow[]`.
- Modify: `apps/web/app/venues/[slug]/page.tsx` — public gallery render maps `.image_url` instead of treating each entry as a bare string.
- Test: no existing test file covers `gallery-manager.tsx` or the gallery route (confirmed via `find . -iname "*gallery*test*"` returning nothing) — this plan adds one focused test file for the route handler's request/response shape, matching the pattern of not adding component-level tests where none exist elsewhere in this codebase for similar client components (`rooms-board.tsx`, `staff-table.tsx` have none either).

## Task 1: xvm-api client — venue image functions

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts`

- [ ] **Step 1: Add the two functions right after the existing `deleteRoomImage` (around line 434), reusing the existing `RoomImage` interface shape by declaring a `VenueImage` alias so call sites read correctly**

```typescript
export interface VenueImage {
  id: number
  image_url: string
  sort_order: number
}

export async function uploadVenueImage(
  personToken: string,
  venueId: string,
  file: File | Blob
): Promise<VenueImage> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const form = new FormData()
  form.append("file", file)
  return xvmFetch<VenueImage>(`/venues/${venueId}/images`, { method: "POST", body: form }, personToken)
}

export async function deleteVenueImage(personToken: string, venueId: string, imageId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/images/${imageId}`, { method: "DELETE" }, personToken)
}
```

- [ ] **Step 2: Typecheck**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts
git commit -m "feat: add xvm-api venue image upload/delete client functions"
```

## Task 2: Rewrite the gallery route

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/gallery/route.ts`
- Test: `apps/web/app/api/venues/[venueId]/gallery/route.test.ts`

- [ ] **Step 1: Check how this repo's existing xvm-api-backed routes are tested, to match the pattern**

Run: `find apps/web/app/api -iname "*.test.ts" | xargs grep -l "xvm-api" | head -3`

Read one of the returned files (e.g. the rooms route's test, if one exists — if `find` returns nothing, check `apps/web/app/api/venues/[venueId]/rooms/route.ts`'s directory for a sibling test file; if truly none exist anywhere in `app/api`, this codebase doesn't unit-test route handlers at this layer and Step 2 below should be skipped — rely on Task 6's live verification instead, and note that in the commit message for this task).

- [ ] **Step 2 (only if a route-testing pattern exists — see Step 1): Write the failing test** for the new POST/DELETE shapes, following whatever pattern Step 1 found (mock `getServerSession`, mock `uploadVenueImage`/`deleteVenueImage`, assert the route passes the multipart `file` through and returns the xvm-api response body verbatim on POST, and that DELETE accepts `imageId: number` not `url: string`).

- [ ] **Step 3: Rewrite the route**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { uploadVenueImage, deleteVenueImage } from "@/lib/api/xvm-api"

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

// POST: upload a new gallery image
export async function POST(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  const gate = await requireXvmVenueId(venueId)
  if (gate.error) return gate.error

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 })
  }

  try {
    const image = await uploadVenueImage(token, gate.xvmApiVenueId!, file)
    await invalidateCache(cacheKeys.userVenues(session.user.id))
    return NextResponse.json(image, { status: 201 })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[gallery] POST error")
  }
}

// DELETE: remove a gallery image by id
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  const gate = await requireXvmVenueId(venueId)
  if (gate.error) return gate.error

  const body = await req.json()
  const imageId = Number(body?.imageId)
  if (!Number.isInteger(imageId)) {
    return NextResponse.json({ error: "imageId required" }, { status: 400 })
  }

  try {
    await deleteVenueImage(token, gate.xvmApiVenueId!, imageId)
    await invalidateCache(cacheKeys.userVenues(session.user.id))
    return NextResponse.json({ success: true })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[gallery] DELETE error")
  }
}
```

Note: this drops the manual OWNER/MANAGER Prisma membership check and the `deleteObject(keyFromUrl(url))` MinIO cleanup entirely — xvm-api's own `deps.require_tier(MembershipTier.Manager)` now enforces the permission, and xvm-api's `remove_venue_image` already deletes the object from its own bucket server-side. Also drops the MinIO-bucket-prefix URL validation (`allowedBase`/`bucket` check) since the upload no longer accepts an arbitrary URL at all — it's a real file upload now, validated server-side by `process_image`.

- [ ] **Step 4 (if Step 2 wrote a test): Run it**

Run: `cd apps/web && npx vitest run app/api/venues/[venueId]/gallery/route.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit && npx eslint app/api/venues/\[venueId\]/gallery/route.ts`
Expected: no errors (existing unrelated warnings elsewhere in the repo are fine, this file should have none).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/gallery/route.ts apps/web/app/api/venues/\[venueId\]/gallery/route.test.ts
git commit -m "feat: rewrite gallery route to proxy xvm-api multipart image upload"
```

## Task 3: Rewrite `gallery-manager.tsx`

**Files:**
- Modify: `apps/web/components/gallery-manager.tsx`

- [ ] **Step 1: Replace the component's props, state, and upload/remove functions**

```typescript
"use client"

import { useState, useRef } from "react"
import { ImageIcon, Trash2, Upload, X } from "lucide-react"
import type { VenueImage } from "@/lib/api/xvm-api"

interface GalleryManagerProps {
  venueId: string
  initialImages: VenueImage[]
}

export function GalleryManager({ venueId, initialImages }: GalleryManagerProps) {
  const [images, setImages] = useState<VenueImage[]>(initialImages)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setError("")
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`/api/venues/${venueId}/gallery`, { method: "POST", body: form })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Upload failed")
      }
      const image: VenueImage = await res.json()
      setImages((prev) => [...prev, image])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const remove = async (imageId: number) => {
    try {
      const res = await fetch(`/api/venues/${venueId}/gallery`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      })
      if (!res.ok) throw new Error("Failed to remove image")
      setImages((prev) => prev.filter((img) => img.id !== imageId))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove")
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--destructive-soft)] border border-[rgba(243,139,168,0.2)] text-sm text-[var(--destructive)]">
          <X className="w-4 h-4 flex-shrink-0" onClick={() => setError("")} style={{ cursor: "pointer" }} />
          {error}
        </div>
      )}

      {images.length > 0 && (
        <div className="gallery">
          {images.map((img) => (
            <div key={img.id} className="gtile group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.image_url} alt="Gallery image" className="absolute inset-0 w-full h-full object-cover" />
              <button
                onClick={() => remove(img.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[rgba(0,0,0,0.7)] border border-[rgba(243,139,168,0.3)] text-[var(--destructive)] p-1.5 rounded-lg hover:bg-[var(--destructive-soft)]"
                title="Remove image"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {images.length < 9 && (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="gtile border-dashed hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] transition-colors cursor-pointer"
            >
              <Upload className="w-6 h-6 text-[var(--fg-faint)]" />
            </button>
          )}
        </div>
      )}

      {images.length === 0 && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full border border-dashed border-[var(--blue-015)] rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] hover:text-foreground transition-colors cursor-pointer"
        >
          <ImageIcon className="w-8 h-8 opacity-40" />
          <div className="text-sm">
            <span className="font-medium text-[var(--xiv-blue)]">Upload photos</span> of your venue
          </div>
          <p className="text-xs opacity-60">JPEG, PNG or WebP · max 8 MB · up to 9 images</p>
        </button>
      )}

      {uploading && <p className="text-xs text-[var(--xiv-blue)] text-center animate-pulse">Uploading…</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload(f)
        }}
      />
    </div>
  )
}
```

Note the copy fix: "max 10 MB" → "max 8 MB", matching xvm-api's real `MAX_UPLOAD_BYTES` cap (the old copy was already wrong before this migration).

- [ ] **Step 2: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit && npx eslint components/gallery-manager.tsx`
Expected: no errors (the pre-existing `no-img-element` warning stays suppressed by the existing eslint-disable comment, same as before).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/gallery-manager.tsx
git commit -m "feat: rewire GalleryManager to upload directly to xvm-api"
```

## Task 4: Update the public venue page's gallery render

**Files:**
- Modify: `apps/web/app/venues/[slug]/page.tsx:300,358,364`

- [ ] **Step 1: Read the current surrounding code to confirm exact context**

Run: `sed -n '290,375p' apps/web/app/venues/\[slug\]/page.tsx`

- [ ] **Step 2: Change the three `venue.galleryImages` references**

This page currently reads `venue.galleryImages` as a `string[]` fetched however this page sources its venue data (trace this — it may come from a different query than the settings page's, since this is the *public* profile page, not the dashboard). If it's still reading straight from Prisma's `Venue.galleryImages` column (likely, since this is a public/SEO-facing page distinct from the authenticated dashboard), **this task is blocked until that page's own data source is itself migrated to call `getVenue`/read `VenueDetail.images`** — which is a bigger change than this plan's stated scope (it may also be reading a dozen other Prisma venue fields for the same page render). Do not force this field alone off Prisma while everything around it on the same page still reads Prisma; that produces a page mixing two data sources for one venue with no consistency guarantee between them.

Resolve this by checking: does `app/venues/[slug]/page.tsx` already call `getVenue` from `xvm-api.ts` for any other field? If yes, add `.images` to that existing call and map `image_url` there. If no (the page is Prisma-only end to end), leave this file's gallery rendering as `venue.galleryImages` (string array) for now, and file this as a known follow-up once the public page itself gets a cutover plan — **do not partially migrate one field of an otherwise-Prisma-sourced page**.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit (only if Step 2 made a change)**

```bash
git add apps/web/app/venues/\[slug\]/page.tsx
git commit -m "feat: read public venue gallery from xvm-api image rows"
```

## Task 5: Update the settings page's gallery consumer

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx:81,155,646,693`

- [ ] **Step 1: Trace where this page's `galleryImages` state gets populated from (line 155)**

Run: `sed -n '140,160p' apps/web/app/dashboard/\[slug\]/settings/page.tsx`

Confirm which fetch call populates `venue.galleryImages` here — likely `GET /api/venues/[venueId]` (the venue-detail route, not `/settings`, which this plan didn't touch). Read that route to see whether it already proxies to xvm-api's `getVenue` (in which case it already has `.images` available and just needs its own response shape updated to expose it) or is Prisma-only (in which case, same rule as Task 4 Step 2: don't cut one field alone off a route that's otherwise Prisma-sourced — note it as a follow-up instead and skip to Step 4 below).

- [ ] **Step 2 (only if that route already sources from xvm-api): Update the type and the two consumers**

Change line 81's state type from `useState<string[]>([])` to `useState<VenueImage[]>([])` (import the `VenueImage` type from `@/lib/api/xvm-api`), update line 155's assignment to match the new field name/shape the route now returns, and update lines 646/693 to pass the new `VenueImage[]` shape into `GalleryManager`'s (now-updated, per Task 3) `initialImages` prop.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit (only if Step 2 made a change; otherwise skip this task entirely and note in the plan's tracking issue that it's blocked on the venue-detail route's own cutover)**

```bash
git add apps/web/app/dashboard/\[slug\]/settings/page.tsx
git commit -m "feat: read settings-page gallery from xvm-api image rows"
```

## Task 6: Live verification

**Files:** none — verification only.

- [ ] **Step 1: Start the local stack**

```bash
docker start xiv-app-postgres-local xiv-app-redis-local  # if not already running
cd apps/web && pnpm dev
```

- [ ] **Step 2: Sign in and navigate to a venue's Settings page** (`/dashboard/<slug>/settings`), scroll to the Gallery section.

- [ ] **Step 3: Upload an image** via the empty-state or add-tile button. Confirm:
  - It appears in the grid immediately (optimistic local state update from the POST response).
  - Open the image's `src` URL directly — it should be under `http://192.168.1.122:9000/xvm-api-media/venues/...`, not `xiv-venues`.
  - The uploaded file is visibly re-encoded (a PNG upload should come back as a `.webp` URL).

- [ ] **Step 4: Delete the image.** Confirm it disappears from the grid and a follow-up page refresh doesn't bring it back (proves the delete actually persisted server-side, not just local state).

- [ ] **Step 5: Try uploading a >8 MB file.** Confirm the UI surfaces an error rather than silently failing or hanging.

- [ ] **Step 6: If Task 4/5 made real changes, check the public venue page** (`/venues/<slug>`) still renders the gallery correctly for a venue with existing images.

## Explicitly out of scope for this plan

- **Venue Settings** (`app/api/venues/[venueId]/settings/route.ts`) as a whole: roughly half of it (Discord webhooks, Partake team id, Frogge token, ffxivvenues.com sync, shift-bot config, room-manager Discord role ids, tagline/tags/defaultHours/openNights/isAdult) has **no xvm-api equivalent at all** and is dashboard-owned integration config — it's not clear any of that *should* move to xvm-api rather than staying dashboard-side permanently. The task/sales/revenue/event-visibility fields and `venueType` are **already migrated** (this route already proxies those to xvm-api, confirmed reading the current code). What remains unmigrated-but-plausibly-migratable is venue name/description/logo/banner/location fields — but those aren't edited through this route at all; a follow-up research pass needs to find where they *are* edited before a plan can be written for them.
- **Event Templates**: xvm-api's `TemplateRow` doesn't track creator attribution (Prisma's does, via `createdBy`) or per-template timezone override (Prisma's does; xvm-api has only the venue-level timezone). Also, time is represented differently — Prisma stores `defaultStartTime`/`defaultEndTime` as `"HH:MM"` strings, xvm-api stores `default_start_minute_of_day`/`default_duration_minutes` as integers — real conversion logic needed, not a field rename. Before planning this, someone needs to decide whether losing creator attribution and per-template timezone override is acceptable.
- **Services**: not yet researched at all as part of this session — needs the same file-read pass this plan gave Gallery before it can be planned.
- **Auth/session store** (`PrismaAdapter` in `lib/auth.ts`): a materially different, higher-risk piece of work — swapping how user/account records and sessions are persisted, not a venue-domain-data cutover. Needs its own research spike (starting point: the app already exchanges a Discord id for an xvm-api person token on every sign-in via `exchangeToken`/`upsertXvmApiCredential` — worth investigating whether xvm-api's own `Person`/`PersonAccount` tables could become the actual source of truth, making `PrismaAdapter`'s User/Account tables redundant rather than needing a straight swap to a different adapter) before any plan gets written.
- **Patrons/patron-logs/ban-list, Sales/analytics/transactions/payroll, Timeline, Services' inventory sub-routes**: hard-blocked, xvm-api has no router for any of these yet. Not plannable until that API work lands.
- **`plugin/*`, `bot/*`, `cron/*` routes**: separate operational surfaces (the FFXIV plugin's own data, the Discord bot's own data, scheduled report jobs with no bulk-read xvm-api endpoint to replace them) — each needs its own scoping decision about whether migration even makes sense, not a blanket "cut over" the way venue-domain CRUD does.
