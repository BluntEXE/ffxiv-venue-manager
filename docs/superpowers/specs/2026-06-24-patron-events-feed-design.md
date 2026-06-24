# Patron Events Feed — Design Spec
**Date:** 2026-06-24
**Status:** Approved

## Overview

Surface upcoming events to patrons on mobile. Two improvements: a new "Upcoming Events" feed section on the Home tab, and richer event cards on the venue detail screen. All data already exists -- this is purely a mobile presentation improvement.

## Feed Rules

- **Window:** next 7 days from now
- **Cap:** maximum 15 events total
- **One per venue:** only the single next upcoming event per followed venue
- **Sort:** ascending by `startTime` (soonest first)

## Part 1: Home Tab Events Feed

### New API: `GET /api/mobile/my/events-feed`

Auth: `requireMobileAuth` / `isAuthFailure` (same as other my/* routes).

Query: find all PUBLISHED/ACTIVE events starting within 7 days, for venues the user follows, pick the earliest per venue, take 15 total.

Response shape per event:
```ts
{
  id: string
  venueId: string
  venueName: string
  title: string
  startTime: string        // ISO
  endTime: string          // ISO
  eventType: string        // PERFORMANCE | GAME_NIGHT | SPECIAL | SOCIAL | PRIVATE | OTHER
  partakeAttendeeCount: number | null
  attendanceCount: number | null
}
```

### Home screen section

Placement: below Open Shifts, above Following.

Collapsible with chevron toggle, state persisted to SecureStore under key `@xivvm/eventsFeedExpanded` (default: `true`). Fetched in the same `loadShifts` `Promise.all` call.

Each event card shows:
- **Venue name** (subtext, muted)
- **Event title** (bold, 14px)
- **Start time** formatted as `formatST(startTime, 'datetime')` + " ST"
- **Event type badge** -- coloured pill (see badge colours below)
- **Attendee count** if either `partakeAttendeeCount` or `attendanceCount` is set: "{n} attending" in muted text

Tap → `router.push('/venue/[venueId]')`

Section header shows "Upcoming Events". Only renders when `events.length > 0`.

### Event type badge colours

| Type | Background | Text |
|------|-----------|------|
| PERFORMANCE | `rgba(203,166,247,0.15)` | `#cba6f7` (mauve) |
| GAME_NIGHT | `rgba(137,180,250,0.15)` | `#89b4fa` (blue) |
| SPECIAL | `rgba(249,226,175,0.15)` | `#f9e2af` (yellow) |
| SOCIAL | `rgba(166,227,161,0.15)` | `#a6e3a1` (green) |
| PRIVATE | `rgba(108,112,134,0.15)` | `#6c7086` (overlay) |
| OTHER | `rgba(166,173,200,0.15)` | `#a6adc8` (subtext) |

## Part 2: Richer Event Cards on Venue Detail

### API change: add attendee counts to venue detail events select

`apps/web/app/api/mobile/venues/[venueId]/route.ts` — add to events select:
```ts
partakeAttendeeCount: true,
attendanceCount: true,
```

### Venue detail event card improvements

Currently shows: title, start+end time (ST), description (3 lines).

Add:
- **Event type badge** (same colour scheme as above) next to or below the title
- **Attendee count** if set: "X attending" in subtext -- prefer `partakeAttendeeCount` if set, fall back to `attendanceCount`
- **Countdown** for events starting today: "Starts in Xh Ym" calculated from `startTime - now`. Only shown if event starts within 24h.

## Files

| File | Action |
|------|--------|
| `apps/web/app/api/mobile/my/events-feed/route.ts` | Create |
| `apps/web/app/api/mobile/venues/[venueId]/route.ts` | Modify — add attendee fields to events select |
| `apps/mobile/app/(app)/home.tsx` | Modify — add events feed section |
| `apps/mobile/app/venue/[id].tsx` | Modify — richer event cards |

## Attendee count display logic

```
if partakeAttendeeCount != null → show partakeAttendeeCount
else if attendanceCount != null → show attendanceCount  
else → show nothing
```

Partake is preferred as it's live-synced from the registration platform.
