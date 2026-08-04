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

`isVip` added to the patron payload returned by `XIVAppPatronApi.cs`'s backing endpoint — the plugin already polls this for guest list data, so no new polling path is needed.

## Surfaces

### 1. Dashboard — `patron-logs` page

VIP toggle and badge added per patron row (`app/dashboard/[slug]/patron-logs/page.tsx`). Only surface where OWNER/MANAGER can set the flag.

### 2. Plugin — live Patrons tab

`UI/Widgets/GuestListWidget.cs` renders each guest row (`player.Value.Name` at line 160). Add a VIP icon/color treatment next to the name when the corresponding patron record has `isVip = true`.

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
| `apps/web/app/api/venues/[venueId]/patrons/[patronId]/vip/route.ts` | Create |
| `apps/web/app/dashboard/[slug]/patron-logs/page.tsx` | Modify — VIP toggle + badge |
| `VenueManager/XIVAppPatronApi.cs` | Modify — include `isVip` in patron payload |
| `VenueManager/UI/Widgets/GuestListWidget.cs` | Modify — VIP badge on guest row |
| `VenueManager/Plugin.cs` | Modify — VIP chat alert in `showGuestEnterChatAlert` |
