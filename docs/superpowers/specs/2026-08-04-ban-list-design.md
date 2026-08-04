# Ban List — Design Spec
**Date:** 2026-08-04
**Status:** Approved

## Overview

Second of four features from the original user feedback (VIP, ban list, room status board, bar inventory mapping — see `2026-08-04-vip-patron-tracking-design.md` for the first). Lets OWNER/MANAGER staff mark a patron as banned, with a required reason, from either the dashboard or in-game. Surfaces the ban as a warning badge + chat alert in the plugin, same restrained treatment as the VIP feature.

**Hard constraint:** the plugin cannot actually block, eject, or otherwise prevent a banned patron from entering a venue — FFXIV housing gives Dalamud plugins no such API. This feature is informational only: it warns staff, it does not enforce anything. That's a ceiling on scope, not a design choice.

This feature builds directly on the `Patron` table shipped with VIP tracking — no new identity table needed.

## Data Model

Extend the existing `Patron` model in `apps/web/prisma/schema.prisma`:

```prisma
model Patron {
  // ...existing fields (id, venueId, characterName, world, isVip, vipSetAt, vipSetById, createdAt)...

  isBanned   Boolean   @default(false)
  banReason  String?
  bannedAt   DateTime?
  bannedById String?

  vipSetBy User? @relation("PatronVipSetBy", fields: [vipSetById], references: [id], onDelete: SetNull) // now named — see below
  bannedBy User? @relation("PatronBannedBy", fields: [bannedById], references: [id], onDelete: SetNull)

  // ...existing @@unique/@@index/@@map...
}
```

`Patron` now has two `User?` relations (`vipSetBy`, `bannedBy`). Prisma requires an explicit `@relation` name on **both** sides once a model has more than one relation to the same target — `vipSetBy` was unnamed when it was the only one (fine at the time), but adding `bannedBy` means `vipSetBy` must also gain a name (`"PatronVipSetBy"`) or Prisma will fail to disambiguate which FK maps to which back-relation. Update `User`'s existing `vipPatronsSet Patron[]` back-relation to `vipPatronsSet Patron[] @relation("PatronVipSetBy")` accordingly, and add a matching named `bannedPatronsSet Patron[] @relation("PatronBannedBy")`.

`banReason`/`bannedAt`/`bannedById` persist as a **last-ban snapshot** even after `isBanned` flips back to `false` on unban — same minimalism as VIP's `vipSetAt`/`vipSetById`. No separate ban-history/audit-log table. If a patron is banned, unbanned, then banned again, the snapshot reflects only the most recent ban.

`banReason` is required at the API layer (non-empty string) even though the column is nullable — nullable only because a never-banned patron has none.

## Permissions

OWNER/MANAGER only, for both ban and unban — same tier as VIP flagging, matching the existing reclassification-override pattern.

## Dashboard

### Ban initiation — from Patron Profiles table

`components/patron-profiles-table.tsx` (already modified for VIP) gets a "Ban" button next to the existing VIP toggle in each row's Tags cell. Click reveals an inline text input + Confirm/Cancel directly in the row (no modal). Confirm calls `PATCH /api/venues/[venueId]/patrons/[patronId]/ban` with `{ isBanned: true, reason }`.

A banned patron's row shows a red "Banned" tag alongside whatever VIP/Regular/New tag already applies — the two states aren't mutually exclusive (an already-flagged VIP could later be banned; unusual, but not blocked).

### Ban List page — new route

`/dashboard/[slug]/ban-list`, new sidebar entry under "Records" (role-gated `["OWNER", "MANAGER"]`, matching the existing pattern for Patron Logs/Payroll in `components/venue-sidebar.tsx`).

Table of currently-banned patrons (`isBanned: true`): character name, world, reason, banned by, banned at, an "Unban" button (no reason required to unban — `PATCH .../ban` with `{ isBanned: false }`).

This page does NOT support searching for and banning a new patron directly — that only happens from Patron Profiles, per the confirmed design decision. This page is a read/manage view of who's currently banned.

## API

### `PATCH /api/venues/[venueId]/patrons/[patronId]/ban`

Session auth, OWNER/MANAGER membership check, same pattern as the VIP toggle route. Body: `{ isBanned: boolean, reason?: string }` — `reason` required (non-empty) when `isBanned: true`, ignored when `isBanned: false`. On ban: sets `isBanned: true`, `banReason: reason`, `bannedAt: now()`, `bannedById: session.user.id`. On unban: sets `isBanned: false` only — `banReason`/`bannedAt`/`bannedById` untouched (last-ban snapshot preserved).

### `GET /api/plugin/patrons/banned?venueId=`

API-key auth, same pattern as `GET /api/plugin/patrons/vip`. Returns `{ bannedPatrons: [{ characterName, world, reason }] }` — includes `reason` (unlike the VIP list, which returns no extra fields) since the plugin needs it for the in-game tooltip.

### `POST /api/plugin/patrons/ban`

**New pattern, not present in the VIP feature** — a plugin-facing WRITE endpoint, since `/xvm ban!` bans directly from the game client, not just reads. API-key auth (`x-api-key` + `validateApiKey`), same as other plugin write routes (`patron-visits`, `transactions`). Body: `{ venueId, characterName, world, reason }`. Finds-or-creates the `Patron` row (same upsert-by-`(venueId, characterName, world)` logic used on the dashboard's patron-logs page), then sets the same four ban fields — `bannedById` set to `auth.userId` (the plugin API key's associated user, not a dashboard session).

## Plugin (C#/.NET Dalamud)

### Cached ban list

Mirrors the VIP cache exactly: new `BannedPatron` model (`CharacterName`, `World`, `Reason`) and `BannedPatronsResponse` in `XIVAppApiModels.cs`; `GetBannedPatronsAsync(venueId)` on `XIVAppVenueApi.cs`; cached in a new `Plugin.xivAppBannedPatrons` field, fetched in `AutoLoadXivAppDataAsync` and `SettingsTab.LoadVenueDataWithFeedbackAsync` alongside roles/services/VIP — same cache-once-per-venue-select lifecycle, not live-polled.

### Guest list badge

`UI/Widgets/GuestListWidget.cs`: a red warning icon (⚠, `Colors.XivRed`) next to the name when the player matches an entry in `xivAppBannedPatrons`, same insertion pattern as the VIP gold star (both can appear on the same row if a patron is both VIP and banned — unusual but not prevented). Hovering the icon shows the ban reason as an ImGui tooltip (`ImGui.SetTooltip`) — justified beyond VIP's plain badge because `banReason` is required data that would otherwise be invisible in-game, and this widget already uses tooltips elsewhere (e.g., "Hold control to clear patron list").

### Entry chat alert

`Plugin.cs`, `showGuestEnterChatAlert`: "⚠ BANNED {name} has entered {venue}" prefix, same insertion point and gating as the VIP alert (after all existing snooze/`showChatAlerts`/entry-count checks — no bypass, no forced sound). Does not include the reason in the chat line (keeps it short); the reason is available via the guest-list tooltip.

### New slash command: `/xvm ban! <reason>`

Modeled on the existing `/xvm target!`/`/xvm sale!` bang-command family (`Plugin.cs`'s `OnCommand` handler). Bans the player's current in-game target with the given reason.

- Resolves `TargetManager.Target`, cast to `IPlayerCharacter` to get both `Name` and `HomeWorld` (target-based `sale!`/`target!` only ever needed the name; ban needs the world too, to key correctly into `Patron`'s `(venueId, characterName, world)` identity — same resolution `Player.fromCharacter` already does elsewhere in this file).
- No target selected → chat error `"No target selected."` (matches `target!`'s exact wording).
- Target is not a player character → chat error `"Target must be a player character."` (new case; `target!` doesn't need this check since it only reads `.Name`, which works on any `IGameObject`, but ban's world lookup requires a real player).
- Empty/missing reason → chat error `"Usage: /xvm ban! <reason>"` (matches `sale!`/`tip!`'s usage-error wording pattern).
- On success: fire-and-forget call to a new `Patron.BanPatronAsync(venueId, characterName, world, reason)` method on `XIVAppPatronApi.cs` (same file/class as `LogTransactionAsync`, `LogPatronVisitAsync`), POSTing to `/api/plugin/patrons/ban`. Chat toast: `"Banned {name}: {reason}"` on success, `"Ban failed: {error}"` on failure — mirrors `LogSaleSilentAsync`'s success/failure toast shape exactly.
- No `/xvm unban!` command — unbanning stays dashboard-only, by explicit decision.

## Out of Scope

- Any form of actual entry blocking/ejection (impossible — no plugin API for it)
- Ban-initiation search/add flow on the Ban List page itself (only from Patron Profiles)
- Multi-ban history log (single latest-ban snapshot only, same as VIP's single-flag-set snapshot)
- `/xvm unban!` slash command
- Sound-alert bypass or snooze-bypass for ban alerts (same as VIP's non-bypass decision)
- Reason field on VIP (unrelated, already decided against in the VIP spec — not revisited here)

## Files (indicative — full task breakdown belongs in the implementation plan)

| File | Action |
|------|--------|
| `apps/web/prisma/schema.prisma` | Modify — add ban fields + named relation to `Patron`/`User` |
| `apps/web/app/api/venues/[venueId]/patrons/[patronId]/ban/route.ts` | Create |
| `apps/web/app/api/plugin/patrons/banned/route.ts` | Create |
| `apps/web/app/api/plugin/patrons/ban/route.ts` | Create — plugin write endpoint |
| `apps/web/components/patron-profiles-table.tsx` | Modify — Ban button + inline reason input |
| `apps/web/app/dashboard/[slug]/ban-list/page.tsx` | Create |
| `apps/web/components/venue-sidebar.tsx` | Modify — new nav entry |
| `VenueManager/XIVAppApiModels.cs` | Modify — `BannedPatron`/`BannedPatronsResponse` |
| `VenueManager/XIVAppVenueApi.cs` | Modify — `GetBannedPatronsAsync` |
| `VenueManager/XIVAppPatronApi.cs` | Modify — `BanPatronAsync` |
| `VenueManager/Plugin.cs` | Modify — cache field, fetch calls, `ban!` command handler, chat alert |
| `VenueManager/UI/Tabs/SettingsTab.cs` | Modify — fetch in `LoadVenueDataWithFeedbackAsync` |
| `VenueManager/UI/Widgets/GuestListWidget.cs` | Modify — badge + tooltip |
