# Aetherphone "Venue Sync" App — Design

**Status:** Prototype design, not yet pitched to Aetherphone's maintainer (Xeldar). Built and tested on our own fork first.

**Repo:** `~/plugin-research/FFXIV-Aetherphone` (separate Dalamud plugin from XIV Venue Manager Sync)

## Goal

Bring the daily-use member functionality of the standalone XIV Venue Manager Sync plugin — clock in/out, shift claiming, sales logging, account setup — into Aetherphone as a first-class app tile, reimagined for Aetherphone's phone UI/UX and its accessibility conventions, rather than ported as-is.

## Scope (v1)

In scope:

1. **Settings screen** — API key entry, venue selection, character linking
2. **Dashboard hub** — at-a-glance clock status + quick actions
3. **Shift screen** — claim open shifts, clock in/out, view upcoming shifts
4. **Sales screen** — log a sale against a role-scoped service list

Explicitly out of scope for this design (tracked separately, not blocking):

- **Non-Discord / owner-issued API keys.** Key generation is Discord-OAuth-gated site-wide (`lib/auth.ts:6-14`, only provider) and strictly self-service (`app/api/plugin/keys/route.ts:45-126`, always binds to the requester's own session). Members who can't/won't use Discord login are handled manually today; building an alternate issuance path is a separate backend project, not an Aetherphone UI concern.
- **Server-side role enforcement on `POST /api/plugin/transactions`.** The endpoint doesn't currently verify a submitted `serviceId` belongs to the caller's role (`app/api/plugin/transactions/route.ts:62-66` only checks a broad log-transaction permission). Pre-existing gap, low real-world risk, tracked as a follow-up.
- Patron tracking and payroll glance — not part of this app; patron tracking is passive (plugin already reports visits automatically) and payroll is owner/manager-facing, not a member daily-use action.

## Architecture

Follows Aetherphone's established `Core/<Feature>` + `Apps/<Feature>` split, same shape as `Core/Venues` + `Apps/Venues`.

```
Core/VenueSync/
  VenueSyncApiClient.cs   — HTTP client wrapping xivvenuemanager.com's /api/plugin/* endpoints
  VenueSyncState.cs       — in-memory session state (current venue, shift list, session sales totals)
  VenueSyncConfig.cs      — persisted config (API key, selected venue ID, phone-side only)

Apps/VenueSync/
  VenueSyncApp.cs         — IPhoneApp implementation, owns ViewRouter<VenueSyncRoute>, DI-registered in AppRegistry.BuildDefault
  VenueSyncApp.Dashboard.cs — dashboard hub screen
  VenueSyncApp.Shifts.cs    — shift screen
  VenueSyncApp.Sales.cs     — sales screen
  VenueSyncApp.Settings.cs  — settings/setup screen
  ShiftRow.cs, SaleSummaryRow.cs — reusable row components (mirrors VenueCard.cs's static Draw(rect,...) pattern)
```

`VenueSyncApiClient` is a thin wrapper, not a reimplementation — it calls the same `/api/plugin/*` endpoints the standalone plugin already uses (`GET /api/plugin/shifts`, `POST /api/plugin/shifts/clock-in`, `/clock-out`, `/claim`, `GET /api/plugin/services`, `POST /api/plugin/transactions`, `GET /api/plugin/venues`), plus one new endpoint (below). No new backend surface for the four in-scope screens beyond that.

### New backend endpoint: character linking

`POST /api/plugin/characters` (new) — authenticates via `x-api-key` header like other `/api/plugin/*` routes (not session auth, unlike the existing manual web form at `app/api/user-characters/route.ts` which requires `getServerSession`). Body: `{ characterName, world }`. Upserts a `UserCharacter` row keyed on the existing unique `(characterName, world)` constraint (`prisma/schema.prisma:97-109`), setting `userId` from the authenticated API key's owner. If the unique key already exists under a _different_ `userId`, return `409 Conflict` rather than silently reassigning it — a name+world pair is claimed by whoever links it first.

This is the only new backend work this design requires. Everything else reuses existing endpoints.

## Navigation

Stack-based, via `ViewRouter<VenueSyncRoute>` — matches `VenuesApp`'s existing pattern exactly (`Apps/Venues/VenuesApp.cs:36,62`), not a new nav idiom.

```
enum VenueSyncRoute { Dashboard, Shifts, Sales, Settings }
```

- `Dashboard` is the root (no back button, per `VenuesApp.cs:144-161`'s root-screen convention)
- `Shifts`, `Sales`, `Settings` are all pushed from Dashboard and pop back to it
- No tab bar, no chip-strip — rejected in favor of the dashboard-hub shape (see Decision below)

### Decision: dashboard hub over segmented strip

Two shapes were considered. **Dashboard hub** (chosen): home screen is a glanceable status card + three tappable rows (Log a Sale / Upcoming Shifts / Session stats), each pushes its own full screen. **Segmented strip**: Shift and Sales share one screen behind filter chips, only Settings is pushed separately.

Dashboard hub wins because:

- It reuses `ViewRouter` exactly as-is; the segmented strip would need a second nav idiom with no prior art in the codebase.
- The single most common thing a member opens this app to check — "am I clocked in right now?" — needs to be the first thing shown, not sharing space with a chip row.
- Shift and Sales aren't filtered views of the same data (unlike Venues' time-range chips) — they're different actions with different follow-up screens, so collapsing them saves one tap at the cost of clarity.

## Screens

### Dashboard (root)

Header: title "Venue Sync" + gear icon (opens Settings), laid out via `AppHeader.DrawTitleWithReserve` so the title never collides with the gear at narrow phone widths.

Body: one status card (current venue + role + clock state — "ON SHIFT · 1h 12m" or "OFF SHIFT", Clock In/Out button when a shift is active or about to start) followed by three row cards: "Log a Sale", "Upcoming Shifts (N)", "This Session: N sales · Xg". Each row is an independent tappable card (`SettingsRow`/`GroupCard`-style), never two stacked `Marquee` texts sharing one hover rect.

### Shifts

Header: back button + "Shifts" title. Body, top to bottom: current/active shift card (if any) with Clock In/Out, an "OPEN — CLAIM" section listing unclaimed shifts matching the member's role with a Claim action, then "UPCOMING" listing the member's own scheduled shifts. Clock-in stays disabled outside the existing 30-minute pre-start window (`ShiftsTab.cs:223` behavior preserved). No local "am I clocked in" state is tracked client-side — same as today, the screen re-fetches shift state from the server rather than trusting a local flag, avoiding drift if the member clocked in/out from the desktop plugin or web dashboard instead.

### Sales

Header: back + "Log a Sale". Form: service dropdown (populated from `GET /api/plugin/services`, already role-scoped server-side — a bartender only ever sees bartender-tagged services), customer field with a target-lock button (mirrors `SalesTab.cs`'s "use target" crosshair, auto-fills from the player's current in-game target), amount input, Log Sale button, and a session summary line below (count + total gil, in-memory only, resets on plugin reload — same as `SessionSalesTotal`/`SessionSalesCount` today).

### Settings

Header: back + "Sync Settings". Fields: masked API key input with eye-toggle (unchanged from `SettingsTab.cs`'s existing pattern — paste-in remains the mechanism, per the out-of-scope decision above), venue selector (populated once a valid key is set), and a character-link card: Aetherphone already knows the local player's name/world via Dalamud's `ClientState`, so this card shows it pre-filled with a single "Link this character" confirm button — no typing required, unlike the website's manual name/world form.

## Data flow

All four screens go through `VenueSyncApiClient`, which owns the `x-api-key` header and base URL (configurable, defaults to `https://xivvenuemanager.com` — matches `SettingsTab.cs`'s existing default). No caching layer beyond `VenueSyncState`'s in-memory session data (current venue, last-fetched shift list, session sales counters) — every screen open re-fetches from the server, same freshness model as the existing plugin (`ShiftsTab.cs`'s 30s auto-refresh pattern can be reused for the Shifts screen).

## Error handling

Inline error + manual retry, no local queue. A failed clock-in/out or sale-log POST shows a red inline message on the same screen ("Failed to log sale — tap to retry") and preserves whatever the member had entered in the form — nothing is lost, nothing silently retries in the background. This matches how `SalesTab`/`ShiftsTab` already surface errors in the standalone plugin. A local retry queue was considered and rejected: it adds real complexity (local persistence, conflict handling if shift/sale state changed server-side before the queued retry fires) for a failure mode — brief network drops during an active game session — that a visible "tap to retry" already handles well enough.

## UI bug-class mitigations (applied throughout)

1. **Shared-hover marquee bug** — every list row (shift rows, sale rows, service dropdown items) is drawn as an independent card with its own hover state, never two `Marquee.DrawLeft` calls sharing one computed `hovered` bool for stacked title+subtitle text. Use `Marquee.DrawLeftAuto`/`DrawCenteredAuto` wherever a row has 2+ lines of scrollable text.
2. **Header space-reservation gaps** — every screen header uses `AppHeader.DrawTitleWithReserve`, reserving width against every neighboring element (back button on the left, gear/action icon on the right), not just the obvious cluster.
3. **Typography cursor corruption** — prefer `Marquee.DrawLeftAuto` over `Typography.Draw*`/`DrawCentered` for row text throughout. Any place that still mixes `ImGui.Dummy`-based row reservation with a manual `Typography.Draw*` call must reset the cursor to `row.Max.Y` afterward.

## Testing

No automated UI test harness exists for Aetherphone's ImGui screens (matches the rest of the codebase). Verification is manual: build against a dev Dalamud instance, exercise each screen's happy path and the inline-error path (temporarily point `VenueSyncApiClient` at a bad URL to force a failure), confirm no marquee/header/cursor regressions at the XS (280×606) and XXL (500×1084) phone sizes from `PhoneSizeCatalog.cs`, since those are the extremes where the three known bug classes tend to surface first.

## Open follow-ups (not blocking this design)

- Owner-issued API keys for members who can't/won't use Discord login (separate backend project)
- Server-side role enforcement on `POST /api/plugin/transactions`
- Pitching this to Xeldar once the prototype is proven out on our own fork
