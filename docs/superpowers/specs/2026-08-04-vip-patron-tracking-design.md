# VIP Patron Tracking — Design Spec
**Date:** 2026-08-04
**Status:** Approved

## Overview

User feedback requested a way to track which patrons are VIP, alongside a ban list, room status board, and bar inventory mapping (four separate feature requests). This spec covers VIP tracking only — the first of the four, picked because it establishes a canonical patron identity that the ban list (next) can reuse.

Today there is no `Patron` entity. Patron identity is a loose `characterName`/`world` string pair scattered across `PatronLog` and `Transaction`. This spec introduces a real `Patron` table and a staff-settable `isVip` flag on it.

Note: an unrelated "VIP" label already exists in analytics (`analytics/route.ts`) — an auto-computed visit-count tier (10+ visits = VIP). That stays separate and unchanged; the naming collision is flagged but not addressed here.

## Data Model

New table in `apps/web/prisma/schema.prisma`:

```prisma
model Patron {
  id            String    @id @default(cuid())
  venueId       String
  characterName String
  world         String
  isVip         Boolean   @default(false)
  vipSetAt      DateTime?
  vipSetById    String?
  createdAt     DateTime  @default(now())

  venue    Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)
  vipSetBy User? @relation(fields: [vipSetById], references: [id])

  @@unique([venueId, characterName, world])
}
```

No reason/note field on the VIP flag — boolean only, by explicit choice.

`vipSetAt`/`vipSetById` provide a lightweight audit trail (who flagged it, when) without a full reason.

### Backfill

`PatronLog` and `Transaction` are unchanged — they keep writing `characterName`/`world` strings as they do today. `Patron` rows are found-or-created by `(venueId, characterName, world)` alongside those existing writes (e.g. on patron entry in the plugin's API call path, or lazily on first `patron-logs` page load). No migration script required; the table grows organically from live traffic.

## Permissions

Setting `isVip` is gated to OWNER/MANAGER, matching the existing reclassification-override permission pattern (`lib/api/plugin-auth.ts:226`, `schema.prisma:497`). Regular staff can see VIP status but not set it.

## API

`PATCH /api/venues/[venueId]/patrons/[patronId]/vip`
- Auth: OWNER/MANAGER membership required
- Body: `{ isVip: boolean }`
- Sets `isVip`, `vipSetAt = now()`, `vipSetById = current user`

**Correction from initial draft:** the plugin does NOT already poll a patron-data endpoint — `XIVAppPatronApi.cs` is write-only (POST visits/services/transactions). The in-game guest list is built from local game-state scanning (`GuestList.cs`), not fetched from the server. A new read endpoint is required.

New endpoint: `GET /api/plugin/patrons/vip?venueId=` (API-key auth via `x-api-key` header + `validateApiKey`, same pattern as `GET /api/plugin/roles`). Returns the list of `{ characterName, world }` pairs flagged VIP for the venue.

**Fetch lifecycle — cache-once, matching `xivAppRoles`/`availableServices`:** fetched alongside roles/services in `AutoLoadXivAppDataAsync` (startup hydration) and `LoadVenueDataWithFeedbackAsync` (manual venue reselect in Settings tab), cached in a new `Plugin.xivAppVipPatrons` field. Not polled live — a VIP flag set on the dashboard won't show in-game until next venue reselect or plugin restart, same staleness window roles/services already have.

## Surfaces

### 1. Dashboard — `patron-logs` page, Patron Profiles tab

`components/patron-profiles-table.tsx` already has a `patronTag()` helper and a "VIPs" tab/badge — but it's auto-computed from visit count (10+ visits = VIP), unrelated to staff judgment. Per user decision, this table doesn't meaningfully use that auto tier today, so it gets **replaced**: `patronTag()`'s vip case switches from `visits >= 10` to `patron.isVip`, and the VIP toggle lives directly on this table. The separate auto-VIP tier used in venue analytics (`analytics/route.ts`, `dashboard/[slug]/analytics/page.tsx`) is untouched — different page, different question, out of scope here.

### 2. Plugin — live Patrons tab

`UI/Widgets/GuestListWidget.cs` renders each guest row (`player.Value.Name` at line 160). Add a VIP icon/color treatment next to the name when `(player.Value.Name, player.Value.WorldName)` matches an entry in `plugin.xivAppVipPatrons`.

### 3. Plugin — entry chat alert

`Plugin.cs:1199` (`showGuestEnterChatAlert`) gets a distinct colored line for VIP entries, e.g. "★ VIP {name} has entered {venue}". This respects the existing `Configuration.showAlerts`/snooze settings exactly like regular entry alerts — no bypass, no forced sound.

## Out of Scope (v1)

- Standalone patron detail page (no existing page to build on; deferred until there's a clearer need)
- VIP reason/note field
- Sound-alert bypass or snooze-bypass for VIP entries
- Unifying with the existing analytics auto-computed "VIP" visit tier
- Ban list, room status board, bar inventory mapping (separate features from the same feedback item, to be spec'd individually)

## Files

| File | Action |
|------|--------|
| `apps/web/prisma/schema.prisma` | Modify — add `Patron` model |
| `apps/web/app/api/venues/[venueId]/patrons/[patronId]/vip/route.ts` | Create — dashboard toggle endpoint |
| `apps/web/app/api/plugin/patrons/vip/route.ts` | Create — plugin read endpoint |
| `apps/web/app/dashboard/[slug]/patron-logs/page.tsx` | Modify — upsert/fetch `Patron` rows for profiles tab |
| `apps/web/components/patron-profiles-table.tsx` | Modify — `isVip`-driven tag/tab + toggle control |
| `VenueManager/XIVAppVenueApi.cs` | Modify — add `GetVipPatronsAsync(venueId)` |
| `VenueManager/XIVAppApiModels.cs` | Modify — add `VipPatron`/`VipPatronsResponse` models |
| `VenueManager/Plugin.cs` | Modify — cache `xivAppVipPatrons`, fetch in `AutoLoadXivAppDataAsync`, VIP chat alert in `showGuestEnterChatAlert` |
| `VenueManager/UI/Tabs/SettingsTab.cs` | Modify — fetch in `LoadVenueDataWithFeedbackAsync` |
| `VenueManager/UI/Widgets/GuestListWidget.cs` | Modify — VIP badge on guest row |
