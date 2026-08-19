# Frogge Integration — Status Breakdown

> For Allegro. Current state of the XIV Venue Manager ↔ FroggeBot integration as of 2026-08-19.

---

## What's Built (Complete)

### Database Schema

| Field | Model | Purpose |
|-------|-------|---------|
| `froggeVenueId` | Venue | Optional link to Frogge's venue entity |
| `froggeRoomId` | Room | Frogge's room ID for bidirectional sync |
| `roomNumber` | Room | Maps plugin room detection to Frogge's room numbering |
| `locked` | Room | Prevents reservations (temporary: events, maintenance) |
| `disabled` | Room | Permanently removes from rotation |
| `lastSyncedAt` | Room | Tracks last sync timestamp |
| `roomManagerRoleIds` | Venue.settings | Array of role IDs allowed to manage rooms from plugin |

### Frogge API Client (`lib/frogge-api.ts`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `getRooms(froggeVenueId)` | `GET /v2/venues/:id/rooms` | Fetch rooms from Frogge |
| `reserveRoom(froggeVenueId, froggeRoomId, durationMinutes)` | `POST .../rooms/:id/reserve` | Reserve a room |
| `releaseRoom(froggeVenueId, froggeRoomId)` | `POST .../rooms/:id/release` | Release a room |
| `postRoomsToDiscord(froggeVenueId)` | `POST .../rooms/post` | Publish room board to Discord |

- Auth via `X-Frogge-Client-Id` / `X-Frogge-Secret` headers
- Local cache fallback: tries Frogge API first, falls back to DB, syncs on success
- **All methods throw errors right now (stubs waiting for v2 API)**

### Plugin API Endpoints (XVM Server → XVM DB)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/plugin/rooms` | GET | Returns rooms with `locked`, `disabled`, `roomNumber` |
| `/api/plugin/rooms/reserve` | POST | Sets `isOccupied=true`, validates `locked`/`disabled` |
| `/api/plugin/rooms/release` | POST | Sets `isOccupied=false` |

- Both mutate endpoints emit SSE `room_status` events for live dashboard sync
- **Neither forwards to Frogge API yet**

### Plugin UI (Dalamud)

| Feature | Trigger |
|---------|---------|
| Duration dropdown (30min–8hr, 12 options) | Player enters correct free room |
| Release button | Player is in occupied room |
| Lock/Unlock toggle | Player is in correct unoccupied room |
| Disable/Enable toggle | Player is in correct unoccupied room |
| Auto-open Rooms tab | Player enters private chamber (room > 0) |
| State-aware chat messages | Window is minimized, player enters room |

**Status colors:** Green = Free, Yellow = Locked, Red = Occupied, Grey = Disabled

### Dashboard UI

| Feature | Description |
|---------|-------------|
| Rooms board | Add/rename/delete rooms, set room numbers, lock/disable toggles |
| Room Manager Roles | Checkboxes to delegate room management to custom roles |
| SSE live sync | Dashboard updates in real-time when plugin mutates rooms |
| Room images | Schema ready (`imageUrl` field), upload UI removed (Frogge handles images) |

### Webhook Receiver (`/api/webhooks/frogge`)

- Standard Webhooks (Svix) HMAC-SHA256 verification
- Handles all 6 event types: `room.created`, `room.updated`, `room.deleted`, `room.reserved`, `room.released`, `room.posted`
- **STUB: logs events only, no DB mutations**

---

## What's Blocked on Frogge v2 API

| Gap | Direction | What Needs to Happen |
|-----|-----------|---------------------|
| Webhook handler | Frogge → XVM | Write DB mutations for all 6 room events |
| Reserve forwarding | Plugin → XVM → Frogge | `POST /api/plugin/rooms/reserve` needs to call `froggeAPI.reserveRoom()` |
| Release forwarding | Plugin → XVM → Frogge | `POST /api/plugin/rooms/release` needs to call `froggeAPI.releaseRoom()` |
| Lock/disable sync | Plugin → XVM → Frogge | PATCH endpoint needs to forward to Frogge |
| Reservation push | Frogge → XVM → Plugin | Webhook `room.reserved` needs to set `isOccupied=true` with `endAt` |
| Auto-reset | Frogge handles | Duration expiry + auto-release is Frogge's responsibility |
| Post to Discord | XVM → Frogge | Button in dashboard needs `froggeAPI.postRoomsToDiscord()` |
| Connection status | XVM dashboard | Show connected/disconnected to Frogge |
| Revoke access | XVM dashboard | Disconnect button |

---

## Architecture Decisions

> Established during call on 2026-08-13. Full transcript: `~/Downloads/Voice/conversation.md`

| Decision | Detail |
|----------|--------|
| Source of truth | Frogge owns rooms (scheduling, duration, auto-reset) |
| Plugin ownership | XVM owns in-game UI (live occupied toggle) |
| Webhooks | Latency optimization — `GET /rooms` is always authoritative |
| Reservation model | `owner_discord_id`, `room_id`, `start_at`, `end_at` (nullable for auto-assign) |
| Max duration | 8 hours, overlap enforcement via SAVEPOINT |
| Room status | Derived, never stored: disabled → locked → current reservation → available |
| Discord posting | XVM sends POST to Frogge API, Frogge Worker handles Discord message edit via outbox |
| Images | Frogge handles room images |

---

## Auth Model

Frogge built Partner Access Tier (`partner_clients` / `partner_grants`).

**Pairing entry point:** `/admin menu → Settings → Integrations → Connect XIV Venue Manager`

---

## Active Test Venue

| Field | Value |
|-------|-------|
| Location | Light · Raiden · Lavender Beds Ward 6 Plot 6 |
| Web venue ID | `cmsu8soi70002oxy5x8l6qdp4` |
| API key | `vm_cMwaMo4QKci3lV27YreJh0U-JIWEI2Rh` |

**Test rooms:**

| Name | Room # | Status |
|------|--------|--------|
| Test Room | 6 | Available |
| Left Wing | 1 | Available |
| Right Wing | 2 | Available |
| Attic | 3 | Locked |
| Back Room | 4 | Disabled |

---

## What Allegro Needs to Build

1. **v2 API endpoints** for rooms (GET/POST/PATCH/DELETE)
2. **Outbound webhook system** (Svix-based, HMAC signing)
3. **Webhook events**: `room.created`, `room.updated`, `room.deleted`, `room.reserved`, `room.released`, `room.posted`
4. **`POST /rooms/post`** endpoint for Discord message publishing
5. **Partner Access Tier** pairing flow (OAuth2 or API key exchange)
6. **Connection status/revoke** endpoints for XVM dashboard

---

## File Inventory

### Web App

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Room model with all Frogge fields |
| `lib/frogge-api.ts` | FroggeAPI client (stubs) |
| `app/api/plugin/rooms/route.ts` | GET rooms for plugin |
| `app/api/plugin/rooms/reserve/route.ts` | Reserve endpoint |
| `app/api/plugin/rooms/release/route.ts` | Release endpoint |
| `app/api/webhooks/frogge/route.ts` | Webhook receiver (stub) |
| `app/api/venues/[venueId]/rooms/[roomId]/route.ts` | PATCH/DELETE room |
| `app/api/venues/[venueId]/rooms/[roomId]/status/route.ts` | Toggle occupied status |
| `app/api/venues/[venueId]/settings/route.ts` | Settings with `roomManagerRoleIds` |
| `components/rooms-board.tsx` | Dashboard rooms UI |
| `components/room-manager-roles.tsx` | Role delegation widget |
| `app/dashboard/[slug]/rooms/page.tsx` | Rooms page |

### Plugin

| File | Purpose |
|------|---------|
| `XIVAppApiModels.cs` | Room, ReserveRoomRequest, ReleaseRoomRequest models |
| `XIVAppVenueApi.cs` | ReserveRoomAsync, ReleaseRoomAsync, UpdateRoomAsync |
| `UI/Tabs/RoomsTab.cs` | Duration dropdown, release/lock/disable buttons, status display |
| `Plugin.cs` | Auto-open Rooms tab on private chamber entry |
| `Windows/MainWindow.cs` | GetRoomStatus for chat messages |

### Git Branches

| Repo | Branch | Status |
|------|--------|--------|
| xiv-app-frogge | `feat/frogge-room-integration` | Active |
| VenueManager | `master` | Active |
