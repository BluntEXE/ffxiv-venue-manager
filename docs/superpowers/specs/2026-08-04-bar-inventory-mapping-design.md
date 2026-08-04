# Bar Inventory Mapping — Design Spec
**Date:** 2026-08-04
**Status:** Approved

## Overview

Last of four features from the original venue-feedback item (VIP, ban list, and room status board shipped first — see their design specs in this same directory). Lets a venue map custom drink names to real FFXIV items, track stock, and automatically deduct on sale.

Unlike the first three features, no comparable Dalamud plugin exists for this (confirmed via research — nothing found doing bar/tavern inventory simulation), so this design is built from first principles rather than adapted from prior art.

**Opt-in, off by default.** Mirrors the existing `VenuePotSettings` pattern (a separate settings table with an `enabled` flag, toggled in venue Settings, OWNER/MANAGER only, other UI conditionally hides related fields when disabled — same as how the Roles page already hides pot payout fields when pot mode is off). Most venues don't run a bar with real inventory pressure; this shouldn't clutter their dashboard or plugin.

## Data Model

### `VenueInventorySettings` (opt-in toggle)

```prisma
model VenueInventorySettings {
  id        String   @id @default(cuid())
  venueId   String   @unique
  enabled   Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)

  @@map("venue_inventory_settings")
}
```

### `Service` gains inventory fields

No new drink/item table — a "drink" is just an existing `Service` with inventory fields populated. This keeps the existing sale-logging flow (`createTransaction`, `serviceId`-based) unchanged in shape; inventory is additive metadata on a service, not a parallel concept staff have to learn separately.

```prisma
model Service {
  // ...existing fields...
  linkedItemId    Int?      // real FFXIV item ID — source of truth
  linkedItemName  String?   // cached display name (avoid re-fetching on every render)
  linkedItemIcon  Int?      // cached icon asset ID
  stockCount      Int?      // null = not inventory-tracked, even if the venue has inventory enabled
}
```

A service with `stockCount: null` is not inventory-tracked even when `VenueInventorySettings.enabled` is true — inventory is opt-in per venue AND opt-in per service (a venue might track 3 rare drinks and leave everything else untracked). No per-drink low-stock threshold field — a single fixed default (e.g. warn at 5) is applied in query/UI logic, not stored per-row.

**One drink = one item.** No multi-ingredient recipes. This was an explicit scope decision (checked against real-world prior art first — none existed to suggest otherwise) matching the "Semi-Bar" framing in the original feedback.

## Item Linking — Two Independent Search Paths, One Source of Truth

FFXIV's real item catalog (names, icons) only exists as Lumina Excel-sheet data inside the running game client — the web server has no access to it. This forced a two-path design, both converging on the same `linkedItemId`:

- **Dashboard**: a new server-side proxy route calls XIVAPI v2's item search endpoint (a public, community-run FFXIV data API with item search-by-name and icon data) — the web server can call this directly, no Lumina needed. Rate-limited like every other route in this app.
- **Plugin**: searches the local Lumina `Item` Excel sheet directly, using the same technique the community `ItemSearchPlugin` (`/xlitem`) already uses for exactly this purpose. No network call needed — Dalamud plugins have direct Lumina access.

Both paths independently resolve to the same real FFXIV item ID, which is all that's actually stored (`linkedItemName`/`linkedItemIcon` are a cache of the resolution, not the source of truth — either lookup mechanism can refresh them). Neither path needs the other to exist; a venue could link every drink from the dashboard and never touch the plugin's picker, or vice versa.

Both are OWNER/MANAGER only — matches the existing tier for creating/editing `Service` records.

## Stock Enforcement — Lives Once, Shared by Both Sale-Logging Surfaces

The codebase already has a single shared `createTransaction` function (`apps/web/lib/api/transactions.ts`) that both the dashboard's transaction POST route and the plugin's `/api/plugin/transactions` route call. Stock logic goes there, once:

- If the transaction's `serviceId` resolves to a `Service` with `stockCount` set (not null) and `stockCount <= 0`: reject the transaction (the sale does not log), matching the confirmed decision that this is a hard block, not just a warning.
- On a successful sale against a stock-tracked service: decrement `stockCount` by 1.

Because both the dashboard PATCH-based sale logging and the plugin's `/xvm sale!`/Sales-tab-based logging already funnel through this one function, both surfaces get identical enforcement automatically — no duplicated logic, no risk of the two surfaces drifting out of sync on this rule.

**Who can restock (set/adjust `stockCount`)**: OWNER/MANAGER only, same tier as linking items — matches the earlier confirmed split ("OWNER/MANAGER manage stock, but whoever sells and logs in plugin can affect stock" — i.e., any staff triggers the automatic *decrement* via normal sale-logging, but *setting/increasing* the count is a management action).

## Surfaces

### Dashboard — Services page

- Item picker (via the XIVAPI proxy route) and a stock-count field added to each service row, visible only when `VenueInventorySettings.enabled` is true.
- Low-stock badge when `stockCount` is set and at or below the fixed default threshold.

### Plugin — new "Inventory" tab

- New tab (alongside Patrons/Sales/History/Shift/Rooms/Venues/Settings), nav icon only shown when the venue's inventory setting is enabled (plugin fetches this flag alongside roles/services/VIP/banned — same cache-once-per-venue-select lifecycle already established for those).
- Lists inventory-tracked services with current stock, linked item name/icon, low-stock highlighting.
- Item search (local Lumina lookup) + link/relink control, restock control (OWNER/MANAGER only — same gating pattern already used for ban's `/xvm ban!` OWNER/MANAGER check).

### Plugin — Sales tab

- The existing service dropdown (already lists `plugin.availableServices` for logging a sale) gets a small "(N left)" label appended to stock-tracked drinks. No other change to the sale-logging flow itself — enforcement happens server-side per the shared `createTransaction` logic above, this is purely an informational label so staff aren't surprised by a rejected sale.

## Out of Scope

- Multi-item recipes (a drink requiring several different in-game items) — explicitly deferred, no existing prior art suggested this was worth the complexity for a first version.
- Per-drink custom low-stock thresholds — one fixed default for now.
- Automated detection of a patron physically handing over a real in-game item as payment/ingredient — this is inventory bookkeeping, not a game-state integration.
- Allowing sales through at zero stock (explicitly a hard block, not a warning-only mode).
- A dashboard-side item catalog independent of XIVAPI (i.e., no self-hosted copy of FFXIV item data) — relies on the public XIVAPI v2 service being available; if it's ever unreliable, that's a operational concern for a later pass, not a design change now.
