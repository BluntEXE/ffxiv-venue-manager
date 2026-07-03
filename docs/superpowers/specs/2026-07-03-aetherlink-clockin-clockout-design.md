# Aetherlink /clockin and /clockout slash commands

Date: 2026-07-03

## Problem

Staff can only clock in/out of a shift via the in-game plugin, the mobile app,
or the website. All three require the game or a dedicated app open. Staff are
already on Discord constantly (the community server, DMs) — a `/clockin` /
`/clockout` slash command on Aetherlink gives them a fourth path that works
anywhere Discord does, without duplicating the clock-in business logic that
already exists across the other three.

## Design

### Command shape

- `/clockin` and `/clockout`, both zero-argument.
- Because a staff member can never have two shifts scheduled to overlap (they
  can't be in two places at once), there's no ambiguity to resolve: at most
  one shift can be eligible to start (or currently active) for a given Discord
  user at any moment. No venue argument, no autocomplete, no disambiguation UI.

### Auth: bot → web

- New shared secret, `EORZEA_BOT_API_SECRET`, set in both the bot and web
  app's env (mirrors the existing web→bot `EORZEA_BOT_WEBHOOK_SECRET`, just
  the reverse direction). Sent as a header (e.g. `x-bot-secret`) on requests
  from the bot to the two new web endpoints.
- The secret only proves "this request came from our bot," not "this Discord
  user is who they say" — Discord's own interaction signing already
  guarantees the bot knows the real `interaction.user.id`, so the web endpoint
  trusts the `discordId` in the request body once the shared secret checks
  out.
- The web endpoint resolves `discordId` → `userId` via the existing unique
  `users.discordId` column (already populated at signup, already used by
  `assignLoyaltyRole` / `awardXp` in the bot), then authorizes by checking
  that user has a staff `membership` on the shift being touched — the same
  shape of check the plugin route already does
  (`auth.venues.includes(shift.venueId)`), just keyed by `discordId` instead
  of an API key.
- No per-user secrets to fetch, store, or rotate. If `users.discordId` is
  null (a signup edge case, not expected in normal operation since Discord
  linking is part of signup), the endpoint returns a "not linked" error the
  bot renders as an ephemeral message pointing to `/dashboard/account`.

### New web endpoints

- `apps/web/app/api/bot/shifts/clock-in/route.ts`
- `apps/web/app/api/bot/shifts/clock-out/route.ts`

Both reuse the exact clock-in/out logic already duplicated across the 5
existing call sites (plugin, mobile self, mobile operator, web) rather than
reimplementing it:

- **Clock-in:** find the caller's shift with `status: SCHEDULED` and `now`
  inside `[scheduledStart - 30min, scheduledStart + 60min]` — the same window
  already enforced in `mobile/my/shifts/[shiftId]/route.ts` and the other
  routes. `updateMany` with `status: SCHEDULED` in the `where` clause (not a
  plain `update`) to catch the same concurrent-write race the existing routes
  guard against, returning 409 on `count === 0`.
- **Clock-out:** find the caller's shift with `status: ACTIVE` (at most one,
  per the no-overlap guarantee) and complete it.
- Both fire the same side effects every other clock-in/out path fires:
  `logShiftAudit`, `queueOpenedNowNotifications` (clock-in only),
  `syncVenueOpenStatus` (so the What's Happening region board updates exactly
  like it does from the plugin/mobile/web paths — no special-casing needed
  there), and shift XP.

### New bot commands

- `apps/eorzea-bot/src/commands/venue/clockin.ts`
- `apps/eorzea-bot/src/commands/venue/clockout.ts`

Both: `deferReply({ flags: MessageFlags.Ephemeral })`, POST
`{ discordId: interaction.user.id }` to the corresponding web endpoint, render
the JSON response as an ephemeral embed or plain message via `editReply`.

## Data flow

```
/clockin (Discord) -> bot resolves interaction.user.id
  -> POST /api/bot/shifts/clock-in { discordId } (x-bot-secret header)
    -> web resolves discordId -> userId
    -> web finds SCHEDULED shift in window, owned by that user
    -> web flips ACTIVE, runs existing side effects (audit, notify, XP, syncVenueOpenStatus)
    -> web responds { success, venue, scheduledStart, ... } or { error }
  -> bot renders ephemeral confirmation/error
```

## Error handling

- **Not linked** (`discordId` has no matching user — edge case, not expected
  in normal signup flow): ephemeral message pointing to `/dashboard/account`.
- **No eligible shift** (clock-in: nothing `SCHEDULED` in the window;
  clock-out: nothing `ACTIVE`): ephemeral message, e.g. "Nothing scheduled to
  start soon" / "You're not currently clocked in anywhere."
- **Already active on `/clockin`**: friendly no-op, not an error —
  `"You're already clocked in at **{venue}** since {time}."` — matches the
  bot's existing transition-detection philosophy (no-op on redundant state,
  same as `/webhook/venue-status`'s `changed: false` path).
- **Concurrent write race**: `updateMany` + `count === 0` → 409, bot renders
  a generic "that shift just changed, try again" message.

## Testing / rollout

No user-facing web/plugin/mobile changes — purely additive (new bot commands
+ new bot-only web endpoints). Verify by:

- Linking a test Discord account, scheduling a test shift, confirming
  `/clockin` only succeeds inside the 30-min-before/60-min-after window and
  fails with the correct message outside it.
- Confirming `/clockin` while already `ACTIVE` returns the friendly no-op,
  not an error.
- Confirming `/clockout` completes the shift and the appropriate What's
  Happening region board updates (reusing the manual verification pattern
  from the discord-feed-channels rollout).
- Confirming an unlinked test account gets the "link Discord" message rather
  than a raw error.
