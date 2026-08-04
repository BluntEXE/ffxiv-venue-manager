# Room Status Board — Design Spec
**Date:** 2026-08-04
**Status:** Approved

## Overview

Third of four features from the original venue-feedback item (VIP and ban list shipped first — see `2026-08-04-vip-patron-tracking-design.md` and `2026-08-04-ban-list-design.md`). Lets staff mark venue rooms as free/occupied from the dashboard or in-game, with an optional note.

Unlike VIP/ban, this feature has no relationship to patron identity — it's a standalone room list per venue. There's no game API to detect actual room occupancy, so this is a manual status board, not automated detection.

## Data Model

New standalone table in `apps/web/prisma/schema.prisma`:

```prisma
model Room {
  id          String   @id @default(cuid())
  venueId     String
  name        String
  isOccupied  Boolean  @default(false)
  note        String?
  updatedAt   DateTime @updatedAt
  updatedById String?

  venue     Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)
  updatedBy User? @relation(fields: [updatedById], references: [id], onDelete: SetNull)

  @@unique([venueId, name])
  @@index([venueId])
  @@map("rooms")
}
```

`updatedAt`/`updatedById` track the last status change (who/when) — no separate history log, same minimalism as VIP/ban's single-snapshot approach.

## Permissions — two distinct tiers

- **Room list management** (add, rename, delete a room): OWNER/MANAGER only. This is venue setup/config, not routine work — matches how Services/venue settings are gated.
- **Status toggling** (free/occupied + note): any active staff member. This is routine, frequent operational work during a live event — matches how patron-visit logging already works (any active member can log), not VIP/ban's moderation-tier restriction. Requires a new `'toggle_room'` action added to `lib/api/plugin-auth.ts`'s `checkPermission` action union, alongside the existing STAFF-inclusive actions (`log_service`, `log_patron`, `log_transaction`, etc.).

## Dashboard

One new page, `/dashboard/[slug]/rooms`, open to all active staff (no OWNER/MANAGER page-level gate, unlike `patron-logs`/`ban-list`).

- Board of rooms: name, free/occupied badge, note, last-updated-by/at.
- Any active staff can toggle status + set/clear the note inline.
- OWNER/MANAGER additionally see add/rename/delete controls on the same page (not a separate settings subpage).
- New sidebar entry under "Operations" (alongside Shifts/Tasks/Services in `venue-sidebar.tsx`), no `roles` restriction on the nav link itself — visibility gating happens on the page/component level per action.

## Live Sync (Dashboard)

Reuses existing SSE infrastructure (`lib/sse/venue-events.ts`'s `venueEventBus`, `/api/stream/[venueId]`, already powering the Live Mode page's real-time patron/sale feed).

- Add `"room_status"` to `VenueEvent`'s `type` union.
- Emit on every status-change write: `{ id: "room_status", type: "room_status", venueId, timestamp, data: { roomId, name, isOccupied, note, updatedByName } }`.
- The Rooms page subscribes via the existing stream route (no route changes needed there — it doesn't filter by type) and updates the affected room in place client-side.
- Rationale: unlike VIP/ban (set-and-forget, refresh-on-load is fine), room status changes multiple times per event and two staff acting on stale data could both claim the same room. Live push closes that gap; it was an explicit design decision, not default behavior copied from elsewhere.

## Plugin (C#/.NET Dalamud)

### New "Rooms" tab

`MainWindow.cs`'s `Tab` enum (currently `Patrons, Sales, History, Shift, Venues, Settings`) gains `Rooms`. New `RoomsTab.cs` (modeled on `GuestsTab.cs`/`SalesTab.cs`'s structure): list of rooms with toggle button + note input per row.

### Polling, not a persistent connection

The dashboard's live-push (SSE) is a browser-only pattern — this plugin has no existing infrastructure for a persistent server connection, and building one would be new architecture for a single feature. Instead: poll `GET /api/plugin/rooms?venueId=` every ~20-30 seconds, **only while the Rooms tab is the currently active/visible tab** in `MainWindow` — not always-on background polling (unnecessary traffic when nobody's looking at it), not cache-once-per-venue-select like VIP/ban (explicitly rejected by the user — rooms need to be visible "at a glance" without a manual reload/reselect).

### Endpoints

- `GET /api/plugin/rooms?venueId=` — API-key auth, read tier, returns `{ rooms: [{ id, name, isOccupied, note }] }`. Same auth pattern as `GET /api/plugin/patrons/vip`.
- A write endpoint for status changes — API-key auth, gated via the new `'toggle_room'` permission (any active staff, NOT restricted to OWNER/MANAGER like ban's write endpoint). Body includes `roomId`, `isOccupied`, `note`.

### C# client additions

- `Room`/`RoomsResponse` models in `XIVAppApiModels.cs`.
- `GetRoomsAsync(venueId)` on `XIVAppVenueApi.cs` (read).
- A `SetRoomStatusAsync(...)` method (write) — likely on `XIVAppVenueApi.cs` since rooms aren't patron-scoped (unlike `BanPatronAsync`, which lives on `XIVAppPatronApi.cs`).

## Out of Scope

- Automated room-occupancy detection (impossible — no game API for it, same ceiling as ban's no-enforcement limitation)
- Add/rename/delete rooms from the plugin (dashboard-only, OWNER/MANAGER, per explicit decision)
- Room-list management for regular staff (view + toggle only)
- Persistent/websocket connection from the plugin (polling instead, by explicit decision)
- Multi-change history log for rooms (single last-updated snapshot only, matching VIP/ban's minimalism)
