# Plugin Rooms Bridge — Design

## Context

The plugin side of Rooms (auto-detect room entry/exit, reservation dropdown, lock/disable, Discord owner picker) is already fully built on `feat/frogge-integration` in the xvm-plugin-dev repo. It calls a fixed contract of `/api/plugin/rooms/*` routes on xvm-dashboard, and one web-only route it shouldn't be calling. Those routes were stubbed 501 when Rooms migrated to xvm-api (backend fully built, tested, merged on xvm-api `dev`). This is the bridge work to un-stub them.

The plugin's C# DTOs are the fixed contract — this is a translation layer, not a redesign.

## Endpoints

| Route | Plugin caller | Action |
|---|---|---|
| `GET /api/plugin/rooms?venueId=` | `GetRoomsAsync` | Un-stub → `listRooms`, translate shape |
| `POST /api/plugin/rooms/reserve` | `ReserveRoomAsync` | Un-stub → `createReservation`, `source: "plugin_auto"` |
| `POST /api/plugin/rooms/release` | `ReleaseRoomAsync` | Un-stub → `releaseRoom` |
| `POST /api/plugin/rooms/frogge/owner` | `SetRoomOwnerAsync` | **Blocked** — see note below |
| `PATCH /api/venues/[venueId]/rooms/[roomId]` | `UpdateRoomAsync` (lock/disable) | Add plugin API-key auth alongside existing session auth — genuine auth gap, unrelated to the xvm-api stub work. **Also required a `proxy.ts` middleware matcher change** (`api/venues/[^/]+/rooms` added to the exclusion list) — the global session-token gate was redirecting every request to this path to `/auth/signin` before the route's own auth code ever ran, regardless of headers. Verified live: without the change, a valid plugin key still got a 307 redirect; with it, the request reaches the route and the plugin key resolves correctly. |
| `POST /api/plugin/rooms/status` | *(none — dead)* | Skip. Confirmed nothing in the current plugin UI calls it. |

## Auth

Reuse the pipeline the web Rooms page already proves out, no new mechanism:

`pluginAuthGate(request, "read"|"write")` → `auth.userId` → `getValidXvmApiToken(userId)` → xvm-api personToken → same `lib/api/xvm-api.ts` wrapper functions the web routes call. `checkPermission(userId, venueId, "toggle_room")` already exists and allows STAFF — use it for reserve/release/lock/disable; owner-assignment (`frogge/owner`) is OWNER/MANAGER only (matches web dashboard's `canManageVenue` bar for the same action).

For the `PATCH .../rooms/[roomId]` route: check for `x-api-key` header first: if present, run `pluginAuthGate` in place of `getServerSession`; if absent, existing session flow untouched. Same downstream code either way once `userId` is resolved.

## Shape translation (xvm-api `Room` → plugin `Room`)

| Plugin field (fixed) | Source |
|---|---|
| `Id: string` | `xvmRoom.id.toString()` |
| `Name: string` | `xvmRoom.name ?? ""` |
| `Note: string?` | `xvmRoom.notes` |
| `Locked: bool` | `xvmRoom.locked` |
| `Disabled: bool` | `xvmRoom.disabled` |
| `RoomNumber: int` | `xvmRoom.room_number ?? 0` |
| `IsOccupied: bool` | `xvmRoom.status === "occupied"` |

Plugin's `roomId` (string) → parse to `int` before any xvm-api call; reject non-integer with 400, matching `parseRoomId` in the existing `[roomId]` route.

## Reserve semantics

`ReserveRoomRequest { venueId, roomId, durationMinutes }` → `createReservation(token, xvmVenueId, roomId, { start_at: now, end_at: now + durationMinutes, source: "plugin_auto" })`. No `reserved_character_name`/`reserved_person_id` sent — xvm-api's plugin auth doesn't carry a specific in-game character identity through this path yet, only the dashboard user. Left null; revisit if xvm-api needs it for the sweep's "who's in here" reporting later.

## Error handling

Match the existing `[roomId]` route's pattern exactly: `XvmApiError` with `status !== 401` → passthrough that status + `xvmErrorMessage(err)`; anything else (including a stale 401) → `invalidateXvmApiCredential(userId)` + 503 "xvm-api link needs to be refreshed". `venue.xvmApiVenueId` missing → 409 `not_connected` (plugin already has a fallback error string path for this, per `LogTransactionResult.Error`).

## Blocked: frogge/owner

The plugin sends `ownerDiscordId` (raw Discord snowflake, from `FroggeMembersResponse` — already a working Discord-guild-member lookup, unrelated to xvm-api). xvm-api's `Room.owner_membership_id` needs its own numeric membership id, not a Discord id.

Checked `GET /venues/{id}/memberships` — its `MembershipRow.person` schema is only `{id, display_name}`, no `external_id`/`provider` exposed anywhere, even though xvm-api's `Person` model does store `provider`+`external_id` internally (confirmed via PR #14's `exchange_token`, `PersonService.resolve_or_create`). No lookup-by-Discord-id path exists on the current xvm-api surface.

Needs one of, both Allegro's call: expose `external_id`/`provider` on `MembershipPerson` (client-side filter), or a dedicated `GET /venues/{id}/memberships?external_id=` lookup. Deferred — will ask Allegro rather than build a guessed workaround (e.g. an unverified cross-repo query).

## Out of scope

- The `frogge/members` and `frogge/post` routes — already implemented, not stubs, untouched.
- Auto-detect entry/exit logic itself — already built in the plugin, not dashboard-side work.
- Reconciling the `feat/frogge-integration` plugin branch — deliberately deferred until this bridge's actual response shape is verified live (user's call, 2026-08-27).
