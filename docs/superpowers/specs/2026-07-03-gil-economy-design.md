# Aetherlink Gil Economy (v1)

Date: 2026-07-03

## Problem

`DiscordMember.gil` has existed in the bot's schema since the leveling system was built, is displayed on `/rank` and `/myprofile`, but nothing has ever written to it — every member's Gil is permanently `0`. It's dormant scaffolding for a currency that was never wired up.

## Design

### Scope decision

Gil stays a **cosmetic, Discord-only currency** with no real-money or in-game-gil backing — no tip integration, no economic liability, no balancing risk beyond "a number that goes up and down." Redeeming Gil for real in-game value (e.g. triggering an actual tip via the existing `TIP` transaction type) was considered and explicitly deferred — flagged as a possible future direction, not part of this design.

### Earn triggers (v1: exactly three)

1. **React to a Tonight or Events message** — `messageReactionAdd` listener checks the reacted message's `channelId` against `TONIGHT_CHANNEL_ID`/`EVENTS_FEED_CHANNEL_ID` and that the message author is the bot itself. **+25 Gil.**
2. **Submit `/suggest`** — hook into the existing command, after a successful submission. **+50 Gil.**
3. **Successful `/clockin`** — hook into the command shipped earlier tonight, on the real clock-in success path only (not the `alreadyActive` no-op branch). **+100 Gil.**

### Anti-farm guard (reactions only)

Re-reacting/un-reacting on the same message must not pay out twice. New table on the bot's own schema:

```prisma
model GilReactionReward {
  id        String   @id @default(cuid())
  discordId String
  messageId String
  createdAt DateTime @default(now())

  @@unique([discordId, messageId])
}
```

The reaction handler attempts an `INSERT` before crediting Gil; a unique-constraint violation means this user already got paid for this message, so it silently no-ops. Same shape as the `discord_tracked_messages`/`discord_open_venues` tables added earlier tonight — one small dedicated table per concern, not a shared generic "events" table.

`/suggest` and `/clockin` don't need this guard — both are already naturally rate-limited (a suggestion is a visible, moderatable action; a real clock-in requires a real scheduled shift).

Bot's own reactions, and reactions from other bots, are ignored (`reaction.message.author.bot` / the reacting user's `.bot` flag both checked).

### Spend catalog (v1: exactly two perks)

- **XP Boost** (slug `xp_boost`) **— 500 Gil.** Doubles XP earned for 1 hour. Adds `xpBoostExpiresAt DateTime?` to `DiscordMember`. `messageXp()`'s caller in `messageCreate.ts` checks `now < xpBoostExpiresAt` and doubles `earned` if so. **Stacking rule: buying while one is active extends the timer** — new expiry is `max(now, currentExpiry) + 1h`, never resets or rejects.
- **Cooldown Skip** (slug `cooldown_skip`) **— 100 Gil.** Bypasses the existing 60-second chat-XP cooldown once. Adds `cooldownSkips Int @default(0)` to `DiscordMember`. The cooldown is currently tracked in an **in-memory `Map`** in `messageCreate.ts` (not the DB) — when a message would be blocked by that in-memory check, the handler queries `cooldownSkips` for that user; if `> 0`, decrement it, let the message earn XP anyway, and still update the in-memory cooldown timestamp to now (so the *next* message still respects the normal 60s window — a skip consumes exactly one block, not the whole cooldown system). If `cooldownSkips` is `0`, the message is blocked as today, no DB write.
- Skips stack freely, no cap on banked count.

### New command

`/gil shop` — lists the two perks and their costs. `/gil buy <perk>` — attempts the purchase: checks `DiscordMember.gil >= cost`, decrements Gil, applies the perk's effect (sets `xpBoostExpiresAt` or increments `cooldownSkips`) in one transaction. Insufficient balance → ephemeral error, no partial deduction. Existing `/rank` and `/myprofile` already display the Gil balance — no new display surface needed for that.

## Data model changes

On `apps/eorzea-bot/prisma/schema.prisma`:
- New model `GilReactionReward` (see above)
- `DiscordMember` gains `xpBoostExpiresAt DateTime?` and `cooldownSkips Int @default(0)`
- `DiscordMember.gil` (already exists, currently unused) becomes the live balance

### Retroactive launch bonus

One-time backfill, run manually after deploy (not an automated migration): every row in
`discord_members` with `xp > 0` gets a flat **+200 Gil** — `UPDATE discord_members SET gil = gil + 200 WHERE xp > 0`. Members with `xp = 0` (onboarding/role-assignment rows with no real activity) are skipped. This is a one-shot operation, not a recurring job — run once, verify the row count matches expectations, done.

## Error handling

- Reacting to a message that isn't a tracked bot embed in the Tonight/Events channels → ignored, no error, no Gil.
- Bot/other-bot reactions → ignored.
- `/gil buy` with insufficient balance → ephemeral "not enough Gil" message, nothing charged.
- Un-reacting never claws back Gil already paid out — one-way award, matching the rest of the XP system's lack of undo.
- The `cooldownSkips` DB check only runs on the already-rare "message would be blocked by cooldown" branch — added query cost is bounded to users actively chatting faster than once per 60s, not every message.

## Testing / rollout

No automated test suite in this codebase — verify manually:
- React to a live Tonight post, confirm `+25 Gil` on `/myprofile`; react/unreact/react again on the *same* message, confirm no second payout.
- Submit `/suggest`, confirm `+50 Gil`.
- Run `/clockin` against a real or test shift, confirm `+100 Gil` on the real success path; confirm the `alreadyActive` no-op path awards nothing.
- `/gil buy xp_boost`, confirm `xpBoostExpiresAt` is set and the next chat message awards double XP; buy again before it expires, confirm the timer extends rather than resets.
- `/gil buy cooldown_skip`, chat immediately (inside the normal 60s window), confirm XP is awarded anyway and `cooldownSkips` decrements by exactly 1.
- Attempt `/gil buy` with insufficient Gil, confirm the ephemeral error and no balance change.
- After the retroactive backfill runs, spot-check a member with `xp > 0` gained exactly 200 Gil, and a member with `xp = 0` (if one exists) gained none.
- Attempt `/gil buy` with insufficient Gil, confirm the ephemeral error and no balance change.
