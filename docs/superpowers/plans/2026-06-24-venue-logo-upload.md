# Venue Logo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let venue managers upload and crop a square logo that appears in the mobile app's venue rows.

**Architecture:** A new `LogoUpload` React component handles file selection or gallery pick, renders a drag-to-pan crop UI, crops client-side to 256×256 JPEG via canvas, uploads via existing presigned URL flow, then PATCHes `logoUrl` on the venue. A proxy API route serves gallery images to canvas without CORS issues. The venue PATCH route needs one new field.

**Tech Stack:** Next.js 15 App Router, React, canvas API (no extra libraries), Tailwind, existing `/api/upload` presigned URL flow, MinIO via `lib/storage.ts`.

---

## Files

| File | Action |
|------|--------|
| `apps/web/app/api/venues/[venueId]/route.ts` | Modify — add `logoUrl` to PATCH body handling |
| `apps/web/app/api/proxy-image/route.ts` | Create — server-side image proxy for canvas |
| `apps/web/components/logo-upload.tsx` | Create — the full upload + crop component |
| `apps/web/app/dashboard/[slug]/settings/page.tsx` | Modify — add `<LogoUpload>` below banner section |

---

### Task 1: Add `logoUrl` to venue PATCH route

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/route.ts`

The existing PATCH handler destructures `{ name, description, location, bannerUrl }` from the body but ignores `logoUrl`. Add it.

- [ ] **Step 1: Read the current PATCH handler**

```bash
grep -n "logoUrl\|bannerUrl\|description\|location" apps/web/app/api/venues/\[venueId\]/route.ts
```

- [ ] **Step 2: Add `logoUrl` to destructuring and prisma update**

Find this block in `apps/web/app/api/venues/[venueId]/route.ts`:

```typescript
const { name, description, location, bannerUrl } = body
const updated = await prisma.venue.update({
  where: { id: venueId },
  data: {
    ...(name !== undefined && { name: String(name).trim() }),
    ...(description !== undefined && { description: description ? String(description).trim() : null }),
    ...(location !== undefined && { location: location ? String(location).trim() : null }),
    ...(bannerUrl !== undefined && { bannerUrl: bannerUrl ? String(bannerUrl) : null }),
  },
})
```

Replace with:

```typescript
const { name, description, location, bannerUrl, logoUrl } = body
const updated = await prisma.venue.update({
  where: { id: venueId },
  data: {
    ...(name !== undefined && { name: String(name).trim() }),
    ...(description !== undefined && { description: description ? String(description).trim() : null }),
    ...(location !== undefined && { location: location ? String(location).trim() : null }),
    ...(bannerUrl !== undefined && { bannerUrl: bannerUrl ? String(bannerUrl) : null }),
    ...(logoUrl !== undefined && { logoUrl: logoUrl ? String(logoUrl) : null }),
  },
})
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @xiv-venue-manager/web exec tsc --noEmit 2>&1 | grep -v "node_modules" | head -10
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/\[venueId\]/route.ts
git commit -m "feat(api): support logoUrl in venue PATCH"
```

---

### Task 2: Create proxy-image API route

**Files:**
- Create: `apps/web/app/api/proxy-image/route.ts`

Gallery images live on `media.xivvenuemanager.com`. Drawing cross-origin images to canvas taints it unless the image server returns permissive CORS headers. Rather than rely on MinIO CORS config, proxy through Next.js. Validates the URL against the configured MinIO bucket to prevent open-proxy abuse.

- [ ] **Step 1: Create the route file**

```typescript
// apps/web/app/api/proxy-image/route.ts
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

  const allowedBase = process.env.MINIO_PUBLIC_URL ?? ""
  const bucket = process.env.MINIO_BUCKET ?? "xiv-venues"
  if (!allowedBase || !url.startsWith(`${allowedBase}/${bucket}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const res = await fetch(url)
    if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: 502 })

    const contentType = res.headers.get("content-type") ?? "image/jpeg"
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @xiv-venue-manager/web exec tsc --noEmit 2>&1 | grep -v "node_modules" | head -10
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/proxy-image/route.ts
git commit -m "feat(api): add proxy-image route for canvas-safe gallery images"
```

---

### Task 3: Create LogoUpload component

**Files:**
- Create: `apps/web/components/logo-upload.tsx`

This is the main work. State machine: `idle` → file/gallery picked → `cropping` (drag UI) → `saving` → back to `idle` with saved URL shown. Canvas crop outputs 256×256 JPEG.

**Crop geometry constants (used throughout):**
```
CONTAINER_WIDTH  = 320   // px — crop UI container
CONTAINER_HEIGHT = 220   // px
FRAME_SIZE       = 200   // px — square crop frame (centred in container)
FRAME_LEFT       = 60    // (320 - 200) / 2
FRAME_TOP        = 10    // (220 - 200) / 2
OUTPUT_SIZE      = 256   // px — canvas output
```

- [ ] **Step 1: Create the component file**

```typescript
// apps/web/components/logo-upload.tsx
"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { ImageIcon, Trash2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const CONTAINER_W = 320
const CONTAINER_H = 220
const FRAME_SIZE  = 200
const FRAME_LEFT  = (CONTAINER_W - FRAME_SIZE) / 2  // 60
const FRAME_TOP   = (CONTAINER_H - FRAME_SIZE) / 2  // 10
const OUTPUT_SIZE = 256

interface LogoUploadProps {
  venueId: string
  initialUrl: string | null
  galleryImages: string[]
  onUpdate: (url: string | null) => void
}

type Tab = "upload" | "gallery"
type Stage = "idle" | "cropping" | "saving"

interface CropState {
  imgEl: HTMLImageElement
  renderedW: number
  renderedH: number
  imgX: number
  imgY: number
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

export function LogoUpload({ venueId, initialUrl, galleryImages, onUpdate }: LogoUploadProps) {
  const [savedUrl, setSavedUrl]   = useState<string | null>(initialUrl)
  const [tab, setTab]             = useState<Tab>("upload")
  const [stage, setStage]         = useState<Stage>("idle")
  const [crop, setCrop]           = useState<CropState | null>(null)
  const [error, setError]         = useState("")
  const fileInputRef              = useRef<HTMLInputElement>(null)
  const dragRef                   = useRef<{ startX: number; startY: number; origImgX: number; origImgY: number } | null>(null)

  // ── Load image into crop UI ────────────────────────────────────────────
  const loadImage = useCallback((src: string) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const scale = Math.max(FRAME_SIZE / img.naturalWidth, FRAME_SIZE / img.naturalHeight)
      const rW = img.naturalWidth  * scale
      const rH = img.naturalHeight * scale
      setCrop({
        imgEl:     img,
        renderedW: rW,
        renderedH: rH,
        imgX:      (CONTAINER_W - rW) / 2,
        imgY:      (CONTAINER_H - rH) / 2,
      })
      setStage("cropping")
    }
    img.onerror = () => setError("Failed to load image")
    img.src = src
  }, [])

  const handleFile = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("JPEG, PNG or WebP only"); return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Max 10 MB"); return
    }
    setError("")
    loadImage(URL.createObjectURL(file))
  }

  const handleGalleryPick = (url: string) => {
    setError("")
    loadImage(`/api/proxy-image?url=${encodeURIComponent(url)}`)
  }

  // ── Drag handlers ───────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (!crop) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origImgX: crop.imgX, origImgY: crop.imgY }
  }

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current || !crop) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const minX = FRAME_LEFT + FRAME_SIZE - crop.renderedW
    const maxX = FRAME_LEFT
    const minY = FRAME_TOP  + FRAME_SIZE - crop.renderedH
    const maxY = FRAME_TOP
    setCrop(c => c ? {
      ...c,
      imgX: clamp(dragRef.current!.origImgX + dx, minX, maxX),
      imgY: clamp(dragRef.current!.origImgY + dy, minY, maxY),
    } : c)
  }, [crop])

  const onMouseUp = useCallback(() => { dragRef.current = null }, [])

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup",   onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup",   onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // ── Crop + upload ───────────────────────────────────────────────────────
  const confirmCrop = async () => {
    if (!crop) return
    setError("")
    setStage("saving")
    try {
      const canvas = document.createElement("canvas")
      canvas.width  = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const ctx = canvas.getContext("2d")!
      const scaleToNatural = crop.imgEl.naturalWidth / crop.renderedW
      const srcX    = (FRAME_LEFT - crop.imgX) * scaleToNatural
      const srcY    = (FRAME_TOP  - crop.imgY) * scaleToNatural
      const srcSize = FRAME_SIZE  * scaleToNatural
      ctx.drawImage(crop.imgEl, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("Canvas export failed")), "image/jpeg", 0.9)
      )

      // Get presigned URL
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "logo.jpg", contentType: "image/jpeg", size: blob.size }),
      })
      if (!uploadRes.ok) { const d = await uploadRes.json(); throw new Error(d.error || "Upload URL failed") }
      const { uploadUrl, storedUrl } = await uploadRes.json()

      const put = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } })
      if (!put.ok) throw new Error("Upload failed")

      const patch = await fetch(`/api/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: storedUrl }),
      })
      if (!patch.ok) { const d = await patch.json(); throw new Error(d.error || "Failed to save") }

      setSavedUrl(storedUrl)
      onUpdate(storedUrl)
      setStage("idle")
      setCrop(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save logo")
      setStage("cropping")
    }
  }

  const remove = async () => {
    setError("")
    try {
      const patch = await fetch(`/api/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: null }),
      })
      if (!patch.ok) { const d = await patch.json(); throw new Error(d.error || "Failed to remove") }
      setSavedUrl(null)
      onUpdate(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove")
    }
  }

  const cancelCrop = () => { setStage("idle"); setCrop(null); setError("") }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--destructive-soft)] border border-[rgba(243,139,168,0.2)] text-xs text-[var(--destructive)]">
          <X className="w-3.5 h-3.5 shrink-0 cursor-pointer" onClick={() => setError("")} />
          {error}
        </div>
      )}

      {/* Saved state */}
      {stage === "idle" && savedUrl && (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={savedUrl} alt="Venue logo" className="w-20 h-20 rounded-lg object-cover border border-[var(--blue-015)]" />
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}
              className="h-7 text-xs border-[var(--blue-020)] hover:border-[var(--xiv-blue)]">
              <Upload className="w-3 h-3 mr-1" /> Change
            </Button>
            <Button size="sm" variant="outline" onClick={remove}
              className="h-7 text-xs border-[rgba(243,139,168,0.3)] text-[var(--destructive)] hover:bg-[var(--destructive-soft)]">
              <Trash2 className="w-3 h-3 mr-1" /> Remove
            </Button>
          </div>
        </div>
      )}

      {/* Idle, no logo yet — show tabs */}
      {stage === "idle" && !savedUrl && (
        <div className="space-y-2">
          <div className="flex gap-2 border-b border-[var(--blue-015)] pb-2">
            {(["upload", "gallery"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`text-xs px-3 py-1 rounded-md transition-colors ${tab === t ? "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border border-[rgba(0,180,255,0.3)]" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "upload" ? "Upload image" : "From gallery"}
              </button>
            ))}
          </div>

          {tab === "upload" && (
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full border border-dashed border-[var(--blue-015)] rounded-xl p-5 flex flex-col items-center gap-2 text-muted-foreground hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] transition-colors cursor-pointer">
              <ImageIcon className="w-7 h-7 opacity-40" />
              <span className="text-sm font-medium text-[var(--xiv-blue)]">Upload a logo image</span>
              <p className="text-xs opacity-60">Square images work best · JPEG, PNG or WebP · max 10 MB</p>
            </button>
          )}

          {tab === "gallery" && (
            galleryImages.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No gallery images yet. Upload some in the Gallery section below.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {galleryImages.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" onClick={() => handleGalleryPick(url)}
                    className="w-full aspect-square object-cover rounded-lg border border-[var(--blue-015)] cursor-pointer hover:border-[var(--xiv-blue)] hover:opacity-90 transition-all" />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Crop UI */}
      {stage === "cropping" && crop && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Drag to position. The highlighted square is what will be saved.</p>

          <div className="flex gap-4 items-start">
            {/* Crop container */}
            <div
              className="relative overflow-hidden rounded-lg border border-[var(--blue-015)] cursor-grab active:cursor-grabbing flex-shrink-0"
              style={{ width: CONTAINER_W, height: CONTAINER_H, background: "#070b14" }}
              onMouseDown={onMouseDown}
            >
              {/* Image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={crop.imgEl.src}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  left: crop.imgX,
                  top:  crop.imgY,
                  width:  crop.renderedW,
                  height: crop.renderedH,
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              />
              {/* Dim overlay with square hole */}
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {/* top strip */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: FRAME_TOP, background: "rgba(0,0,0,0.55)" }} />
                {/* bottom strip */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: CONTAINER_H - FRAME_TOP - FRAME_SIZE, background: "rgba(0,0,0,0.55)" }} />
                {/* left strip */}
                <div style={{ position: "absolute", top: FRAME_TOP, left: 0, width: FRAME_LEFT, height: FRAME_SIZE, background: "rgba(0,0,0,0.55)" }} />
                {/* right strip */}
                <div style={{ position: "absolute", top: FRAME_TOP, right: 0, width: FRAME_LEFT, height: FRAME_SIZE, background: "rgba(0,0,0,0.55)" }} />
                {/* frame border */}
                <div style={{ position: "absolute", top: FRAME_TOP, left: FRAME_LEFT, width: FRAME_SIZE, height: FRAME_SIZE, border: "2px solid rgba(0,180,255,0.8)", borderRadius: 4 }} />
              </div>
            </div>

            {/* Live preview */}
            <div className="flex flex-col items-center gap-1">
              <p className="text-xs text-muted-foreground">Preview</p>
              <div className="w-11 h-11 rounded-lg border border-[var(--blue-015)] overflow-hidden bg-[var(--surface1)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={crop.imgEl.src}
                  alt=""
                  style={{
                    width:     crop.renderedW * (44 / FRAME_SIZE),
                    height:    crop.renderedH * (44 / FRAME_SIZE),
                    marginLeft: (crop.imgX - FRAME_LEFT) * (44 / FRAME_SIZE),
                    marginTop:  (crop.imgY - FRAME_TOP)  * (44 / FRAME_SIZE),
                    display: "block",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={confirmCrop}
              className="text-xs bg-[var(--xiv-blue)] text-[#070b14] hover:opacity-90">
              Save logo
            </Button>
            <Button size="sm" variant="outline" onClick={cancelCrop}
              className="text-xs border-[var(--blue-020)]">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {stage === "saving" && (
        <p className="text-xs text-[var(--xiv-blue)] animate-pulse">Saving logo…</p>
      )}

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
        className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @xiv-venue-manager/web exec tsc --noEmit 2>&1 | grep -v "node_modules" | head -10
```

Expected: no errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/logo-upload.tsx
git commit -m "feat(web): add LogoUpload component with drag-to-crop UI"
```

---

### Task 4: Wire LogoUpload into venue settings page + deploy

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

The settings page already has `venueId`, `galleryImages`, and a `bannerUrl`/`setBannerUrl` pattern to follow. Add `logoUrl`/`setLogoUrl` state and render `<LogoUpload>` in the appearance section near the banner.

- [ ] **Step 1: Add import and state**

Find the imports block at the top. Add:

```typescript
import { LogoUpload } from "@/components/logo-upload"
```

Find this state in `DiscoverScreen` (around line 91):

```typescript
const [bannerUrl, setBannerUrl] = useState<string | null>(null)
```

Add below it:

```typescript
const [logoUrl, setLogoUrl] = useState<string | null>(null)
```

Find the data-loading block (around line 122-123):

```typescript
setBannerUrl(venue.bannerUrl ?? null)
```

Add below it:

```typescript
setLogoUrl(venue.logoUrl ?? null)
```

- [ ] **Step 2: Add LogoUpload to the UI**

Find the banner section (around line 323-324):

```tsx
<Label>Banner image</Label>
{venueId && <BannerUpload venueId={venueId} initialUrl={bannerUrl} onUpdate={setBannerUrl} />}
```

Add the logo section directly above it:

```tsx
<Label>Venue logo</Label>
<p className="text-xs text-muted-foreground mb-2">
  Square logo shown next to your venue in the mobile app. Upload or pick from your gallery photos.
</p>
{venueId && (
  <LogoUpload
    venueId={venueId}
    initialUrl={logoUrl}
    galleryImages={galleryImages}
    onUpdate={setLogoUrl}
  />
)}
<div className="my-4 border-t border-[var(--blue-015)]" />
<Label>Banner image</Label>
{venueId && <BannerUpload venueId={venueId} initialUrl={bannerUrl} onUpdate={setBannerUrl} />}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @xiv-venue-manager/web exec tsc --noEmit 2>&1 | grep -v "node_modules" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/\[slug\]/settings/page.tsx
git commit -m "feat(web): add venue logo upload to settings page"
```

- [ ] **Step 5: Deploy to production**

```bash
ssh server@192.168.1.122 "cd ~/xiv-app && git pull && docker compose build venue-manager && docker compose up -d venue-manager"
```

Expected: container restarts, `/dashboard/[slug]/settings` shows logo section above banner.

- [ ] **Step 6: Smoke test**

1. Open a venue's settings page on the web
2. Confirm "Venue logo" section appears above "Banner image"
3. Upload a wide landscape image → crop UI appears → drag to reposition → save → 80×80 preview shown
4. Switch to "From gallery" tab → existing gallery images show in grid → pick one → crop UI appears → save
5. Remove logo → preview clears
6. Open mobile app → All tab → venue row shows logo (or placeholder if none set)
