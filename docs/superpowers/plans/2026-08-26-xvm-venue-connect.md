# Connect Dashboard Venue to xvm-api Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a venue owner link their dashboard venue to a real xvm-api venue, storing the returned `vn_`-prefixed id, and fix the Rooms proxy routes (merged in PR #7) to use that stored id instead of the dashboard's own local cuid — which never matched anything in xvm-api's database, so every Rooms call 403'd permanently regardless of membership state.

**Architecture:** A new `xvmApiVenueId`/`xvmApiVenueLinkedAt`/`xvmApiVenueLinkedBy` field trio on the `Venue` model, following the exact shape already used twice in this schema for external-system links (`ffxivVenueId`/`ffxivVenueLinkedAt`/`ffxivVenueLinkedBy`, and the now-dead `froggeVenueId`/`froggeConnectedAt`/`froggeConnectedBy`). A new `createVenue(personToken, data)` client method in `lib/api/xvm-api.ts`, matching the existing signature convention. A new owner-only API route that calls it and stores the result, plus a settings-page card to trigger it. The Rooms proxies then look up `venue.xvmApiVenueId` instead of trusting the raw `venueId` URL param, returning a distinct "not connected yet" state when it's null instead of the current confusing 503.

**Tech Stack:** Next.js App Router, Prisma, existing `xvm-api.ts`/`xvm-api-store.ts` client pattern.

**Confirmed xvm-api contract** (`POST /venues`, from xvm-api's merged memberships slice):
```
Auth: person credential (any authenticated person, not venue-scoped — this IS the bootstrap)
Request:  { name: string, slug?: string | null, data_center: string, world: string }
          slug pattern ^[a-z0-9-]+$ if given; omit it to let the server derive + auto-adapt
          on collision (-2, -3, ...); an EXPLICIT slug still 409s on collision, no adapt.
Response 201: { id: string, name: string, slug: string, data_center: string, world: string }
          id is xvm-api's own vn_-prefixed venue id.
409 if an explicit slug collides.
```

---

### Task 1: Add xvm-api link fields to the Venue model

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1:** In the `Venue` model, add (following the exact style of the existing `ffxivVenueId`/`ffxivVenueLinkedAt`/`ffxivVenueLinkedBy` trio in the same model — match its formatting/relation pattern):
```prisma
xvmApiVenueId       String?   @unique
xvmApiVenueLinkedAt DateTime?
xvmApiVenueLinkedBy String?
```
If the existing `ffxivVenue*` trio has a `linkedBy` relation to `User` (check — it might be a plain string userId, or a real relation field), match whichever shape it actually uses, don't guess.

- [ ] **Step 2:** Push to local dev DB. Run: `cd apps/web && pnpm db:push` (ensure `DATABASE_URL`/`DIRECT_URL` are set — copy `.env.local` from the main checkout if this fresh worktree doesn't have one, matching the pattern used in prior worktrees this session).

- [ ] **Step 3:** Regenerate the client: `pnpm exec prisma generate`.

- [ ] **Step 4:** Verify: `cd apps/web && pnpm typecheck` — expect clean (nothing references the new fields yet, so this just confirms the schema itself is valid).

- [ ] **Step 5:** Commit: `git add apps/web/prisma/schema.prisma` then commit message "db: add xvmApiVenueId link fields to Venue model"

---

### Task 2: Add createVenue to the xvm-api client

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts`

- [ ] **Step 1:** Add a `VenueCreate` type and `VenueRow` type matching the confirmed contract exactly:
```ts
interface VenueCreate {
  name: string
  slug?: string | null
  data_center: string
  world: string
}
interface VenueRow {
  id: string
  name: string
  slug: string
  data_center: string
  world: string
}
```

- [ ] **Step 2:** Add `createVenue(personToken: string, data: VenueCreate): Promise<VenueRow>` — `POST /venues`, same bearer-token pattern as `createRoom`/`getMe` etc. already in this file (no venue-scoping in the URL, this endpoint creates the venue). Include the same env-var guard (`if (!process.env.XVM_API_BASE_URL) throw ...`) established for every other function in this file.

- [ ] **Step 3:** Verify: `cd apps/web && pnpm typecheck`.

- [ ] **Step 4:** Commit: `git add apps/web/lib/api/xvm-api.ts` then commit message "api: add createVenue to xvm-api client"

---

### Task 3: Connect-to-xvm-api API route and settings UI

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/xvm-connect/route.ts`
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

- [ ] **Step 1:** Read `apps/web/app/api/venues/[venueId]/settings/route.ts:180-181` for the exact owner-check pattern (`const isOwner = membership.role === "OWNER"` computed from a `prisma.membership.findFirst` lookup) and match it precisely — this is an owner-only action.

- [ ] **Step 2:** Build the route — `POST /api/venues/[venueId]/xvm-connect`:
  - Session check (`getServerSession(authOptions)`), 401 if none.
  - Owner check (Step 1's pattern), 403 "Only the venue owner can connect to xvm-api" if not owner.
  - Fetch the venue (`prisma.venue.findUnique`), 404 if not found. If `venue.xvmApiVenueId` is already set, return 409 "Already connected" rather than silently re-creating a second xvm-api venue.
  - `getValidXvmApiToken(session.user.id)` — 503 if null (same pattern as every other xvm-api-backed route in this codebase).
  - Call `createVenue(token, { name: venue.name, data_center: venue.dataCenter, world: venue.world })` — read the actual `Venue` model's current field names for data center/world (don't assume `dataCenter`/`world` casing, verify against `schema.prisma`) and map them into xvm-api's `data_center`/`world` snake_case request fields. Do NOT pass an explicit `slug` — let xvm-api derive and auto-adapt one, since the dashboard's own slug and xvm-api's slug are independent and forcing them to match isn't required by anything in this plan.
  - On success, update `prisma.venue.update({where: {id: venueId}, data: {xvmApiVenueId: result.id, xvmApiVenueLinkedAt: new Date(), xvmApiVenueLinkedBy: session.user.id}})`, return the result.
  - On any xvm-api failure, use the same `XvmApiError`/`xvmErrorMessage` pattern already established in the Rooms proxy routes (401 → invalidate credential + 503; other status → forward via `xvmErrorMessage(err)` + real status).

- [ ] **Step 3:** In `settings/page.tsx`, find the "Integrations" section (around line 954-969) and the sub-card around line 1213 whose copy ("Room sync, ownership, and Discord posting") is stale leftover from the now-dead Frogge rooms integration (PR #7 already gutted the server-side logic this card was describing) — replace that stale card's copy with a genuine "Connect to xvm-api" card: shows connected/not-connected state (read from the venue data already loaded on this page — check if `xvmApiVenueId` needs adding to whatever query/prop already loads venue settings data), a button calling the new route when not connected, and a simple "Connected" indicator with the linked date when it is. Owner-only visibility, matching how other owner-only settings cards on this page are gated (check the page's existing pattern for hiding owner-only sections from non-owners, don't invent a new one).

- [ ] **Step 4:** Verify: `cd apps/web && pnpm typecheck && pnpm lint`.

- [ ] **Step 5:** Commit: `git add apps/web/app/api/venues/\[venueId\]/xvm-connect apps/web/app/dashboard/\[slug\]/settings/page.tsx` then commit message describing the new route + UI card + the stale-copy cleanup.

---

### Task 4: Fix the Rooms proxies to use the stored xvm-api venue id

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/rooms/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/rooms/[roomId]/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/rooms/[roomId]/status/route.ts`

- [ ] **Step 1:** Read each file's current structure (from PR #7). Each currently does: session check → `getValidXvmApiToken` (503 if null) → destructure `venueId` from URL params → call xvm-api functions directly with that raw `venueId`.

- [ ] **Step 2:** In each, insert a lookup AFTER confirming the session/token but BEFORE calling any xvm-api Rooms function: `const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })`. If `!venue?.xvmApiVenueId`, return a distinct response signaling "not connected yet" — use a clear, specific shape the frontend can distinguish from a real error, e.g. `NextResponse.json({ error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." }, { status: 409 })` (409 rather than 503, since this isn't a transient failure — it's a real, stable state until an owner connects). Then pass `venue.xvmApiVenueId` (not the raw `venueId` param) into every subsequent `listRooms`/`getRoom`/`createRoom`/etc. call in that file.

- [ ] **Step 3:** In `components/rooms-board.tsx` (from PR #4), handle the new `"not_connected"` error shape distinctly from a generic error — show a clear "Ask the venue owner to connect this venue to xvm-api first" message (or similar, matching the file's existing empty/error-state UI style) instead of whatever generic error text it currently shows for any failure.

- [ ] **Step 4:** Verify: `cd apps/web && pnpm typecheck && pnpm --filter web test && pnpm lint`.

- [ ] **Step 5:** Commit: `git add apps/web/app/api/venues/\[venueId\]/rooms apps/web/components/rooms-board.tsx` then commit message describing the fix and the new distinct "not connected" state.

---

### Task 5: Final integration check

- [ ] **Step 1:** Full verification: `cd apps/web && pnpm typecheck && pnpm --filter web test && pnpm lint` — expect clean.

- [ ] **Step 2:** Live check. With xvm-api running locally (per `docs/LOCAL_DEV.md`'s xvm-api section from the earlier token-exchange work) and a real dashboard login: visit venue settings as the owner, click "Connect to xvm-api", confirm it succeeds and the card updates to "Connected". Then visit the venue's Rooms page — confirm it now actually reaches xvm-api instead of hitting the "not connected" state (it may still show a membership-related error if the owner's xvm-api Membership row has some other gap, but the venue-id-mismatch 403 that made this whole plan necessary should be gone — confirm the actual failure mode, if any, is now something NEW and different from the old permanent-403, which would prove the id-mapping fix itself worked even if something else needs follow-up).

- [ ] **Step 3:** Push the branch: `git push -u origin feat/xvm-venue-connect`.
