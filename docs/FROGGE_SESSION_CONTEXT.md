# FroggeBot Integration - Session Context

**Date:** 2026-08-19
**Purpose:** Resume context after Frogge's v2 API ships

## Architecture Decisions

- **FroggeAPI owns Rooms** (source of truth); XVM consumes with local cache + fallback
- **Webhooks are latency optimization**, `GET /rooms` is always authoritative
- **Auth model:** Bearer token per venue owner (not partner client/secret). Token stored per-venue in `venues.froggeToken`. Scopes: `rooms:read`, `rooms:write`, `verification:read`
- **Sync mechanism:** Outbound webhooks (Frogge -> XVM) via outbox + Worker sender with HMAC-SHA256 Standard-Webhooks format
- **Plugin architecture:** Plugin -> XVM Server (Next.js) -> FroggeAPI
- **Room status:** Derived, never stored: `disabled -> locked -> current reservation -> available`
- **Reservation model:** `owner_discord_id`, `room_id`, `start_at`, `end_at` (nullable for auto-assign), `duration_minutes` on create; overlap enforcement via SAVEPOINT; 8hr max duration
- **Duration dropdown:** 12 options (30min-8hr); auto-shows when player enters a free room
- **Auto-assign rule:** Refused if someone holds a current reservation; if future booking exists, `end_at` capped
- **Discord posting:** XVM sends POST to Frogge API, Frogge Worker handles Discord message edit via outbox
- **Room number mapping:** Venue manager configures room number per room to match Frogge's `room_number`
- **Plugin detects room via:** `HousingManager->GetCurrentRoom()` - rooms ARE private chambers, not house wings
- **Local cache:** Prisma Room table caches Frogge data; writes require Frogge API connectivity
- **Webhook events to handle:** All 6: `room.created`, `room.updated`, `room.deleted`, `room.reserved`, `room.released`, `room.posted`
- **Plugin polling:** 25-second interval via `ThemeManager.PollGate`
- **Room images:** Schema ready (`imageUrl` field on Room), upload UI removed - Frogge handles images
- **Dashboard room management:** Rooms editable in dashboard (create/edit/delete/configure room number/lock/disable)
- **Auto-open behavior:** Plugin auto-opens Rooms tab when entering a private chamber (room > 0)
- **Room manager roles:** `venue.settings.roomManagerRoleIds` - array of custom role IDs; OWNER/MANAGER always have access
- **State-aware chat messages:** When plugin window minimized and player enters room
- **Offline reservations:** Show error if API unavailable; local queue fallback for later sync
- **Room ordering:** Toggleable views - by room number (numerical) or by status (Available/Occupied/Reserved)
- **Discord posting scope:** Single Discord channel per venue, configured by Venue Owner/Discord Admin
- **Pairing UI:** XVM side: Venue Settings page; Frogge side: admin menu > Settings > Integrations
- **No em-dashes:** User prefers regular dashes

## Frogge API (as of 2026-08-19)

- **Base URL:** Tunnel to Allegro's machine (changes on restart, env-only)
- **Auth:** `Authorization: Bearer <token>` (per-venue, stored in `venues.froggeToken`)
- **Scopes:** `rooms:read`, `rooms:write`, `verification:read`
- **Endpoints:**
  - `GET /plugin-auth/me` - verify token, returns scopes
  - `GET /v2/venues` - list venues (idempotent smoke-test)
  - `GET /v2/venues/:id/rooms` - get rooms
  - `POST /v2/venues/:id/rooms/:roomId/reserve` - reserve (takes `discord_user_id`, `duration_minutes`)
  - `POST /v2/venues/:id/rooms/:roomId/release` - release
  - `POST /v2/venues/:id/rooms/post` - publish to Discord
  - `POST /plugin-auth/redeem` - one-time code redemption for pairing (production)
- **Pairing flow (production):** Owner runs `/admin menu` > Settings > Integrations > gets 8-char code > pastes into XVM > XVM calls `POST /plugin-auth/redeem`
- **Frogge venue has `xvm_venue_id` field** for linking back to XVM (currently null, needs PATCH endpoint from Allegro)
- **Discord IDs are 64-bit** - exceed `Number.MAX_SAFE_INTEGER`, keep as strings everywhere
- **Dev caveats:** URL changes on tunnel restart, data disposable, requires `ngrok-skip-browser-warning: true` header

## Dev Test Venue

- **XVM venue:** `cmsu8soi70002oxy5x8l6qdp4` (Local Test Venue)
- **Frogge venue:** `8c36c08e-1e67-433a-a27f-8607bdfe6941` (The Lilypad Lounge)
- **Token:** stored in `venues.froggeToken`
- **Handshake verified:** `GET /plugin-auth/me` returns `rooms:read`, `rooms:write`, `verification:read`

## Code Conventions

- Git worktree isolation
- `tsc --noEmit` + `prisma generate` + `dotnet build` verification
- No inline WHAT comments, only WHY
- 2-space indent for TS, 4-space for C#
- Prisma migration caveat: Used `prisma db push --accept-data-loss` + manual migration files

## Dev Environment

- **Dev venue:** Light - Raiden - Lavender Beds Ward 6 Plot 6 (`cmsu8soi70002oxy5x8l6qdp4`)
- **Active API key:** stored in the venue's `froggeToken` / shared secrets store — do not commit live keys

## Git State

### Web (xiv-app-frogge)
- **Branch:** `feat/frogge-room-integration` (pushed to GitHub)
- **Remote:** https://github.com/BluntEXE/ffxiv-venue-manager
- **Status:** Pushed, ready for PR when Frogge API is ready

### Plugin (VenueManager)
- **Branch:** `master` (pushed to GitHub)
- **Remote:** https://github.com/BluntEXE/XIVVenueManagerSync
- **Status:** Pushed, all changes on master

## What's Done

### Schema
- `froggeVenueId` on Venue; `froggeRoomId`, `roomNumber`, `locked`, `disabled`, `lastSyncedAt`, `imageUrl` on Room

### Server (Next.js)
- `lib/frogge-api.ts` - FroggeAPI client (stubs)
- `GET /api/plugin/rooms` - rooms for plugin with new fields
- `POST /api/plugin/rooms/reserve` - reserve endpoint
- `POST /api/plugin/rooms/release` - release endpoint
- `PATCH/DELETE /api/venues/[venueId]/rooms/[roomId]` - with custom `roomManagerRoleIds` check
- `POST /api/venues/[venueId]/rooms/[roomId]/status` - toggle occupied
- `PATCH /api/venues/[venueId]/settings` - `roomManagerRoleIds` support
- `POST /api/webhooks/frogge` - webhook receiver (stub, HMAC-SHA256 verification)
- `components/rooms-board.tsx` - dashboard rooms UI (lock/disable toggles, room numbers)
- `components/room-manager-roles.tsx` - role delegation widget
- `app/dashboard/[slug]/rooms/page.tsx` - rooms page with RoomManagerRoles

### Plugin (C#)
- `XIVAppApiModels.cs` - Room, ReserveRoomRequest, ReleaseRoomRequest models
- `XIVAppVenueApi.cs` - ReserveRoomAsync, ReleaseRoomAsync, UpdateRoomAsync
- `UI/Tabs/RoomsTab.cs` - Duration dropdown, release/lock/disable buttons, `GetRoomStatus()`
- `Plugin.cs` - Auto-open Rooms tab, state-aware chat messages
- `Windows/MainWindow.cs` - `Instance` static property, `GetRoomStatus()` delegation

### Docs
- `docs/FROGGE_INTEGRATION_STATUS.md` - full integration status for Allegro

## What's Blocked (Waiting on Frogge v2 API)

1. **Actual Frogge API calls** - `lib/frogge-api.ts` methods throw errors (stubs)
2. **Webhook receiver mutations** - stub logs events only
3. **Dashboard reservation UI** - blocked on Frogge's reservation API
4. **Post to Discord button** - blocked on Frogge's `POST /rooms/post` endpoint
5. **Connection status/revoke** - blocked on Frogge API

## When Frogge's v2 API Lands

1. Share the API docs (URL or paste)
2. I'll wire up actual API calls in `lib/frogge-api.ts`
3. Build webhook receiver mutations for all 6 event types
4. Build dashboard reservation UI
5. Add post-to-Discord button
6. Test end-to-end flow

## Key Files Reference

**Web:**
- `apps/web/prisma/schema.prisma` - Room model
- `apps/web/lib/frogge-api.ts` - API client (stubs)
- `apps/web/app/api/plugin/rooms/route.ts` - GET rooms
- `apps/web/app/api/plugin/rooms/reserve/route.ts` - Reserve
- `apps/web/app/api/plugin/rooms/release/route.ts` - Release
- `apps/web/app/api/venues/[venueId]/rooms/[roomId]/route.ts` - PATCH/DELETE
- `apps/web/app/api/venues/[venueId]/settings/route.ts` - Settings
- `apps/web/app/api/webhooks/frogge/route.ts` - Webhook receiver
- `apps/web/components/rooms-board.tsx` - Dashboard UI
- `apps/web/components/room-manager-roles.tsx` - Role widget
- `apps/web/app/dashboard/[slug]/rooms/page.tsx` - Rooms page

**Plugin:**
- `VenueManager/XIVAppApiModels.cs` - Models
- `VenueManager/XIVAppVenueApi.cs` - API calls
- `VenueManager/UI/Tabs/RoomsTab.cs` - Rooms UI
- `VenueManager/Plugin.cs` - Auto-open + chat
- `VenueManager/Windows/MainWindow.cs` - Window management
