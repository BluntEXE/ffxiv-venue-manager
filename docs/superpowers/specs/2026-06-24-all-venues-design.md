# All Venues Tab — Design Spec
**Date:** 2026-06-24
**Status:** Approved

## Overview

Add a third "All" tab to the mobile Discover screen. Shows every active venue regardless of open/scheduled status, with name search and DC filtering. Open Now and Tonight tabs are unchanged.

## Discover Tab Structure

Three tabs in the existing pill container:

| Tab | Shows | Unchanged? |
|-----|-------|-----------|
| Open Now | Venues with an active shift right now | Yes |
| Tonight | Venues with a shift scheduled today | Yes |
| All | Every active venue, filtered by name/DC | New |

## All Tab — Controls

**Search bar** (top): text input filtering by venue name. Client-side, debounced. Placeholder: "Search venues by name..."

**DC chip row** (below search): horizontally scrollable, single-select. First chip is "All DCs" (default). Remaining chips list all data centres in order: Aether, Crystal, Primal, Dynamis, Chaos, Light, Materia, Elemental, Gaia, Mana, Meteor. Selecting a DC triggers a server fetch filtered by that DC. Active chip uses XIV blue active pill style (same as tab pills).

## Venue Rows

Matches the existing Open Now / Tonight `VenueRow` component exactly:
- 44px icon placeholder (storefront icon)
- Venue name (bold, 14px)
- World · DC (subtext)
- Status line: `Open` badge + staff count if open now; `Tonight` badge + opens-in time if scheduled; "No shifts scheduled" in overlay colour if neither
- Chevron right
- Tap navigates to existing `/venue/[id]` detail screen

## Sort Order

1. Open now (by open-since time, most recent first)
2. Scheduled tonight (by next open time, soonest first)
3. Everything else (alphabetical by name)

Sort is applied server-side.

## API

**New endpoint:** `GET /api/mobile/discover/all`

Query params:
- `dc` (optional): data centre name, e.g. `Crystal`. Omit for all DCs.

Response shape — array of venues:
```ts
{
  id: string
  name: string
  dataCenter: string
  world: string
  location: string | null
  logoUrl: string | null
  staffOnShift?: number       // present if open now
  openSince?: string | null   // present if open now
  nextOpen?: string | null    // present if scheduled tonight
  scheduledEnd?: string | null
}
```

Same shape as existing `/api/mobile/discover/open-now` and `tonight` to allow `VenueRow` reuse.

Implementation: query all `isActive: true` venues, left-join shifts for today. Apply DC filter if provided. Sort open-now first, tonight next, alphabetical last.

## Screens / Files Changed

| File | Change |
|------|--------|
| `apps/mobile/app/(app)/discover.tsx` | Add `all` to `Tab` type; add search input + DC chips when `all` active; fetch from new endpoint |
| `apps/web/app/api/mobile/discover/all/route.ts` | New API route |

No new screens. No new components (reuses `VenueRow`, `VenueSkeleton`, `EmptyState`).

## Behaviour Details

- Pull-to-refresh clears search and refetches
- DC filter change triggers immediate fetch (no debounce needed -- discrete selection)
- Name search debounced 300ms, filters the already-fetched list client-side
- Empty state: "No venues found" with search-outline icon if search+DC yields nothing
- Loading state: 4x `VenueSkeleton` placeholders (same as other tabs)
- Error state: `EmptyState` with cloud-offline icon
