# XIV Venue Manager — What's New (Testing Build v3.10.5)

Five new features, all live on the website now, plugin available on the testing channel. Read this before testing, then report anything that breaks.

## Get the testing build

In-game, open Dalamud's Plugin Installer, go to Settings → Experimental, and enable "Get all plugin testing versions." Then check for updates. You should land on v3.10.5-testing or later — check the version number in the plugin's header.

This build has not been promoted to the stable channel yet. If you don't opt into testing versions, you won't get it, and that's intentional until it's confirmed solid.

---

## 1. VIP patrons

Mark a patron as VIP from the dashboard, and the plugin flags them automatically in-game.

**To use it:** Dashboard → Patron Logs. Find the patron, click "Mark VIP" on their row. A VIPs tab and count appear at the top of the table. Click "Unmark VIP" to undo.

**What to expect:** next time that patron walks into your venue, the plugin's guest list shows a VIP star badge next to their name, and the entry chat alert gets a VIP prefix.

**Test:** mark someone VIP, have them enter, confirm the badge and the chat alert.

---

## 2. Ban list

Ban a patron with a reason, from the dashboard or in-game. This is a warning to staff, not an automated block — the plugin has no way to eject or lock anyone out.

**To use it, dashboard:** Dashboard → Ban List. Ban or unban a patron, reason required.

**To use it, in-game:** `/xvm ban! <reason>` on a targeted or nearby patron.

**What to expect:** a banned patron shows a ban warning badge in the plugin's guest list, with the reason on hover.

**Test:** ban someone, have them enter, confirm the warning badge and reason show up. If you unban from the dashboard, confirm it clears.

---

## 3. Room status board

Track which rooms in your venue are occupied or free, from the dashboard and in-game, synced live between both.

**To use it, dashboard:** Dashboard → Rooms. Add a room, click its status to toggle Occupied/Free, click the note field to add context (e.g. "private session, do not disturb").

**To use it, in-game:** plugin's Rooms tab. Same toggle, same notes, any active staff member can update it (not owner/manager-only).

**What to expect:** a change on one side shows up on the other within a couple seconds, no refresh needed.

**Test:** toggle a room from the dashboard while someone else has the plugin's Rooms tab open, confirm it updates live for them. Then do it the other direction.

---

## 4. Bar inventory mapping

Link a drink (a Service) to a real FFXIV item, track how many you have, and stop selling it automatically at zero. Opt-in — off by default, does nothing until a venue turns it on.

**To turn it on:** Dashboard → Settings → Bar Inventory Tracking, toggle Enabled.

**To link a drink to an item, two ways:**
- Dashboard → Services → edit a service → search for the item by name, pick it, set a stock count.
- In-game, plugin's new Inventory tab (only visible once the venue has inventory tracking on) → Link Item on a service → search in-game, pick it, set a stock count.

Both ways write to the same place — link from either side, doesn't matter which.

**What to expect:**
- The plugin's Sales tab shows "(N left)" next to a stocked drink in the dropdown.
- Selling one decrements the count, from either the dashboard or the plugin.
- Hit zero, the next sale gets rejected with an out-of-stock error naming the drink.
- Restock from the plugin's Inventory tab or the dashboard's Services page — only Owner/Manager can restock or relink, staff can sell and see the count.
- A service with no stock count set is never tracked, even with the venue-wide toggle on — this is opt-in per drink too, not just per venue.

**Test:** turn it on, link a drink, set stock to 2, sell it twice, confirm the third sale is blocked with the drink's name (not a raw ID) in the error. Restock, confirm selling works again.

---

## 5. Patron tracking now covers the plot exterior

Previously, the plugin only tracked patrons while they were inside your house. Standing outside on your own plot's yard, at the door, didn't count for anything — no guest-list entry, no header update, nothing.

**What's different:** the plugin now tracks both. Someone standing on your plot's exterior shows up the same way someone inside does — same guest list, same header, same VIP/ban badges. Walking through the door doesn't create a second, separate visit — it's the same tracked presence the whole time, in and out.

**Nothing to turn on** — this is always active, not a toggle.

**Test:** walk onto your own plot without going inside, confirm the header shows your venue name and the patron count updates. Walk inside, confirm it's still the same session (name doesn't flicker or reset). Walk away entirely, confirm the header clears back to "(no venue)" within a couple seconds.

---

## Reporting back

For anything that breaks, the most useful report includes:
- Which feature, and which of the two "to use it" paths (dashboard or plugin) if it applies.
- What you expected vs. what happened.
- If it's plugin-side: your plugin version number (Settings tab or the header) and whether you're on the testing channel.

Once this build's been through a real night with real testers and nothing's on fire, it gets promoted to the stable channel and everyone gets it automatically.
