# Mobile Open Shifts — Design Spec
**Date:** 2026-06-24
**Status:** Approved

## Overview

Add an "Open Shifts" section to the Home tab so staff can see and claim available shifts without leaving the app. Section is collapsible with state persisted to AsyncStorage.

## API

### New: `GET /api/mobile/my/open-shifts`

Returns all `OPEN` status shifts across all venues the authenticated user is an active member of, scheduled in the future, ordered by `scheduledStart` ascending.

**Auth:** existing `requireMobileAuth` / `isAuthFailure` guard (same as `/api/mobile/my/shifts`).

**Response shape per shift:**
```ts
{
  id: string
  venueId: string
  venueName: string
  scheduledStart: string   // ISO datetime
  scheduledEnd: string     // ISO datetime
  roleName: string | null  // from shift.role.name if set
}
```

**Existing endpoint reused for claim action:**
`PATCH /api/mobile/operator/venues/[venueId]/shifts/[shiftId]` with body `{ action: "claim" }` -- already implemented, already handles `OPEN → CLAIMED` transition and 409 on race condition.

## Home Screen Section

### Placement

Between "Upcoming Shifts" and "Following" sections.

### Collapse toggle

Section header "Open Shifts" has a chevron icon (down when expanded, up when collapsed). Tap toggles. State persisted to AsyncStorage under key `@xivvm/openShiftsExpanded` (default: `true` -- expanded on first launch).

### Visibility

Section only renders when there is at least one open shift available. Once all shifts on the current list are claimed, the section disappears without a refresh (filtered out client-side).

### Shift rows

Each row shows:
- Scheduled time range (formatted in ST, same as upcoming shifts)
- Venue name
- Role name if set (subtext, same colour as world/DC)
- "Claim" button on the right

### Claim flow

1. Tap "Claim" → button becomes a small spinner, row disabled
2. PATCH `/api/mobile/operator/venues/[venueId]/shifts/[shiftId]` with `{ action: "claim" }`
3. **Success (200):** row updates inline -- Claim button replaced with "Pending" badge (XIV blue, same style as tonight badge). Row stays visible until page refresh.
4. **Race condition (409):** row removed from list (shift was claimed by someone else)
5. **Other error:** inline error text below the row, button re-enabled

### Loading

Open shifts fetched in the same `loadShifts` call as upcoming shifts (parallel `Promise.all`). Uses the same `ShiftSkeleton` placeholder during load.

## Files

| File | Action |
|------|--------|
| `apps/web/app/api/mobile/my/open-shifts/route.ts` | Create |
| `apps/mobile/app/(app)/home.tsx` | Modify — add open shifts state, section render, collapse toggle |
