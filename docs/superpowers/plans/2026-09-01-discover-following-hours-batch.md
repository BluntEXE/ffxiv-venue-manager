# Discover/Following: swap Prisma hours for xvm-api's batched public read

## Context

`app/discover/page.tsx` and `app/following/page.tsx` currently compute `isOpenNow` from
the local Prisma `scheduleEntries` table via `isVenueOpenNow()`. That table is being
retired as the xvm-api migration completes, and Discover already loads up to 50 venues
per page — calling the existing single-venue `GET /public/venues/{id}/hours` once per
venue would risk tripping the shared 60 req/min/IP budget on one cold page load.

xvm-api PR #41 (merged to `dev` 2026-09-01) added exactly the batched read needed:

```
GET /public/venues/hours?ids=vn_a,vn_b,...
→ { "venues": { "vn_a": { "open_now": {...}, "rules": [...], "upcoming": [...] }, ... } }
```

- Comma-separated ids, deduped before the 50 cap (`PUBLIC_HOURS_BATCH_MAX`).
- Unknown/deactivated ids are omitted from the response (never an error).
- An active venue with no hours is present with empty `rules`.
- Each venue's shape is byte-identical to the single-venue endpoint's body, so the
  existing `xvmHoursToScheduleEntries()` conversion and `open_now.open` handling from
  the venue-detail-page swap (`apps/web/app/venues/[slug]/page.tsx`, PR #38, and
  `apps/web/lib/api/xvm-api.ts:505` `getPublicHours`) apply unchanged, per-venue.

## Reference implementation to copy the pattern from

Read `apps/web/app/venues/[slug]/page.tsx` (around `getPublicHours` usage) and
`apps/web/lib/api/xvm-api.ts:497-513` (`PublicHours` interface, `getPublicHours`)
before writing anything — match their style: non-fatal fallback on fetch failure,
`xvm-api-connected venue only` gating via `venue.xvmApiVenueId`, cached fetch via
`next: { revalidate: 60 }`.

## What to build

### 1. `apps/web/lib/api/xvm-api.ts` — add `getPublicHoursBatch`

Add next to `getPublicHours`:

```ts
export interface PublicHoursBatch {
  venues: Record<string, PublicHours>
}

export async function getPublicHoursBatch(venueIds: string[], days?: number): Promise<PublicHoursBatch> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  if (venueIds.length === 0) return { venues: {} }
  const params = new URLSearchParams({ ids: venueIds.join(",") })
  if (days !== undefined) params.set("days", String(days))
  return xvmFetch<PublicHoursBatch>(`/public/venues/hours?${params}`, { next: { revalidate: 60 } })
}
```

Match the existing `xvmFetch` error-handling convention already used by `getPublicHours`
— don't hand-roll a new fetch path.

### 2. `apps/web/app/discover/page.tsx`

- Collect `venue.xvmApiVenueId` for every fetched venue (`v.xvmApiVenueId`, already on
  the Prisma model per the venue-detail-page swap — confirm the field exists in the
  Prisma schema before assuming it).
- One `getPublicHoursBatch(xvmApiVenueIds)` call for the whole page (wrap in try/catch,
  non-fatal — same fallback style as the venue-detail-page swap: on failure or for an
  unconnected venue, fall back to the existing `isVenueOpenNow({ scheduleEntries, ... })`
  computation).
- Per venue: if `xvmHours.venues[venue.xvmApiVenueId]` exists, `isOpenNow` = `activeEvent !== null || entry.open_now.open` (mirror the venue-detail-page's `ffxivIsNow` OR-chain minus the ffxiv schedule check, which doesn't apply here — check whether Discover cards need `xvmHoursToScheduleEntries` for a hover/detail display or only the boolean; if only the boolean is rendered on the card, skip the conversion entirely and just use `open_now.open`).
- Respect the 50-cap: Discover already caps at `take: 50`, so no additional capping needed — just confirm the batch call's own ids count can't exceed 50 (it won't, by construction).

### 3. `apps/web/app/following/page.tsx`

- Same swap: collect `f.venue.xvmApiVenueId` for every followed venue, ONE
  `getPublicHoursBatch()` call.
- Following is unbounded (no `take` cap) — **must** chunk `venueIds` into groups of 50
  (`PUBLIC_HOURS_BATCH_MAX`) and issue one `getPublicHoursBatch()` call per chunk,
  merging the `venues` maps. Don't skip this — a user following 51+ venues is the whole
  reason this page was flagged as a risk in the first place.

## Out of scope

- Don't touch `app/venues/[slug]/page.tsx` or `app/api/public/venues/route.ts` (separate,
  already handled / unrelated).
- Don't remove the Prisma `scheduleEntries` fallback path — venues not yet connected to
  xvm-api (`xvmApiVenueId` null) still need it.
- Don't change `DiscoverClient` / `FollowingClient` component props unless the `isOpenNow`
  boolean's meaning changes — it shouldn't; only its computation does.

## Verification (required before calling this done)

- `tsc --noEmit` clean.
- `vitest run` clean (add a unit test if `getPublicHoursBatch` has any non-trivial
  chunking/merging logic worth pinning — the Following page's >50 chunk-merge is the
  one piece with real logic; a bug there silently drops venues past the first 50).
- Live check against the running local dev server (`docs/LOCAL_DEV.md`): load
  `/discover` and `/following` with at least one xvm-api-connected venue and confirm
  `isOpenNow` renders correctly and no more than one batch request per 50 venues fires
  (check Network tab / dev server logs, not just visual correctness).
