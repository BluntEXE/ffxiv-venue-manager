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

## Task 5b: Close the compile gap — add a gallery GET and wire the settings page to it

**Added after execution found a real gap Task 5 didn't anticipate:** Task 5's investigation confirmed the settings page's `venue` (and its `galleryImages` field) comes from `GET /api/venues?slug=...`, a Prisma-only route serving many other fields alongside it — so Task 5 correctly made no change there (same reasoning as Task 4). But Task 2 already rewrote the gallery route's POST/DELETE to write exclusively to xvm-api, meaning `Prisma.Venue.galleryImages` is now permanently stale (nothing writes to it anymore) and Task 3 already changed `GalleryManager`'s `initialImages` prop to require `VenueImage[]`, not `string[]`. Left as-is, the settings page (still passing the stale Prisma `string[]`) fails to typecheck and would render actually-wrong data even if it did compile. This task closes that gap with the smallest fix: a `GET` on the gallery route itself, and a dedicated fetch on the settings page to populate `GalleryManager` from it — independent of the Prisma-sourced `venue` object entirely.

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/gallery/route.ts`
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

- [ ] **Step 1: Add a GET handler to the gallery route**

Add this to `apps/web/app/api/venues/[venueId]/gallery/route.ts`, alongside the existing `POST`/`DELETE` (same file, add the import and function — don't touch POST/DELETE):

```typescript
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getVenue, uploadVenueImage, deleteVenueImage } from "@/lib/api/xvm-api"
```

(extends the existing `getValidXvmApiToken, xvmApiErrorResponse` import and the existing `uploadVenueImage, deleteVenueImage` import from `@/lib/api/xvm-api` — add `getVenue` to that second import rather than duplicating the import line)

```typescript
// GET: the venue's current gallery images
export async function GET(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  const gate = await requireXvmVenueId(venueId)
  if (gate.error) return gate.error

  try {
    const detail = await getVenue(token, gate.xvmApiVenueId!)
    return NextResponse.json(detail.images)
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[gallery] GET error")
  }
}
```

No membership-tier check here — reading the gallery doesn't need Manager, any member should see it (matches every other read in this codebase; the write endpoints already enforce Manager server-side via xvm-api).

- [ ] **Step 2: Typecheck and lint the route**

Run: `cd apps/web && npx tsc --noEmit && npx eslint app/api/venues/\[venueId\]/gallery/route.ts`
Expected: no errors.

- [ ] **Step 3: Wire the settings page to fetch from it**

In `apps/web/app/dashboard/[slug]/settings/page.tsx`, find where `venueId` becomes available (it's derived from the Prisma-sourced `venue.id` fetched earlier in the same effect/handler that currently sets `galleryImages` at line 155 — read the surrounding code to find the exact right spot, likely the same `useEffect` or a sibling one that runs once `venueId` is known). Add a fetch to the new endpoint and use its result instead of `venue.galleryImages`:

```typescript
fetch(`/api/venues/${venueId}/gallery`)
  .then((res) => (res.ok ? res.json() : []))
  .then((images: VenueImage[]) => setGalleryImages(images))
  .catch(() => setGalleryImages([]))
```

Import `VenueImage` from `@/lib/api/xvm-api` and change the `galleryImages` state type from `useState<string[]>([])` to `useState<VenueImage[]>([])` (line ~81). Remove the old `setGalleryImages(venue.galleryImages ?? [])` line (~155) — it's now replaced by the new fetch, not supplemented by it (the old Prisma field is stale and must not be used, even as a fallback, since a stale-but-present value is worse than an empty list while loading).

Then fix the two consumers:
- Line ~646: this passes `galleryImages` (as `string[]`) into `LogoUpload`'s `galleryImages` prop — a **different, unrelated** component from `GalleryManager`, discovered during Task 5's investigation. Read what `LogoUpload` actually uses `galleryImages` for (check `apps/web/components/logo-upload.tsx`) before touching this line — if it just needs the list of URLs for some picker UI, pass `galleryImages.map(img => img.image_url)` instead of the raw array; don't guess, read the component first.
- Line ~693: pass the new `VenueImage[]` state directly into `GalleryManager`'s `initialImages` prop (this now matches, since both sides are `VenueImage[]`).

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors, including no more type mismatch between this page and `GalleryManager`'s prop type.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/gallery/route.ts apps/web/app/dashboard/\[slug\]/settings/page.tsx
git commit -m "feat: add gallery GET endpoint and wire settings page to it"
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

## Task 7: Backfill existing venues' galleries into xvm-api

**Added after the final whole-implementation review flagged a real production consequence:** once Tasks 1-5b ship, the settings page's Gallery section reads exclusively from xvm-api (`GET /venues/{venue_id}/images` via the Task 5b route), which starts empty for every venue whose gallery images only ever lived in Prisma's `Venue.galleryImages` (the old `xiv-venues`-bucket URLs). Those images aren't deleted — they're still live on the public venue page (Task 4 correctly left that page Prisma-sourced) — but a venue owner opening Settings after this ships sees an empty gallery for a venue that visibly has photos on its public profile. This task migrates old images into xvm-api once, so the admin view and public view agree again.

**Files:**
- Create: `apps/web/backfill-gallery-images.js`

- [ ] **Step 1: Understand the auth constraint before writing any code**

xvm-api's `POST /venues/{venue_id}/images` requires a person credential with Manager tier at that venue (`deps.require_tier(MembershipTier.Manager)` — confirmed in Task 1's research). This script has no service/bot credential to fall back on, so for each venue it needs a **valid, unexpired xvm-api person token belonging to a Manager-or-above member** — in practice, the token stored for whichever member last signed into the dashboard while their `XvmApiCredential` row was still fresh (see `apps/web/lib/api/xvm-api-store.ts`'s `getValidXvmApiToken`, `REFRESH_MARGIN_MS = 24h`). Not every venue's owner/manager will have one — that's expected and must be handled as a per-venue skip, not a script failure.

- [ ] **Step 2: Write the script**

```javascript
// One-time backfill: migrate existing venues' Prisma-stored gallery image URLs
// (old xiv-venues MinIO bucket) into xvm-api's own image storage. Run once,
// manually, via `node backfill-gallery-images.js` from apps/web. Non-destructive:
// does not touch Prisma's Venue.galleryImages or delete anything from the old
// bucket, so it's safe to inspect results before any later cleanup. Idempotent
// per venue: skips any venue whose xvm-api image count already meets or exceeds
// its Prisma gallery count, so a re-run after a partial failure won't duplicate
// images for venues that already fully migrated.
const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

const XVM_API_BASE_URL = process.env.XVM_API_BASE_URL
if (!XVM_API_BASE_URL) {
  console.error("XVM_API_BASE_URL is not set")
  process.exit(1)
}

async function getVenueImages(token, xvmApiVenueId) {
  const res = await fetch(`${XVM_API_BASE_URL}/venues/${xvmApiVenueId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`getVenue ${res.status}: ${await res.text()}`)
  const detail = await res.json()
  return detail.images
}

async function uploadVenueImage(token, xvmApiVenueId, blob, filename) {
  const form = new FormData()
  form.append("file", blob, filename)
  const res = await fetch(`${XVM_API_BASE_URL}/venues/${xvmApiVenueId}/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`)
  return res.json()
}

async function backfill() {
  const venues = await prisma.venue.findMany({
    where: { xvmApiVenueId: { not: null }, galleryImages: { isEmpty: false } },
    select: { id: true, slug: true, xvmApiVenueId: true, galleryImages: true, memberships: {
      where: { role: { in: ["OWNER", "MANAGER"] }, status: "active" },
      select: { userId: true },
    } },
  })

  console.log(`Found ${venues.length} venue(s) with a Prisma gallery and an xvm-api link.`)

  const results = { migrated: [], skippedNoToken: [], skippedAlreadyDone: [], partialFailures: [] }

  for (const venue of venues) {
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

    let existingCount
    try {
      existingCount = (await getVenueImages(token, venue.xvmApiVenueId)).length
    } catch (err) {
      results.partialFailures.push({ slug: venue.slug, step: "list", error: String(err) })
      continue
    }
    if (existingCount >= venue.galleryImages.length) {
      results.skippedAlreadyDone.push(venue.slug)
      continue
    }

    let migratedCount = 0
    for (const url of venue.galleryImages) {
      try {
        const imgRes = await fetch(url)
        if (!imgRes.ok) throw new Error(`fetch old image ${imgRes.status}`)
        const blob = await imgRes.blob()
        const filename = url.split("/").pop() || "image"
        await uploadVenueImage(token, venue.xvmApiVenueId, blob, filename)
        migratedCount++
      } catch (err) {
        results.partialFailures.push({ slug: venue.slug, step: `upload ${url}`, error: String(err) })
      }
    }
    results.migrated.push({ slug: venue.slug, count: migratedCount, total: venue.galleryImages.length })
  }

  console.log("\n=== Backfill report ===")
  console.log(`Migrated: ${results.migrated.length}`)
  for (const m of results.migrated) console.log(`  ${m.slug}: ${m.count}/${m.total} images`)
  console.log(`Already done (skipped): ${results.skippedAlreadyDone.length}`, results.skippedAlreadyDone)
  console.log(`No valid manager token (skipped): ${results.skippedNoToken.length}`, results.skippedNoToken)
  console.log(`Partial failures: ${results.partialFailures.length}`)
  for (const f of results.partialFailures) console.log(`  ${f.slug} (${f.step}): ${f.error}`)

  await prisma.$disconnect()
}

backfill()
```

Note: this script deliberately does NOT import `uploadVenueImage`/`getVenue` from `lib/api/xvm-api.ts` — that module is written for Next.js's server runtime (relies on `process.env.XVM_API_BASE_URL` being validated the same way, fine, but the existing helpers aren't exported for use by a bare Node CJS script outside the Next build, matching how `clean-pending-owner.js` and `apply-indexes.js` already use `require("@prisma/client")` directly rather than the app's `lib/prisma.ts` wrapper). Duplicating the two small HTTP calls inline keeps this a genuinely standalone, dependency-free ops script consistent with the sibling scripts already in this directory.

- [ ] **Step 3: Confirm the script's ESLint ignore**

This file needs to be added to `apps/web/eslint.config.mjs`'s existing `globalIgnores` list (which already excludes `apply-indexes.js` and `clean-pending-owner.js` as "Standalone CJS ops scripts"). Add `"backfill-gallery-images.js"` to that same array.

Run: `cd apps/web && npx eslint backfill-gallery-images.js` — expect it to report nothing (ignored), confirming the config change took effect.

- [ ] **Step 4: Dry-run against local dev data**

```bash
cd apps/web && node backfill-gallery-images.js
```

Read the report output. Confirm it runs without throwing, and that its counts make sense for whatever venues exist in the local dev database (the same one used for Task 6's live verification — likely 0-1 venues with pre-existing Prisma gallery images, since Task 6's testing used a fresh upload through the new flow, not old data). If local dev has no venues with old-style gallery data, this step still validates the script runs cleanly end-to-end with an empty result set — that's a legitimate pass, not a skip.

- [ ] **Step 5: Commit**

```bash
git add apps/web/backfill-gallery-images.js apps/web/eslint.config.mjs
git commit -m "chore: add one-time gallery backfill script for existing venues"
```

- [ ] **Step 6: Do NOT run this against the shared dev or prod xvm-api instance as part of this task.** Running it for real mutates live data other people (venue owners, other developers) can see — that's a decision for the person running this plan to make explicitly and separately, not something to execute automatically as part of implementing this task. Report back that the script is written, tested locally, and ready — and stop there.

## Explicitly out of scope for this plan

- **Venue Settings** (`app/api/venues/[venueId]/settings/route.ts`) as a whole: roughly half of it (Discord webhooks, Partake team id, Frogge token, ffxivvenues.com sync, shift-bot config, room-manager Discord role ids, tagline/tags/defaultHours/openNights/isAdult) has **no xvm-api equivalent at all** and is dashboard-owned integration config — it's not clear any of that *should* move to xvm-api rather than staying dashboard-side permanently. The task/sales/revenue/event-visibility fields and `venueType` are **already migrated** (this route already proxies those to xvm-api, confirmed reading the current code). What remains unmigrated-but-plausibly-migratable is venue name/description/logo/banner/location fields — but those aren't edited through this route at all; a follow-up research pass needs to find where they *are* edited before a plan can be written for them.
- **Event Templates**: xvm-api's `TemplateRow` doesn't track creator attribution (Prisma's does, via `createdBy`) or per-template timezone override (Prisma's does; xvm-api has only the venue-level timezone). Also, time is represented differently — Prisma stores `defaultStartTime`/`defaultEndTime` as `"HH:MM"` strings, xvm-api stores `default_start_minute_of_day`/`default_duration_minutes` as integers — real conversion logic needed, not a field rename. Before planning this, someone needs to decide whether losing creator attribution and per-template timezone override is acceptable.
- **Services**: not yet researched at all as part of this session — needs the same file-read pass this plan gave Gallery before it can be planned.
- **Auth/session store** (`PrismaAdapter` in `lib/auth.ts`): a materially different, higher-risk piece of work — swapping how user/account records and sessions are persisted, not a venue-domain-data cutover. Needs its own research spike (starting point: the app already exchanges a Discord id for an xvm-api person token on every sign-in via `exchangeToken`/`upsertXvmApiCredential` — worth investigating whether xvm-api's own `Person`/`PersonAccount` tables could become the actual source of truth, making `PrismaAdapter`'s User/Account tables redundant rather than needing a straight swap to a different adapter) before any plan gets written.
- **Patrons/patron-logs/ban-list, Sales/analytics/transactions/payroll, Timeline, Services' inventory sub-routes**: hard-blocked, xvm-api has no router for any of these yet. Not plannable until that API work lands.
- **`plugin/*`, `bot/*`, `cron/*` routes**: separate operational surfaces (the FFXIV plugin's own data, the Discord bot's own data, scheduled report jobs with no bulk-read xvm-api endpoint to replace them) — each needs its own scoping decision about whether migration even makes sense, not a blanket "cut over" the way venue-domain CRUD does.
