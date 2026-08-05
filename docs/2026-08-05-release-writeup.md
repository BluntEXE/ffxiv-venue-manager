# Release writeup — 2026-08-05

## Website

Deployed live via `--green` blue-green flip. All 13 smoke checks passed. Ships four features, none of which existed in the previous production build:

**VIP patrons.** Owners and managers can flag a patron as VIP from the dashboard. The plugin shows a star badge on VIP guests in the live guest list and prefixes their entry chat alert.

**Ban list.** Owners and managers can ban a patron with a required reason, from the dashboard or in-game via `/xvm ban!`. The plugin shows a ban warning badge with the reason on hover. No automated enforcement, since the plugin has no way to eject or block anyone. It's a warning to staff, not a lock on the door.

**Room status board.** New Rooms page on the dashboard and Rooms tab in the plugin. Any active staff member can mark a room occupied or free, with an optional note. Updates sync live over SSE.

**Bar inventory mapping.** A venue can opt in to inventory tracking under Settings. Once on, a Service ("drink") can be linked to a real FFXIV item and given a stock count. Two independent ways to find the item: search live in-game through the plugin (reads local game data, no network call) or search from the dashboard (queries XIVAPI, a public FFXIV item database). Both write the same item ID. Selling a stocked drink decrements it. Selling the last one blocks the sale with a 409, whether the sale comes from the dashboard or the plugin. Restocking and relinking require an owner or manager.

Database: one new table (`venue_inventory_settings`) and four new columns on `services`, applied by hand with `psql` against a pg_dump backup taken first. Not run through `prisma db push`, since that command has previously wiped tables on this shared database.

## Plugin (v3.10.0-testing)

Ships the same four features as the web release, plus one the website side doesn't touch:

**Exterior plot tracking.** The plugin used to track patrons only while they were inside the house instance. Standing in your own yard, at the door, on the plot exterior, none of that counted. It now tracks both. A patron who walks up outside and then goes in gets logged once, not twice, because both states resolve to the same venue identity under the hood instead of two different ones.

That required a real change to how the plugin identifies a house. It used to ask the game for the interior-only house ID, which returns nothing useful outside. It now builds its own ID from world, territory type, ward, plot, and room, the same technique the Aetherphone plugin already uses for the same problem. A house saved under the old ID migrates to the new one automatically the first time you visit it again. Nothing for you or your users to run by hand.

This is a testing release, not the stable channel. Neither the inventory feature nor the exterior tracking has been checked against a live game client yet. Install it by toggling "Get all plugin testing versions" in Dalamud, or grab the zip directly from the release page.

Also fixed: a stale zip from a previous build was getting bundled inside every new release zip, because the packager zips whatever's already in the output folder instead of starting clean. That's very likely what shipped wrong last time. Builds now clean the output directory first.

## What's still open

- Manual in-game verification of both the inventory feature and exterior tracking. Toggle inventory on for a test venue, link an item from both the dashboard and the plugin, sell down to zero and confirm the block, restock, check the owner/manager permission boundary, and check that walking outside then inside the same house logs one visit, not two.
- If that holds up, promote the plugin build from testing to stable and repoint `repo.json`'s main download links at it.
