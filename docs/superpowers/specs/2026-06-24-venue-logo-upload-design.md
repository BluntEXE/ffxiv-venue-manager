# Venue Logo Upload — Design Spec
**Date:** 2026-06-24
**Status:** Approved

## Overview

Add a logo upload control to the venue settings page. Venue managers can upload a new image or pick an existing gallery image, crop it to a square, and save it as their venue logo. The logo is displayed in the mobile app's venue rows.

## UI — LogoUpload Component

Located in the venue settings page alongside the existing banner upload section.

**Two-tab interface:**
- **Upload new** — file input (JPEG/PNG/WebP, max 10 MB), same pattern as `BannerUpload`
- **From gallery** — grid of the venue's existing `galleryImages`, click one to select

Both tabs lead into the same crop UI.

**Crop UI:**
- Source image renders inside a fixed-width container
- A fixed square overlay (the crop frame) sits on top with a dimmed surround
- User drags the image underneath to reposition the crop
- Live 44×44px preview updates as the user drags (matches mobile display size)
- "Save" and "Cancel" buttons below

**Saved state:**
- 80×80px square thumbnail shown with a remove button
- Matches the existing `BannerUpload` saved-state pattern

## Image Processing

All processing happens client-side in the browser before upload:

1. Load source image into an `<img>` element (gallery images via `/api/proxy-image?url=` to avoid canvas CORS taint)
2. Track drag offset state to determine crop origin `(x, y)` within the source image
3. On confirm: draw the cropped region onto an offscreen `<canvas>` sized 256×256
4. Export as JPEG at 90% quality (`canvas.toBlob('image/jpeg', 0.9)`)
5. Upload the resulting blob as a new MinIO object via presigned URL from `/api/upload`
6. PATCH `logoUrl` on the venue via `/api/venues/[venueId]`

Output is always 256×256px regardless of source dimensions. No stretching — the crop region is scaled to fill the square.

## API

### New: `GET /api/proxy-image?url=<encoded-url>`

Proxies a MinIO gallery image server-side and returns it with permissive CORS headers so it can be drawn to canvas without tainting it. Only allows URLs that match the configured MinIO public URL + bucket prefix (same validation as gallery route).

### Existing (unchanged):
- `POST /api/upload` — returns presigned upload URL + stored URL
- `PATCH /api/venues/[venueId]` — already accepts `logoUrl` field

## Files

| File | Action |
|------|--------|
| `apps/web/components/logo-upload.tsx` | New component (~150 lines) |
| `apps/web/app/api/proxy-image/route.ts` | New proxy route (~30 lines) |
| `apps/web/app/dashboard/[slug]/settings/page.tsx` | Add `<LogoUpload>` next to banner section, wire up state |

## Behaviour Details

- Drag constraints: image cannot be dragged so that the crop frame extends beyond the image edges
- If source image is smaller than the crop frame in either dimension: scale image up to fit frame before allowing drag (avoids empty/black areas in crop)
- Gallery grid: shows up to 9 images (venue max), 3-column grid, same aspect-ratio thumbnails as the gallery manager
- Removing the logo: PATCH `logoUrl: null`, clears the preview
- Error handling: upload errors shown inline (same pattern as `BannerUpload`)
- The proxy route validates the URL against `MINIO_PUBLIC_URL` + bucket to prevent open proxy abuse
