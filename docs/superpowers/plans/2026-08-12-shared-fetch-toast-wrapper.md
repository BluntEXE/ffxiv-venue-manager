# Shared Fetch/Error Wrapper + Toast Library (Cleanup Roadmap Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw `fetch` + `try/catch` + `alert()`/silent-failure/inline-error-div patterns with one shared `apiFetch()` helper and a real toast library, applied to exactly 4 low-stakes surfaces: `feedback-dialog.tsx`, `banner-upload.tsx`, `logo-upload.tsx`, `venue-follow-button.tsx`.

**Architecture:** `lib/api-fetch.ts` exports `apiFetch<T>(url, init)` — wraps `fetch`, parses the JSON body (success or error) exactly once, and throws a typed `ApiError` with the server's `{ error: string }` message on non-2xx responses or a generic message on network failure. `sonner` is added as the toast library (industry-standard for shadcn/ui-style apps, zero existing toast dependency to conflict with) with a single `<Toaster />` mounted in the root layout. Each of the 4 components swaps its own fetch/catch block for `apiFetch` + `toast.error()`/`toast.success()`, deleting now-redundant local error UI where the toast fully replaces it.

**Tech Stack:** TypeScript, Next.js App Router, React 19, Vitest (node environment — no jsdom, so `apiFetch` gets unit tests; the 4 components get manual QA only, matching this repo's existing test setup).

**Explicitly out of scope (fragile-feature freeze, roadmap ground rule 1):** patron tracking, VIP tracking, ban list, room status board, bar inventory mapping. Do not touch any file under those feature areas even if it also does raw fetch + alert.

---

## Task 0: Confirm current behavior of the 4 target files (no code change)

Read each file fully before starting so the "before" behavior in later tasks is accurate, not assumed:

- `apps/web/components/feedback-dialog.tsx` — POST `/api/feedback`, `alert()` on failure, inline "Thank you!" success state (keep the success state, only replace the `alert()`).
- `apps/web/components/banner-upload.tsx` — 3-step chain (POST `/api/upload` → PUT presigned S3 URL → PATCH `/api/venues/[venueId]`), inline dismissible error `<div>`, no success feedback at all.
- `apps/web/components/logo-upload.tsx` — same 3-step chain plus a canvas-crop step before upload, inline dismissible error `<div>`, no success feedback at all.
- `apps/web/components/venue-follow-button.tsx` — POST/DELETE `/api/venues/[venueId]/follow`, **silently swallows failures** (`if (res.ok) { ...update state... }`, no `else`, no error surfaced at all — this is the worst of the 4, not just missing a toast but missing any failure feedback whatsoever).

All 4 target API routes (`/api/feedback`, `/api/upload`, `/api/venues/[venueId]`, `/api/venues/[venueId]/follow`) already return errors as `NextResponse.json({ error: "..." }, { status: N })` — confirmed by reading each route. `apiFetch` can rely on this shape without a fallback-shape branch.

- [ ] **Step 1: No action needed** — confirmed above so a future reader doesn't re-verify this.

---

## Task 1: Add `sonner` and mount `<Toaster />`

**Files:**

- Modify: `apps/web/package.json` (add dependency)
- Modify: `apps/web/app/layout.tsx:1-98`

- [ ] **Step 1: Install sonner**

```bash
cd ~/xiv-app && pnpm add sonner --filter @xiv-venue-manager/web
```

Expected: `apps/web/package.json` gains a `"sonner": "^X.Y.Z"` line under `dependencies`, `pnpm-lock.yaml` updates.

- [ ] **Step 2: Mount the Toaster in the root layout, themed to match the app's dark palette**

In `apps/web/app/layout.tsx`, add the import:

```typescript
import { Toaster } from "sonner"
```

Add `<Toaster />` as the last child inside `<SessionProvider>`, after `</VenueProvider>` closes (so it renders once, globally, outside any single page's DOM but still inside the session/venue context providers in case a future toast needs auth state):

```tsx
        <SessionProvider>
          <SidebarProvider>
          <VenueProvider>
            {/* Skip Navigation Link for Accessibility */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:ring-2 focus:ring-ring focus:outline-none"
            >
              Skip to main content
            </a>
            <Navbar />
            <main id="main-content">
              {children}
            </main>
          </VenueProvider>
          </SidebarProvider>
        </SessionProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(7,11,20,0.95)",
              border: "1px solid var(--blue-020)",
              color: "var(--foreground)",
            },
          }}
        />
```

`theme="dark"` matches the app's dark-only design (see `--xiv-blue`/`--destructive` tokens in `globals.css`, no light-mode variant used anywhere per [[feedback_dark_theme_tailwind]]). `position="bottom-right"` avoids the navbar and the skip-link.

- [ ] **Step 3: Typecheck**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Manual verify — Toaster renders without crashing**

```bash
cd ~/xiv-app/apps/web && pnpm dev
```

Open any page, open the browser console, run:

```javascript
// paste in devtools console after the page loads with React available via a temporary window hook is overkill —
// instead just proceed to Task 2/3 and verify toasts fire from real component actions.
```

(No standalone toast trigger exists yet — visual confirmation happens naturally in Task 3+'s manual QA. Skip a synthetic trigger here to avoid throwaway code.)

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app && git add apps/web/package.json pnpm-lock.yaml apps/web/app/layout.tsx
git commit -m "feat(web): add sonner toast library, mount Toaster in root layout"
```

---

## Task 2: Build `apiFetch()` with tests

**Files:**

- Create: `apps/web/lib/api-fetch.ts`
- Test: `apps/web/lib/api-fetch.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/lib/api-fetch.test.ts
import { describe, it, expect, vi, afterEach } from "vitest"
import { apiFetch, ApiError } from "./api-fetch"

function mockFetchOnce(response: { ok: boolean; status: number; body?: unknown; text?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      text: async () => response.text ?? (response.body === undefined ? "" : JSON.stringify(response.body)),
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("apiFetch", () => {
  it("returns the parsed JSON body on a 2xx response", async () => {
    mockFetchOnce({ ok: true, status: 200, body: { following: true } })
    const result = await apiFetch<{ following: boolean }>("/api/x")
    expect(result).toEqual({ following: true })
  })

  it("returns undefined for a 2xx response with an empty body", async () => {
    mockFetchOnce({ ok: true, status: 204, text: "" })
    const result = await apiFetch("/api/x")
    expect(result).toBeUndefined()
  })

  it("throws ApiError with the server's error message on a non-2xx JSON response", async () => {
    mockFetchOnce({ ok: false, status: 400, body: { error: "Missing required fields" } })
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      message: "Missing required fields",
      status: 400,
    })
  })

  it("throws ApiError with a generic message when the error response isn't JSON", async () => {
    mockFetchOnce({ ok: false, status: 500, text: "<html>Internal Server Error</html>" })
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      message: "Request failed (500)",
      status: 500,
    })
  })

  it("throws ApiError with status 0 and a network-error message when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      message: "Network error — check your connection and try again.",
      status: 0,
    })
  })

  it("is an instance of ApiError so callers can narrow with instanceof", async () => {
    mockFetchOnce({ ok: false, status: 404, body: { error: "Not found" } })
    try {
      await apiFetch("/api/x")
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/xiv-app/apps/web && npx vitest run lib/api-fetch.test.ts
```

Expected: FAIL — `Cannot find module './api-fetch'` (file doesn't exist yet).

- [ ] **Step 3: Implement `apiFetch`**

```typescript
// apps/web/lib/api-fetch.ts

/**
 * Thrown by apiFetch for both non-2xx HTTP responses and network failures.
 * `status` is 0 for network failures (fetch itself rejected, no response was received).
 */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string") {
    return (body as { error: string }).error
  }
  return `Request failed (${status})`
}

/**
 * Fetch wrapper for JSON APIs. Parses the response body once, throws ApiError
 * on non-2xx responses (using the server's { error } message when present)
 * or on network failure. Returns undefined for empty 2xx bodies (e.g. a
 * presigned-URL PUT with no JSON response).
 */
export async function apiFetch<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch {
    throw new ApiError("Network error — check your connection and try again.", 0)
  }

  const body = await parseBody(res)

  if (!res.ok) {
    throw new ApiError(extractErrorMessage(body, res.status), res.status)
  }

  return body as T
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/xiv-app/apps/web && npx vitest run lib/api-fetch.test.ts
```

Expected: PASS, 6/6.

- [ ] **Step 5: Typecheck**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app && git add apps/web/lib/api-fetch.ts apps/web/lib/api-fetch.test.ts
git commit -m "feat(web): add apiFetch helper with typed ApiError"
```

---

## Task 3: Migrate `venue-follow-button.tsx` — fixes a real silent-failure bug

**Files:**

- Modify: `apps/web/components/venue-follow-button.tsx`

This is the highest-value migration of the 4: today a failed follow/unfollow (expired session, network blip, 404 on a stale venue) shows **zero** feedback — the button just does nothing and `loading` resets. `apiFetch` + `toast.error` gives the user an actual signal for the first time.

- [ ] **Step 1: Replace the fetch call**

Current (`apps/web/components/venue-follow-button.tsx:19-32`):

```typescript
const toggle = async () => {
  setLoading(true)
  try {
    const res = await fetch(`/api/venues/${venueId}/follow`, {
      method: following ? "DELETE" : "POST",
    })
    if (res.ok) {
      setFollowing(!following)
      setCount((c) => (following ? c - 1 : c + 1))
    }
  } finally {
    setLoading(false)
  }
}
```

Replace with:

```typescript
const toggle = async () => {
  setLoading(true)
  try {
    await apiFetch(`/api/venues/${venueId}/follow`, {
      method: following ? "DELETE" : "POST",
    })
    setFollowing(!following)
    setCount((c) => (following ? c - 1 : c + 1))
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : "Couldn't update follow status. Try again.")
  } finally {
    setLoading(false)
  }
}
```

Add the imports at the top of the file:

```typescript
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Manual verify**

```bash
cd ~/xiv-app/apps/web && pnpm dev
```

- Follow a venue you're not following → button flips to "Following", count increments, no toast (success is silent by design — the button state change is the confirmation, matching this button's existing UX).
- Unfollow → button flips back, count decrements.
- Force a failure: open devtools → Network tab → set to "Offline" → click follow → toast appears bottom-right with "Network error — check your connection and try again." → button does **not** flip (state only updates in the `try` block, so a thrown error correctly leaves `following`/`count` untouched).
- Restore network, confirm it works again.

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app && git add apps/web/components/venue-follow-button.tsx
git commit -m "fix(web): surface follow/unfollow failures via toast instead of silently swallowing them"
```

---

## Task 4: Migrate `feedback-dialog.tsx`

**Files:**

- Modify: `apps/web/components/feedback-dialog.tsx`

- [ ] **Step 1: Replace the fetch call and the `alert()`**

Current (`apps/web/components/feedback-dialog.tsx:47-81`):

```typescript
try {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category,
      subject,
      description,
      url: window.location.href,
    }),
  })

  if (!response.ok) {
    throw new Error("Failed to submit feedback")
  }

  // Show success state
  setIsSuccess(true)

  // Reset form after 2 seconds and close dialog
  setTimeout(() => {
    setCategory("")
    setSubject("")
    setDescription("")
    setIsSuccess(false)
    setIsOpen(false)
  }, 2000)
} catch (error) {
  console.error("Error submitting feedback:", error)
  alert("Failed to submit feedback. Please try again.")
} finally {
  setIsSubmitting(false)
}
```

Replace with:

```typescript
try {
  await apiFetch("/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category,
      subject,
      description,
      url: window.location.href,
    }),
  })

  // Show success state
  setIsSuccess(true)

  // Reset form after 2 seconds and close dialog
  setTimeout(() => {
    setCategory("")
    setSubject("")
    setDescription("")
    setIsSuccess(false)
    setIsOpen(false)
  }, 2000)
} catch (error) {
  toast.error(error instanceof ApiError ? error.message : "Failed to submit feedback. Please try again.")
} finally {
  setIsSubmitting(false)
}
```

Add the imports:

```typescript
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
```

The `console.error` is dropped — `ApiError`/network failures are now surfaced to the user directly via toast, and this dialog has no other server-side logging need beyond what `/api/feedback`'s own route already does on its side.

- [ ] **Step 2: Typecheck**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Manual verify**

- Submit valid feedback → inline "Thank you!" success state shows (unchanged), dialog closes after 2s, **no toast** (the inline success state is sufficient, avoid double-signaling).
- Trigger a 400 (e.g. temporarily blank the `category` field validation client-side by inspecting the network tab and resending without `category`, or just check the rate limit) → toast shows the server's actual message (e.g. "Missing required fields: category, subject, description"), not the old generic "Failed to submit feedback."
- Go offline, submit → toast shows "Network error — check your connection and try again."

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app && git add apps/web/components/feedback-dialog.tsx
git commit -m "fix(web): replace feedback-dialog alert() with toast, surface real server error messages"
```

---

## Task 5: Migrate `banner-upload.tsx`

**Files:**

- Modify: `apps/web/components/banner-upload.tsx`

Removes the local `error` state and inline dismissible error `<div>` entirely — the toast fully replaces it, and keeping both would mean the same failure is shown twice in two different UI locations.

- [ ] **Step 1: Replace the fetch chain in `upload()`**

Current (`apps/web/components/banner-upload.tsx:19-49`):

```typescript
const upload = async (file: File) => {
  setError("")
  setUploading(true)
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || "Failed to get upload URL")
    }
    const { uploadUrl, storedUrl } = await res.json()

    const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
    if (!put.ok) throw new Error("Upload failed")

    const patch = await fetch(`/api/venues/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bannerUrl: storedUrl }),
    })
    if (!patch.ok) {
      const d = await patch.json()
      throw new Error(d.error || "Failed to save")
    }

    setUrl(storedUrl)
    onUpdate(storedUrl)
  } catch (e: unknown) {
    setError(e instanceof Error ? e.message : "Upload failed")
  } finally {
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ""
  }
}
```

Replace with:

```typescript
const upload = async (file: File) => {
  setUploading(true)
  try {
    const { uploadUrl, storedUrl } = await apiFetch<{ uploadUrl: string; storedUrl: string }>("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
    })

    await apiFetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })

    await apiFetch(`/api/venues/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bannerUrl: storedUrl }),
    })

    setUrl(storedUrl)
    onUpdate(storedUrl)
    toast.success("Banner updated")
  } catch (e: unknown) {
    toast.error(e instanceof ApiError ? e.message : "Upload failed")
  } finally {
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ""
  }
}
```

Note: the presigned S3 `PUT` returns no JSON body — `apiFetch` already handles that (`parseBody` returns `undefined` on an empty response, and since the `PUT` succeeds with `res.ok`, no error is thrown). No special-casing needed at the call site.

- [ ] **Step 2: Replace the fetch call in `remove()`**

Current (`apps/web/components/banner-upload.tsx:51-65`):

```typescript
const remove = async () => {
  setError("")
  try {
    const patch = await fetch(`/api/venues/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bannerUrl: null }),
    })
    if (!patch.ok) {
      const d = await patch.json()
      throw new Error(d.error || "Failed to remove")
    }
    setUrl(null)
    onUpdate(null)
  } catch (e: unknown) {
    setError(e instanceof Error ? e.message : "Failed to remove")
  }
}
```

Replace with:

```typescript
const remove = async () => {
  try {
    await apiFetch(`/api/venues/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bannerUrl: null }),
    })
    setUrl(null)
    onUpdate(null)
    toast.success("Banner removed")
  } catch (e: unknown) {
    toast.error(e instanceof ApiError ? e.message : "Failed to remove banner")
  }
}
```

- [ ] **Step 3: Delete the now-unused `error` state and its JSX, update imports**

Remove the `const [error, setError] = useState("")` line and the entire `{error && (...)}` block from the JSX (`apps/web/components/banner-upload.tsx:16` and the block currently at lines 69-74). Remove the now-unused `X` import from `lucide-react` if `X` isn't used elsewhere in this file (check — it's only used inside the removed error block).

Add the imports:

```typescript
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
```

- [ ] **Step 4: Typecheck**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit
```

Expected: no new errors, no unused-import warnings.

- [ ] **Step 5: Manual verify**

- Upload a valid banner image → image appears, toast shows "Banner updated."
- Remove it → image clears, toast shows "Banner removed."
- Upload a file the API rejects (if size/type validation exists server-side, or simulate via devtools by editing the request) → toast shows the real server error message.
- Go offline mid-upload → toast shows the network-error message, no crash, `uploading` resets so the button is clickable again.

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app && git add apps/web/components/banner-upload.tsx
git commit -m "refactor(web): migrate banner-upload to apiFetch + toast, drop inline error UI"
```

---

## Task 6: Migrate `logo-upload.tsx`

**Files:**

- Modify: `apps/web/components/logo-upload.tsx`

Same pattern as Task 5, applied to the crop-then-upload flow. `confirmCrop`'s catch also resets `stage` back to `"cropping"` (not `"idle"`) so the user doesn't lose their crop position on a failed save — preserve that behavior exactly, only swap the error surface.

- [ ] **Step 1: Replace the fetch chain in `confirmCrop()`**

Current (`apps/web/components/logo-upload.tsx:138-183`):

```typescript
const confirmCrop = async () => {
  if (!crop) return
  setError("")
  setStage("saving")
  try {
    const canvas = document.createElement("canvas")
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext("2d")!
    const scaleToNatural = crop.imgEl.naturalWidth / crop.renderedW
    const srcX = (FRAME_LEFT - crop.imgX) * scaleToNatural
    const srcY = (FRAME_TOP - crop.imgY) * scaleToNatural
    const srcSize = FRAME_SIZE * scaleToNatural
    ctx.drawImage(crop.imgEl, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/jpeg", 0.9)
    )

    const uploadRes = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "logo.jpg", contentType: "image/jpeg", size: blob.size }),
    })
    if (!uploadRes.ok) {
      const d = await uploadRes.json()
      throw new Error(d.error || "Upload URL failed")
    }
    const { uploadUrl, storedUrl } = await uploadRes.json()

    const put = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } })
    if (!put.ok) throw new Error("Upload failed")

    const patch = await fetch(`/api/venues/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: storedUrl }),
    })
    if (!patch.ok) {
      const d = await patch.json()
      throw new Error(d.error || "Failed to save")
    }

    setSavedUrl(storedUrl)
    onUpdate(storedUrl)
    setStage("idle")
    setCrop(null)
  } catch (e: unknown) {
    setError(e instanceof Error ? e.message : "Failed to save logo")
    setStage("cropping")
  }
}
```

Replace with:

```typescript
const confirmCrop = async () => {
  if (!crop) return
  setStage("saving")
  try {
    const canvas = document.createElement("canvas")
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext("2d")!
    const scaleToNatural = crop.imgEl.naturalWidth / crop.renderedW
    const srcX = (FRAME_LEFT - crop.imgX) * scaleToNatural
    const srcY = (FRAME_TOP - crop.imgY) * scaleToNatural
    const srcSize = FRAME_SIZE * scaleToNatural
    ctx.drawImage(crop.imgEl, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/jpeg", 0.9)
    )

    const { uploadUrl, storedUrl } = await apiFetch<{ uploadUrl: string; storedUrl: string }>("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "logo.jpg", contentType: "image/jpeg", size: blob.size }),
    })

    await apiFetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } })

    await apiFetch(`/api/venues/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: storedUrl }),
    })

    setSavedUrl(storedUrl)
    onUpdate(storedUrl)
    setStage("idle")
    setCrop(null)
    toast.success("Logo updated")
  } catch (e: unknown) {
    toast.error(e instanceof ApiError ? e.message : "Failed to save logo")
    setStage("cropping")
  }
}
```

Note: `Canvas export failed` (the `toBlob` rejection) is a plain `Error`, not an `ApiError` — it correctly falls through to the generic `"Failed to save logo"` toast message via the `instanceof ApiError` check, same as today's `e instanceof Error ? e.message : ...` fallback would have shown a less accurate message. This is an acceptable, pre-existing-shaped fallback, not a regression.

- [ ] **Step 2: Replace the fetch call in `remove()`**

Current (`apps/web/components/logo-upload.tsx:185-199`):

```typescript
const remove = async () => {
  setError("")
  try {
    const patch = await fetch(`/api/venues/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: null }),
    })
    if (!patch.ok) {
      const d = await patch.json()
      throw new Error(d.error || "Failed to remove")
    }
    setSavedUrl(null)
    onUpdate(null)
  } catch (e: unknown) {
    setError(e instanceof Error ? e.message : "Failed to remove")
  }
}
```

Replace with:

```typescript
const remove = async () => {
  try {
    await apiFetch(`/api/venues/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: null }),
    })
    setSavedUrl(null)
    onUpdate(null)
    toast.success("Logo removed")
  } catch (e: unknown) {
    toast.error(e instanceof ApiError ? e.message : "Failed to remove logo")
  }
}
```

- [ ] **Step 3: Delete the now-unused `error` state and its JSX, update `cancelCrop`, update imports**

Remove `const [error, setError] = useState("")` (`apps/web/components/logo-upload.tsx:42`) and the `{error && (...)}` block (currently lines 206-211). Update `cancelCrop` (`apps/web/components/logo-upload.tsx:201`) — it currently calls `setError("")` as part of resetting state:

```typescript
const cancelCrop = () => {
  setStage("idle")
  setCrop(null)
  setError("")
}
```

becomes:

```typescript
const cancelCrop = () => {
  setStage("idle")
  setCrop(null)
}
```

`handleFile` and `loadImage`'s `img.onerror`/`reader.onerror` (lines 63, 69, 72, 77) also call `setError(...)` for pre-upload validation failures (bad file type, oversized file, unreadable file, failed image load) — these aren't API failures, `apiFetch` doesn't cover them. Convert these 4 call sites to `toast.error(...)` too, for consistency (a validation failure deserves the same visible feedback as an API failure, and leaving the old inline-error path only for these 4 would mean two different error UIs coexist in one component):

```typescript
const handleFile = (file: File) => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    toast.error("JPEG, PNG or WebP only")
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    toast.error("Max 10 MB")
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    if (e.target?.result) loadImage(e.target.result as string)
  }
  reader.onerror = () => toast.error("Failed to read file")
  reader.readAsDataURL(file)
}
```

```typescript
const loadImage = useCallback((src: string) => {
  const img = new Image()
  img.onload = () => {
    const scale = Math.max(FRAME_SIZE / img.naturalWidth, FRAME_SIZE / img.naturalHeight)
    const rW = img.naturalWidth * scale
    const rH = img.naturalHeight * scale
    setCrop({
      imgEl: img,
      src,
      renderedW: Math.round(rW),
      renderedH: Math.round(rH),
      imgX: Math.round((CONTAINER_W - rW) / 2),
      imgY: Math.round((CONTAINER_H - rH) / 2),
    })
    setStage("cropping")
  }
  img.onerror = () => toast.error("Failed to load image")
  img.src = src
}, [])
```

And `handleGalleryPick` (currently calls `setError("")` before `loadImage`) simplifies to just calling `loadImage` directly:

```typescript
const handleGalleryPick = (url: string) => {
  loadImage(`/api/proxy-image?url=${encodeURIComponent(url)}`)
}
```

Add the imports:

```typescript
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api-fetch"
```

- [ ] **Step 4: Typecheck**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit
```

Expected: no new errors, no unused-import warnings (double check `X` from `lucide-react` is still used elsewhere in this file — it is, in the "Change"/"Remove" button icons region — unlike banner-upload, don't remove it here).

- [ ] **Step 5: Manual verify**

- Upload → crop → save a valid logo → toast "Logo updated," saved state shows.
- Remove it → toast "Logo removed."
- Try uploading a non-image file (rename a `.txt` to bypass the `accept` filter, or pick one that slips through) → toast "JPEG, PNG or WebP only," no state change.
- Try an oversized file → toast "Max 10 MB."
- Pick from the gallery tab → crop UI loads correctly (this path never touches `apiFetch`, only `confirmCrop` at the end does).
- Cancel mid-crop → returns to idle with no crash (confirms `cancelCrop`'s simplified body still works).
- Force a save failure (offline) → toast shows the network-error message, `stage` returns to `"cropping"` (crop position preserved, not lost).

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app && git add apps/web/components/logo-upload.tsx
git commit -m "refactor(web): migrate logo-upload to apiFetch + toast, drop inline error UI"
```

---

## Task 7: Full regression pass + deploy

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
cd ~/xiv-app/apps/web && npx vitest run
```

Expected: all tests pass, including the new `api-fetch.test.ts` (6 tests) alongside the existing `server-time.test.ts` (10 tests).

- [ ] **Step 2: Full typecheck + build**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit && pnpm build
```

Expected: clean build, no new warnings.

- [ ] **Step 3: Manual QA pass on all 4 surfaces in one sitting**

Re-run every scenario from Tasks 3-6's manual-verify steps back to back (success path + at least one real API-error path + one network-offline path per surface) to catch any interaction between the 4 changes that per-task verification could miss — e.g. confirm two toasts fired in sequence (banner update then logo update on the same settings page) stack correctly instead of overlapping.

- [ ] **Step 4: Push and deploy**

```bash
cd ~/xiv-app && git push origin main
~/bin/deploy-xiv-web.sh --green
```

Expected: smoke test passes (per `deploy-xiv-web.sh`'s existing 13-check suite), green flip completes.

- [ ] **Step 5: Post-deploy spot check on the live domain**

Visit `https://xivvenuemanager.com`, log in, follow/unfollow a real venue, submit real feedback (or cancel before actually submitting if you don't want a real ticket) — confirm toasts render correctly against production data, not just local dev.

---

## Deferred, not in this plan's scope

- The remaining ~131 raw-`fetch` call sites across the rest of the app (staff-table mutations, event forms, shift actions, etc.) — Phase 3 is explicitly scoped to these 4 low-stakes surfaces only per the roadmap's fragile-feature freeze and "start small" intent. A follow-up phase can widen `apiFetch` adoption once this batch has proven itself in production.
- A generic `useMutation`-style hook wrapping `apiFetch` with built-in loading/toast state — the roadmap mentions this as an option ("apiFetch()/mutation hook"), but 4 call sites don't yet show a strong enough repeated shape to justify the abstraction (YAGNI — each of the 4 has a slightly different success side-effect: state flip, dialog close, image swap). Revisit once a 5th+ surface is migrated and the pattern repeats identically.
