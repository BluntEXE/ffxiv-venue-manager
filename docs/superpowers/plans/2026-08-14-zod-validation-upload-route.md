# Zod Validation Registry — Upload Route (Increment 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `app/api/upload/route.ts`'s POST handler onto zod validation, closing two real gaps: a missing `filename` currently crashes the route with an uncaught 500 (`path.extname(undefined)` throws, and this handler has no try/catch at all), and a missing or non-numeric `size` silently bypasses the existing 10MB cap entirely (`undefined > MAX_SIZE` evaluates to `false` in JavaScript, not an error).

**Architecture:** Same pattern as prior increments — a local `z.object({...})` schema, validated with `.parse()` inside a new try/catch. Unlike every prior route in this rollout, this one has **pre-existing, user-facing, exact-text error messages** ("Only JPEG, PNG, WebP and GIF images are allowed.", "Image must be under 10 MB.") that real client components read and display via `lib/api-fetch.ts`'s `apiFetch` (which prefers a `message` field, falls back to `error`). This plan preserves those exact strings — the response shape becomes `{ error: <specific message>, details: error.issues }` (surfacing the first zod issue's own message as the top-level `error`, not the generic "Validation error" text every other route in this rollout uses) so no client-visible wording changes for the two checks that already existed, while still gaining `details` for consistency with the rest of the rollout.

**Tech Stack:** TypeScript, Next.js App Router route handlers, Zod.

**Scope note:** `filename`, `contentType`, `size` are all single-consumer (only this route accepts them as upload metadata) — stays local, no registry additions. `ALLOWED_TYPES` needs an `as const` added (currently a plain `string[]`) so `z.enum(ALLOWED_TYPES)` type-checks — this is a type-level-only change, no functional difference, the array's actual values are untouched.

**Confirmed real callers (checked during planning, 2026-08-14):** `components/banner-upload.tsx:26`, `components/gallery-manager.tsx:25`, `components/logo-upload.tsx:159` — all three always send `filename` as a real string (`file.name` or a literal `"logo.jpg"`), `contentType` as a real MIME string (`file.type` or a literal), and `size` as a real number (`file.size`/`blob.size`). **No legitimate caller is affected by this change** — it closes a gap reachable only by a malformed/malicious direct API call, not by any real UI path.

---

## Task 0: Confirm scope and gaps (no code — read before starting)

**Real gaps confirmed by reading `apps/web/app/api/upload/route.ts` during planning (2026-08-14):**

1. `apps/web/app/api/upload/route.ts:44` — `const { filename, contentType, size } = await req.json()` has zero validation on `filename`. It's used at line 58 as `path.extname(filename)` — if `filename` is `undefined`, `null`, a number, or any non-string, Node's `path.extname()` throws a `TypeError`. This route has **no try/catch anywhere** — the whole handler is a bare `async function`, so that throw becomes an unhandled rejection and Next.js returns its generic framework-level 500, not a clean 400 with a useful message.
2. `apps/web/app/api/upload/route.ts:53` — `if (size > MAX_SIZE)` is the _only_ check on `size`. If `size` is `undefined` (omitted from the request body entirely), `undefined > MAX_SIZE` evaluates to `false` in JavaScript (any comparison against `undefined` is `false`, it's not coerced to `0`) — so the size check silently passes, `ensureBucket()` runs, and a presigned S3 PUT URL is generated and returned with **no upper bound enforced at all**. S3 presigned PUT URLs don't inherently cap the uploaded object's size unless a bucket policy does (this bucket's policy, set in `ensureBucket()` at lines 20-27, only grants public `GetObject` read access — no size-limiting `PutObject` condition). A caller that omits `size` (or sends a negative number, or a string, or `NaN`) can upload an arbitrarily large file through the resulting presigned URL, completely bypassing the "under 10MB" intent.

**`contentType` is already correctly guarded** (`apps/web/app/api/upload/route.ts:50-52`, `ALLOWED_TYPES.includes(contentType)`) — this plan brings it into the zod schema too (for response-shape consistency and to reuse the existing `ALLOWED_TYPES` array as the enum source), but it's not a "real gap" fix on its own, the existing check already works correctly. Per this rollout's established priority rule, the two genuinely broken fields (`filename`, `size`) are the actual justification for this increment.

- [ ] **Step 1: No action needed** — confirmed above.

---

## Task 1: Migrate `app/api/upload/route.ts`

**Files:**

- Modify: `apps/web/app/api/upload/route.ts`

- [ ] **Step 1: Add `as const` to `ALLOWED_TYPES`, add the zod import, define the schema**

Current (`apps/web/app/api/upload/route.ts:1-10`):

```typescript
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { getUploadUrl, BUCKET, s3 } from "@/lib/storage"
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3"
import { randomBytes } from "crypto"
import path from "path"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
```

New:

```typescript
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { getUploadUrl, BUCKET, s3 } from "@/lib/storage"
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3"
import { randomBytes } from "crypto"
import path from "path"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

const uploadSchema = z.object({
  filename: z.string().min(1, "Filename is required.").max(255, "Filename too long."),
  contentType: z.enum(ALLOWED_TYPES, { message: "Only JPEG, PNG, WebP and GIF images are allowed." }),
  size: z.number().positive("Invalid file size.").max(MAX_SIZE, "Image must be under 10 MB."),
})
```

The `as const` on `ALLOWED_TYPES` is purely a TypeScript type-level change (widens the inferred type from `string[]` to a readonly tuple of literal strings) — it does not change the array's runtime values or any existing code that reads from it.

- [ ] **Step 2: Replace the manual checks with the schema, preserving exact error message text**

Current (`apps/web/app/api/upload/route.ts:42-55`):

```typescript
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { filename, contentType, size } = await req.json()

  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP and GIF images are allowed." }, { status: 400 })
  }
  if (size > MAX_SIZE) {
    return NextResponse.json({ error: "Image must be under 10 MB." }, { status: 400 })
  }
```

New:

```typescript
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  let filename: string, contentType: (typeof ALLOWED_TYPES)[number], size: number
  try {
    const parsed = uploadSchema.parse(body)
    filename = parsed.filename
    contentType = parsed.contentType
    size = parsed.size
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request", details: error.issues },
        { status: 400 }
      )
    }
    throw error
  }
```

Note this deliberately does **not** use the `{ error: "Validation error", details: ... }` shape every other route in this rollout uses — it surfaces `error.issues[0]?.message` (the specific zod message, e.g. "Only JPEG, PNG, WebP and GIF images are allowed." or "Image must be under 10 MB.") as the top-level `error` string instead, so the existing client components (`banner-upload.tsx`, `logo-upload.tsx`, `gallery-manager.tsx`) that read and display this field see byte-identical text to before for the two checks that already existed. `details` is still included for consistency/debuggability, just not surfaced as the primary user-facing string.

The rest of the function (`ensureBucket()`, the `path.extname(filename)` call, key generation, `getUploadUrl`, the response) is completely unchanged below this point — it already correctly uses `filename`, `contentType`, `size` as local variables, which now come from the validated `parsed` object instead of the raw destructured body.

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/upload/route.ts
git commit -m "fix(web): validate upload POST body, close filename-crash and size-cap-bypass gaps"
```

---

## Task 2: Full regression pass + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite, typecheck, build**

```bash
cd apps/web && npx vitest run && npx tsc --noEmit && pnpm build
```

- [ ] **Step 2: Manual verification (session-authenticated, use the active browser session from this session's earlier work if still available)**

1. Real regression check: use one of the actual upload surfaces (venue logo upload, banner upload, or gallery image upload in the dashboard settings/gallery pages) to upload a real image — should still succeed exactly as before.
2. Via authenticated `fetch()` in the page (same technique used to verify Increments 4/5 live): POST to `/api/upload` with `filename` omitted entirely → expect 400 with `"Filename is required."`, not a 500.
3. POST with `size` omitted entirely → expect 400 with `"Invalid file size."`, not a silent pass-through (confirm this by checking the response is a 400, not a 200 with an `uploadUrl`).
4. POST with `size: -100` (negative) → expect 400 with `"Invalid file size."`.
5. POST with `size` over 10MB (e.g. `20000000`) → expect 400 with `"Image must be under 10 MB."` (regression check — this one already worked before, confirming the exact message text is preserved).
6. POST with an invalid `contentType` (e.g. `"application/pdf"`) → expect 400 with `"Only JPEG, PNG, WebP and GIF images are allowed."` (regression check, exact message text preserved).

None of these calls create any real uploaded object (the route only returns a presigned URL, it doesn't itself write to S3/MinIO) — no cleanup needed regardless of outcome.

- [ ] **Step 3: Push**

```bash
cd ~/xiv-app && git push origin main
```

Hold on `~/bin/deploy-xiv-web.sh --green` until the user confirms. Reorder in practice as established in prior increments: push → confirm deploy → deploy → THEN run Step 2's manual verification against the now-live code → update the roadmap doc.
