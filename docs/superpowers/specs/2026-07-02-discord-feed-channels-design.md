# Discord feed channels: Tonight / Events / What's Happening

Date: 2026-07-02

## Problem

Three community Discord channels (fed by the Aetherlink bot / `eorzea-bot`) aren't
doing what they're meant to:

- **Tonight** — meant to show venues opening that day. Currently empty most days:
  the cron requires a shift still _covering right now_ (`scheduledEnd >= now`),
  and runs at 18:00 UTC — after several venues have already opened and closed for
  the day (real shift data clusters 14:00–20:00 UTC).
- **Events** — meant to show any event (manually created or Partake-synced) in
  the next 7 days. Currently only gets a post when an event transitions to LIVE
  (`update-event-statuses`), which is a "starting now" ping, not a lookahead feed.
- **What's happening** — meant to show which venues are open right now. No code
  in the bot or web app currently posts to this channel at all.

## Design

### 1. Tonight channel

- Change `tonight-post` cron schedule from `0 18 * * *` to `0 12 * * *` (UTC) —
  2 hours ahead of the earliest typical shift start, so the post lands before
  any venue opens that day.
- Loosen the query: any `Shift` with status `SCHEDULED` or `ACTIVE` whose
  `scheduledStart` falls within today's UTC calendar day (00:00–23:59), for
  `isActive` venues excluding `venueType: TEST_VENUE`. Drop the
  `scheduledEnd >= now` constraint — a venue that opened and closed earlier
  today still counts as "opening today."
- Stays a single one-shot daily post (current behavior) — no message editing,
  low volume, ephemeral by nature.

### 2. Events channel

- Replace the single "list everything in 7 days" idea (rejected — a combined
  message caps out around Discord's 6000-char whole-message limit long before
  event volume gets interesting) with **7 tracked day-messages**: one message
  per calendar day, today through +6 days.
- Each day-message lists every `Event` (any source, including `partakeEventId`
  rows) with `startTime` on that day and status `PUBLISHED`/`ACTIVE` (not
  `CANCELLED`), sorted by `startTime`. A day with nothing scheduled still posts
  a message ("Nothing scheduled") rather than disappearing.
- Re-rendered (edited in place, not reposted) by a new dedicated cron route
  (`events-digest-post`, its own crontab entry every 15 min) — kept separate
  from `post-partake-events`, which posts to per-venue Discord webhooks and is
  a different concern (per-venue mirror vs. shared community digest).
- If a single day's event count still overflows one embed (~25 events), that
  day's message truncates with "+N more today" — scoped to the one day, never
  silently dropping other days.
- Bot needs to track 7 message IDs (one per day-slot), not one. New table or
  bot-side state (see Data model below).

### 3. What's happening channel

- 4 region boards, one message each, based on FFXIV data center → physical
  region grouping:
  - **NA**: Aether, Crystal, Dynamis, Primal
  - **EU**: Chaos, Light
  - **JP**: Elemental, Gaia, Mana
  - **OCE**: Materia
- Each board lists only venues **currently open** in that region — bounded by
  concurrent staffed-venue count, not total registered venues, which is what
  keeps this scalable regardless of platform growth.
- "Open" = venue has ≥1 `Shift` with `status: ACTIVE` — reuses the exact
  definition already used by `/api/mobile/discover/open-now`.
- Trigger: hook into shift clock-in/clock-out, at all three entry points
  (`/api/plugin/shifts/clock-in`, `/api/plugin/shifts/clock-out`, and the
  mobile/web equivalents) — same insertion point already used by the existing
  `queueOpenedNowNotifications` push-notification dedup logic in the plugin
  clock-in route.
- Only re-render a region's board on an actual open/closed **transition**
  (first ACTIVE shift for a venue with none before = opens; last ACTIVE shift
  ending = closes) — not on every clock-in of an already-open venue (e.g. a
  second staff member clocking into a venue that's already open shouldn't
  cause a re-render).

## Data model changes

- `eorzea-bot` needs to persist Discord message IDs it's tracking, since these
  are now edited-in-place boards/digests rather than fire-and-forget posts.
  Add a small table to the bot's own Prisma schema (`apps/eorzea-bot/prisma`),
  e.g. `TrackedMessage { key String @id, channelId String, messageId String,
updatedAt DateTime @updatedAt }`, keyed by board type: `events:day-0` through
  `events:day-6`, `region:na`, `region:eu`, `region:jp`, `region:oce`.
  `tonight` doesn't need a row — it stays one-shot, never edited.

## Error handling

- Existing `postToBot` pattern (fire-and-forget, swallow errors) stays for
  triggering — but the _edit_ calls inside the bot need to fall back to
  "message not found → repost and store new ID" (e.g. if a moderator deletes
  a tracked message manually), same defensive pattern `channels.ts`
  (`postEmbed`) already uses for missing channels.

## Testing / rollout

- No user-facing UI changes — this is bot + cron + one new small bot-side
  table. Verify by watching the three channels directly after deploy:
  - Tonight: trigger the cron manually (`curl` with `CRON_SECRET`) at any time
    of day and confirm today's shifts show up regardless of time-of-day.
  - Events: manually create a test event 2 days out, confirm it appears in the
    correct day-message within one cron cycle (15 min), edit it, confirm the
    message updates, cancel it, confirm it drops off.
  - What's happening: clock a test shift in/out via the plugin or `/venue`
    command, confirm the correct region board updates and no other region's
    board changes.
