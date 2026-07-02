# Discord Feed Channels (Tonight / Events / What's Happening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three community Discord channels fed by the Aetherlink bot (`eorzea-bot`) — Tonight (venues opening today), Events (7-day lookahead of created/Partake-synced events), and What's Happening (live per-region open/closed venue boards).

**Architecture:** `xiv-app` (the Next.js web app) owns all business data (venues, shifts, events) and triggers Discord posts via fire-and-forget HTTP calls to `eorzea-bot`'s internal webhook server. The bot owns Discord message state — it decides whether to post fresh or edit an existing message, tracked in its own small Postgres tables (bot has its own Prisma schema, separate from `xiv-app`'s, both pointing at the same `venue_manager` database). No changes to `xiv-app`'s schema; two new tables added to the bot's schema.

**Tech Stack:** Next.js 15 (API routes) + Prisma (raw SQL DDL, no migrations — this project applies schema changes via `psql` directly, see `feedback_xiv_app_db_push_workflow`) for `apps/web`; discord.js v14 + Express + Prisma for `apps/eorzea-bot`. No automated test suite exists in either app — verification is manual (curl the cron endpoints, watch the actual Discord channels, query Postgres directly).

**Note on verification style:** Because there's no test framework in this codebase, "write a failing test" steps are replaced with "run this exact command, confirm this exact output" steps throughout. Do not introduce a test framework as part of this plan — out of scope.

---

## Task Group A: Tonight channel

### Task A1: Loosen the tonight-post query and fix the cron time

**Files:**
- Modify: `apps/web/app/api/cron/tonight-post/route.ts`
- Modify: `docker-compose.yml:72` (cron schedule line)

- [ ] **Step 1: Read the current route to confirm line numbers haven't shifted**

Run: `grep -n "scheduledEnd\|scheduledStart\|isActive" apps/web/app/api/cron/tonight-post/route.ts`

Expected: matches the `where` clause shown below, confirming nothing has changed since this plan was written.

- [ ] **Step 2: Rewrite the venue query**

Replace the `prisma.venue.findMany` call's `where` clause (and its nested `shifts.where`) with a today's-calendar-day window instead of a "still covering right now" window:

```typescript
const now = new Date()
const startOfDay = new Date(now)
startOfDay.setUTCHours(0, 0, 0, 0)
const endOfDay = new Date(now)
endOfDay.setUTCHours(23, 59, 59, 999)

const venues = await prisma.venue.findMany({
  where: {
    isActive: true,
    venueType: { not: "TEST_VENUE" },
    shifts: {
      some: {
        status: { in: ["SCHEDULED", "ACTIVE"] },
        scheduledStart: { gte: startOfDay, lte: endOfDay },
      },
    },
  },
  select: {
    name: true,
    slug: true,
    dataCenter: true,
    world: true,
    district: true,
    ward: true,
    plot: true,
    shifts: {
      where: {
        status: { in: ["SCHEDULED", "ACTIVE"] },
        scheduledStart: { gte: startOfDay, lte: endOfDay },
      },
      select: { scheduledStart: true, scheduledEnd: true },
      orderBy: { scheduledStart: "asc" },
      take: 1,
    },
  },
  orderBy: { name: "asc" },
})
```

This drops the old `scheduledEnd: { gte: now }` constraint (which excluded venues that already finished today) and the old `scheduledStart: { lte: endOfDay }`-only lower bound (which had no floor, so it could in theory pick up a shift from days ago still running — not currently possible given shift durations, but the explicit `startOfDay` floor makes the intent unambiguous).

- [ ] **Step 3: Move the cron schedule earlier**

In `docker-compose.yml`, find the line:
```
echo '0 18 * * * curl -s -H \"Authorization: Bearer '$$CRON_SECRET'\" http://venue-manager:3000/api/cron/tonight-post >> /var/log/cron.log 2>&1' >> /etc/crontabs/root &&
```
Change `0 18 * * *` to `0 12 * * *`.

- [ ] **Step 4: Verify manually against real data**

This can't be tested locally against prod data pre-deploy, but confirm the query logic is sound by running it directly against the DB (read-only, safe):

Run:
```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c \"SELECT v.name, s.\\\"scheduledStart\\\", s.status FROM venues v JOIN shifts s ON s.\\\"venueId\\\" = v.id WHERE v.\\\"isActive\\\" AND s.\\\"scheduledStart\\\" >= date_trunc('day', now()) AND s.\\\"scheduledStart\\\" < date_trunc('day', now()) + interval '1 day' AND s.status IN ('SCHEDULED','ACTIVE') ORDER BY s.\\\"scheduledStart\\\";\""
```
Expected: returns every venue with a shift starting today, including ones already completed by wall-clock time — confirming the new query's shape matches what the route will produce.

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app
git add apps/web/app/api/cron/tonight-post/route.ts docker-compose.yml
git commit -m "fix: tonight-post shows venues opening today, not just those still open now

Moves cron from 18:00 to 12:00 UTC (ahead of the 14:00 UTC earliest typical
shift start) and drops the scheduledEnd >= now constraint that was hiding
venues whose shift had already ended by post time."
```

---

## Task Group B: Events digest (7 tracked day-messages)

### Task B1: Add the bot's message-tracking table

**Files:**
- Modify: `apps/eorzea-bot/prisma/schema.prisma`

- [ ] **Step 1: Add the model**

Append to the schema, right after `GuildConfig`:

```prisma
model TrackedMessage {
  key       String   @id
  channelId String
  messageId String
  updatedAt DateTime @updatedAt

  @@map("discord_tracked_messages")
}
```

`key` is a stable string like `events:day-0` or `region:na` — one row per board/digest slot this plan introduces.

- [ ] **Step 2: Apply the DDL directly (this project uses raw SQL, not prisma migrate — see `feedback_xiv_app_db_push_workflow`)**

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c \"
CREATE TABLE IF NOT EXISTS discord_tracked_messages (
  key TEXT PRIMARY KEY,
  \\\"channelId\\\" TEXT NOT NULL,
  \\\"messageId\\\" TEXT NOT NULL,
  \\\"updatedAt\\\" TIMESTAMP NOT NULL DEFAULT now()
);\""
```

- [ ] **Step 3: Verify the table exists**

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c '\\d discord_tracked_messages'"
```
Expected: shows the 4 columns with `key` as primary key.

- [ ] **Step 4: Regenerate the Prisma client locally so TypeScript picks up the new model**

```bash
cd ~/xiv-app/apps/eorzea-bot && npx prisma generate
```
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app
git add apps/eorzea-bot/prisma/schema.prisma
git commit -m "feat(bot): add TrackedMessage table for edited-in-place Discord boards"
```

### Task B2: Add a post-or-edit helper that uses tracked messages

**Files:**
- Modify: `apps/eorzea-bot/src/utils/channels.ts`

- [ ] **Step 1: Add `postOrEditEmbed` alongside the existing `postEmbed`**

```typescript
import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import prisma from './prisma.js';

export async function postEmbed(client: Client, channelId: string, embed: EmbedBuilder): Promise<void> {
  const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel)) {
    console.warn(`[post] Channel ${channelId} not found or not a text channel`);
    return;
  }
  await channel.send({ embeds: [embed] });
  console.log(`[post] Sent embed to #${channel.name}`);
}

export async function postOrEditEmbed(
  client: Client,
  key: string,
  channelId: string,
  embed: EmbedBuilder
): Promise<void> {
  const channel = client.channels.cache.get(channelId) ?? await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel)) {
    console.warn(`[postOrEdit] Channel ${channelId} not found or not a text channel`);
    return;
  }

  const tracked = await prisma.trackedMessage.findUnique({ where: { key } });

  if (tracked) {
    const existing = await channel.messages.fetch(tracked.messageId).catch(() => null);
    if (existing) {
      await existing.edit({ embeds: [embed] });
      console.log(`[postOrEdit] Edited ${key} in #${channel.name}`);
      return;
    }
    console.warn(`[postOrEdit] Tracked message for ${key} missing (deleted?) — reposting`);
  }

  const sent = await channel.send({ embeds: [embed] });
  await prisma.trackedMessage.upsert({
    where: { key },
    create: { key, channelId, messageId: sent.id },
    update: { channelId, messageId: sent.id },
  });
  console.log(`[postOrEdit] Posted fresh ${key} to #${channel.name}`);
}
```

This is the "message not found → repost and store new ID" fallback the spec calls for under Error handling.

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/xiv-app/apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/eorzea-bot/src/utils/channels.ts
git commit -m "feat(bot): add postOrEditEmbed for tracked, edited-in-place boards"
```

### Task B3: Add the events-digest embed builder

**Files:**
- Modify: `apps/eorzea-bot/src/utils/embeds.ts`

- [ ] **Step 1: Add `eventsDigestDayEmbed`**

Append (matching the existing `fmtTime`/`fmtDate`/`XIV_BLUE`/`SITE` conventions already in this file):

```typescript
export function eventsDigestDayEmbed(
  dayLabel: string,
  events: { title: string; startTime: Date; venue: { name: string; slug: string } }[],
  truncatedCount: number
) {
  if (events.length === 0) {
    return new EmbedBuilder()
      .setColor(XIV_BLUE)
      .setTitle(`📅 Events — ${dayLabel}`)
      .setDescription('Nothing scheduled.')
      .setFooter({ text: 'XIV Venue Manager · All times Server Time (UTC)' })
      .setTimestamp();
  }

  const fields = events.map(e => ({
    name: e.venue.name,
    value: `[${e.title}](${SITE}/venues/${e.venue.slug}) · ${fmtTime(e.startTime)} ST`,
    inline: false,
  }));

  const embed = new EmbedBuilder()
    .setColor(XIV_BLUE)
    .setTitle(`📅 Events — ${dayLabel}`)
    .addFields(fields)
    .setFooter({ text: 'XIV Venue Manager · All times Server Time (UTC)' })
    .setTimestamp();

  if (truncatedCount > 0) {
    embed.setDescription(`+${truncatedCount} more event${truncatedCount !== 1 ? 's' : ''} today not shown.`);
  }

  return embed;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/xiv-app/apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/eorzea-bot/src/utils/embeds.ts
git commit -m "feat(bot): add eventsDigestDayEmbed builder"
```

### Task B4: Add the bot's events-digest webhook endpoint

**Files:**
- Modify: `apps/eorzea-bot/src/webhook/server.ts`

- [ ] **Step 1: Add the import and the new route**

Add `eventsDigestDayEmbed` to the existing import from `../utils/embeds.js`, add `postOrEditEmbed` to the import from `../utils/channels.js`, then add:

```typescript
const EVENTS_CHANNEL_DIGEST = process.env.EVENTS_FEED_CHANNEL_ID!;

app.post('/webhook/events-digest', async (req, res) => {
  const { dayOffset, dayLabel, events, truncatedCount } = req.body as {
    dayOffset: number
    dayLabel: string
    events: { title: string; startTime: string; venue: { name: string; slug: string } }[]
    truncatedCount: number
  };
  const parsed = events.map(e => ({ ...e, startTime: new Date(e.startTime) }));
  await postOrEditEmbed(
    client,
    `events:day-${dayOffset}`,
    EVENTS_CHANNEL_DIGEST,
    eventsDigestDayEmbed(dayLabel, parsed, truncatedCount)
  );
  res.json({ ok: true });
});
```

Place this near the existing `/webhook/event-live` route for locality.

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/xiv-app/apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/eorzea-bot/src/webhook/server.ts
git commit -m "feat(bot): add /webhook/events-digest endpoint"
```

### Task B5: Add the web-side trigger function

**Files:**
- Modify: `apps/web/lib/discord-feed.ts`

- [ ] **Step 1: Add `postEventsDigestDay`**

Append, matching the existing `postToBot`-based export style in this file:

```typescript
export function postEventsDigestDay(
  dayOffset: number,
  dayLabel: string,
  events: { title: string; startTime: Date; venue: { name: string; slug: string } }[],
  truncatedCount: number
) {
  postToBot('/webhook/events-digest', {
    dayOffset,
    dayLabel,
    truncatedCount,
    events: events.map(e => ({ ...e, startTime: e.startTime.toISOString() })),
  })
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit
```
Expected: no new errors introduced by this change (pre-existing unrelated errors, if any, are not this task's concern).

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/web/lib/discord-feed.ts
git commit -m "feat(web): add postEventsDigestDay trigger"
```

### Task B6: Add the events-digest cron route

**Files:**
- Create: `apps/web/app/api/cron/events-digest-post/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { postEventsDigestDay } from "@/lib/discord-feed"

const MAX_EVENTS_PER_DAY = 20

/**
 * Cron Job: Rebuild the 7 day-messages in the Events channel — one message
 * per calendar day (today through +6), listing every event (manually created
 * or Partake-synced) starting that day. Edited in place, not reposted.
 *
 * Should run every 15 minutes.
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const now = new Date()

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const dayStart = new Date(now)
    dayStart.setUTCDate(dayStart.getUTCDate() + dayOffset)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setUTCHours(23, 59, 59, 999)

    const events = await prisma.event.findMany({
      where: {
        startTime: { gte: dayStart, lte: dayEnd },
        status: { in: ["PUBLISHED", "ACTIVE"] },
      },
      select: {
        title: true,
        startTime: true,
        venue: { select: { name: true, slug: true } },
      },
      orderBy: { startTime: "asc" },
    })

    const dayLabel = dayStart.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    })

    const shown = events.slice(0, MAX_EVENTS_PER_DAY)
    const truncatedCount = events.length - shown.length

    postEventsDigestDay(dayOffset, dayLabel, shown, truncatedCount)
  }

  return NextResponse.json({ success: true, timestamp: now.toISOString() })
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/web/app/api/cron/events-digest-post/route.ts
git commit -m "feat(web): add events-digest-post cron route"
```

### Task B7: Wire the new cron into docker-compose and bot env

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add the crontab line**

In the `cron-jobs` service command block, add a new line alongside the existing ones (every 15 min, offset from `post-partake-events` to avoid both hitting the DB at the exact same second):

```
echo '5,20,35,50 * * * * curl -s -H \"Authorization: Bearer '$$CRON_SECRET'\" http://venue-manager:3000/api/cron/events-digest-post >> /var/log/cron.log 2>&1' >> /etc/crontabs/root &&
```

- [ ] **Step 2: Confirm `EVENTS_FEED_CHANNEL_ID` is already set for the bot container**

This env var already exists (confirmed via `docker exec eorzea-bot printenv` during investigation — value `1509618674514923700`), so no new env var is needed; the new webhook route in Task B4 reuses it.

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add docker-compose.yml
git commit -m "chore: schedule events-digest-post cron every 15 min"
```

### Task B8: Deploy and manually verify

- [ ] **Step 1: Deploy**

```bash
ssh server@192.168.1.122 "cd ~/xiv-app && git pull && docker compose build venue-manager eorzea-bot && docker compose up -d venue-manager eorzea-bot cron-jobs"
```

- [ ] **Step 2: Apply the DDL on prod if not already done in Task B1**

(Already done in Task B1 Step 2 — this is the same server/database, no separate prod step needed.)

- [ ] **Step 3: Trigger the cron manually and confirm 7 messages appear**

```bash
ssh server@192.168.1.122 "curl -s -H \"Authorization: Bearer \$CRON_SECRET\" http://localhost:3000/api/cron/events-digest-post"
```
Expected: `{"success":true,"timestamp":"..."}`. Then check the Events Discord channel — 7 messages should appear (or be edited if already present), one per day, each titled `📅 Events — <Weekday>, <Day> <Month>`.

- [ ] **Step 4: Confirm editing works, not reposting**

Run the same curl again immediately.
Expected: the 7 messages in Discord update in place (same message IDs, new `editedAt` timestamp shown by Discord) — no new messages appear.

---

## Task Group C: What's Happening (per-region live status boards)

### Task C1: Add the bot's open-venue tracking table

**Files:**
- Modify: `apps/eorzea-bot/prisma/schema.prisma`

- [ ] **Step 1: Add the model**

```prisma
model OpenVenue {
  venueId    String   @id
  venueName  String
  dataCenter String
  openedAt   DateTime @default(now())

  @@map("discord_open_venues")
}
```

- [ ] **Step 2: Apply the DDL**

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c \"
CREATE TABLE IF NOT EXISTS discord_open_venues (
  \\\"venueId\\\" TEXT PRIMARY KEY,
  \\\"venueName\\\" TEXT NOT NULL,
  \\\"dataCenter\\\" TEXT NOT NULL,
  \\\"openedAt\\\" TIMESTAMP NOT NULL DEFAULT now()
);\""
```

- [ ] **Step 3: Verify and regenerate client**

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c '\\d discord_open_venues'"
cd ~/xiv-app/apps/eorzea-bot && npx prisma generate
```
Expected: table shows 4 columns; `Generated Prisma Client` with no errors.

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app
git add apps/eorzea-bot/prisma/schema.prisma
git commit -m "feat(bot): add OpenVenue table for live open/closed tracking"
```

### Task C2: Add the data-center-to-region mapping

**Files:**
- Create: `apps/eorzea-bot/src/utils/regions.ts`

- [ ] **Step 1: Write the mapping**

```typescript
export type Region = 'na' | 'eu' | 'jp' | 'oce';

const DATA_CENTER_TO_REGION: Record<string, Region> = {
  Aether: 'na', Crystal: 'na', Dynamis: 'na', Primal: 'na',
  Chaos: 'eu', Light: 'eu',
  Elemental: 'jp', Gaia: 'jp', Mana: 'jp',
  Materia: 'oce',
};

export function regionForDataCenter(dataCenter: string): Region | null {
  return DATA_CENTER_TO_REGION[dataCenter] ?? null;
}

export const REGION_LABELS: Record<Region, string> = {
  na: 'North America',
  eu: 'Europe',
  jp: 'Japan',
  oce: 'Oceania',
};

export function regionChannelId(region: Region): string {
  const envKey = `WHATS_HAPPENING_${region.toUpperCase()}_CHANNEL_ID`;
  const id = process.env[envKey];
  if (!id) throw new Error(`Missing env var ${envKey}`);
  return id;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/xiv-app/apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/eorzea-bot/src/utils/regions.ts
git commit -m "feat(bot): add data-center-to-region mapping for status boards"
```

### Task C3: Add the region-board embed builder

**Files:**
- Modify: `apps/eorzea-bot/src/utils/embeds.ts`

- [ ] **Step 1: Add `regionBoardEmbed`**

```typescript
export function regionBoardEmbed(
  regionLabel: string,
  openVenues: { venueName: string; dataCenter: string; openedAt: Date }[]
) {
  if (openVenues.length === 0) {
    return new EmbedBuilder()
      .setColor(XIV_BLUE)
      .setTitle(`🟢 What's Happening — ${regionLabel}`)
      .setDescription('No venues currently open in this region.')
      .setFooter({ text: 'XIV Venue Manager · Live status' })
      .setTimestamp();
  }

  const lines = openVenues
    .sort((a, b) => a.venueName.localeCompare(b.venueName))
    .map(v => `🟢 **${v.venueName}** (${v.dataCenter}) — open since ${fmtTime(v.openedAt)} ST`);

  return new EmbedBuilder()
    .setColor(XIV_BLUE)
    .setTitle(`🟢 What's Happening — ${regionLabel}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'XIV Venue Manager · Live status' })
    .setTimestamp();
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/xiv-app/apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/eorzea-bot/src/utils/embeds.ts
git commit -m "feat(bot): add regionBoardEmbed builder"
```

### Task C4: Add the bot's venue-status webhook endpoint

**Files:**
- Modify: `apps/eorzea-bot/src/webhook/server.ts`

- [ ] **Step 1: Add imports**

Add `regionBoardEmbed` to the embeds import, `regionForDataCenter`, `REGION_LABELS`, `regionChannelId`, `Region` from `../utils/regions.js`, and `prisma` is already imported.

- [ ] **Step 2: Add the route**

```typescript
app.post('/webhook/venue-status', async (req, res) => {
  const { venueId, venueName, dataCenter, isOpen } = req.body as {
    venueId: string
    venueName: string
    dataCenter: string
    isOpen: boolean
  };

  const region = regionForDataCenter(dataCenter);
  if (!region) {
    console.warn(`[venue-status] Unknown data center "${dataCenter}" for venue ${venueName}, skipping`);
    res.json({ ok: true, skipped: true });
    return;
  }

  const existing = await prisma.openVenue.findUnique({ where: { venueId } });
  const wasOpen = existing !== null;

  if (isOpen === wasOpen) {
    // No transition — a second staff member clocking into an already-open
    // venue, or a clock-out that isn't the last active shift, shouldn't
    // trigger a re-render.
    res.json({ ok: true, changed: false });
    return;
  }

  if (isOpen) {
    await prisma.openVenue.create({ data: { venueId, venueName, dataCenter } });
  } else {
    await prisma.openVenue.delete({ where: { venueId } }).catch(() => null);
  }

  const openInRegion = await prisma.openVenue.findMany({
    where: { dataCenter: { in: dataCentersForRegion(region) } },
  });

  await postOrEditEmbed(
    client,
    `region:${region}`,
    regionChannelId(region),
    regionBoardEmbed(REGION_LABELS[region], openInRegion)
  );

  res.json({ ok: true, changed: true });
});
```

This calls a `dataCentersForRegion` helper — add it to `regions.ts` in the same task (Step 3 below), since `openInRegion` needs to query by the list of data centers belonging to a region, not the region string itself (the DB only knows `dataCenter`, not `region`).

- [ ] **Step 3: Add `dataCentersForRegion` to `regions.ts`**

```typescript
export function dataCentersForRegion(region: Region): string[] {
  return Object.entries(DATA_CENTER_TO_REGION)
    .filter(([, r]) => r === region)
    .map(([dc]) => dc);
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd ~/xiv-app/apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app
git add apps/eorzea-bot/src/webhook/server.ts apps/eorzea-bot/src/utils/regions.ts
git commit -m "feat(bot): add /webhook/venue-status endpoint with transition detection"
```

### Task C5: Add the web-side shared sync helper

**Files:**
- Create: `apps/web/lib/venue-status.ts`
- Modify: `apps/web/lib/discord-feed.ts`

- [ ] **Step 1: Add `postVenueStatus` to `discord-feed.ts`**

```typescript
export function postVenueStatus(venue: { id: string; name: string; dataCenter: string }, isOpen: boolean) {
  postToBot('/webhook/venue-status', {
    venueId: venue.id,
    venueName: venue.name,
    dataCenter: venue.dataCenter,
    isOpen,
  })
}
```

- [ ] **Step 2: Write `venue-status.ts`**

```typescript
import { prisma } from '@/lib/prisma'
import { postVenueStatus } from '@/lib/discord-feed'

/**
 * Call after any shift clock-in/clock-out. Recomputes whether the venue
 * currently has any ACTIVE shift and tells the bot the current state — the
 * bot itself decides whether this is an actual open/close transition worth
 * re-rendering a region board for.
 */
export async function syncVenueOpenStatus(venueId: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, dataCenter: true },
  })
  if (!venue) return

  const activeCount = await prisma.shift.count({
    where: { venueId, status: "ACTIVE" },
  })

  postVenueStatus(venue, activeCount > 0)
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app
git add apps/web/lib/venue-status.ts apps/web/lib/discord-feed.ts
git commit -m "feat(web): add syncVenueOpenStatus shared helper"
```

### Task C6: Wire the sync call into all 5 clock-in/out call sites

**Files:**
- Modify: `apps/web/app/api/plugin/shifts/clock-in/route.ts`
- Modify: `apps/web/app/api/plugin/shifts/clock-out/route.ts`
- Modify: `apps/web/app/api/mobile/my/shifts/[shiftId]/route.ts`
- Modify: `apps/web/app/api/mobile/operator/venues/[venueId]/shifts/[shiftId]/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/shifts/[shiftId]/route.ts`

- [ ] **Step 1: `plugin/shifts/clock-in/route.ts`**

Add the import at the top: `import { syncVenueOpenStatus } from "@/lib/venue-status"`.

Find:
```typescript
    // Queue VENUE_OPENED_NOW notifications for all followers (best-effort)
    queueOpenedNowNotifications(shift.venueId, now).catch(() => {})
```
Add immediately after:
```typescript
    syncVenueOpenStatus(shift.venueId).catch(() => {})
```

- [ ] **Step 2: `plugin/shifts/clock-out/route.ts`**

Add the import. Find:
```typescript
    await logShiftAudit(shift.id, "CLOCK_OUT", auth.userId, "plugin")
    postShiftXp(auth.userId, shift.venueId)
```
Add immediately after:
```typescript
    syncVenueOpenStatus(shift.venueId).catch(() => {})
```

- [ ] **Step 3: `mobile/my/shifts/[shiftId]/route.ts`**

Add the import. Find the clock-in block:
```typescript
    queueOpenedNowNotifications(shift.venue.id, shift.venue.name, now).catch(() => {})
    await logShiftAudit(shift.id, "CLOCK_IN", userId, "mobile_self")
```
Add immediately after:
```typescript
    syncVenueOpenStatus(shift.venue.id).catch(() => {})
```

Find the clock-out block:
```typescript
  await logShiftAudit(shift.id, "CLOCK_OUT", userId, "mobile_self")

  return NextResponse.json({
    success: true,
    shift: { id: shift.id, status: "COMPLETED", actualEnd: now.toISOString(), hoursWorked: calculatedHours },
  })
}
```
Change to:
```typescript
  await logShiftAudit(shift.id, "CLOCK_OUT", userId, "mobile_self")
  syncVenueOpenStatus(shift.venue.id).catch(() => {})

  return NextResponse.json({
    success: true,
    shift: { id: shift.id, status: "COMPLETED", actualEnd: now.toISOString(), hoursWorked: calculatedHours },
  })
}
```

- [ ] **Step 4: `mobile/operator/venues/[venueId]/shifts/[shiftId]/route.ts`**

Add the import. Find the clock-in block:
```typescript
    await logShiftAudit(shift.id, "CLOCK_IN", ctx.userId, "mobile_operator")

    return NextResponse.json({
      success: true,
      shift: { id: shift.id, status: "ACTIVE", actualStart: now.toISOString() },
    })
  }
```
Change to:
```typescript
    await logShiftAudit(shift.id, "CLOCK_IN", ctx.userId, "mobile_operator")
    syncVenueOpenStatus(venueId).catch(() => {})

    return NextResponse.json({
      success: true,
      shift: { id: shift.id, status: "ACTIVE", actualStart: now.toISOString() },
    })
  }
```

Find the equivalent `CLOCK_OUT` line further down in the same file (same `logShiftAudit(shift.id, "CLOCK_OUT", ctx.userId, "mobile_operator")` pattern) and add `syncVenueOpenStatus(venueId).catch(() => {})` immediately after it, same as the clock-in case. (`venueId` is already in scope from the route's destructured params.)

- [ ] **Step 5: `venues/[venueId]/shifts/[shiftId]/route.ts`**

Add the import. Find the clock-in block:
```typescript
      queueOpenedNowNotifications(venue.id, venue.name, now).catch(() => {})
      await logShiftAudit(shift.id, "CLOCK_IN", session.user.id, "web")
```
Add immediately after:
```typescript
      syncVenueOpenStatus(venue.id).catch(() => {})
```

Find the clock-out block:
```typescript
    await logShiftAudit(shift.id, "CLOCK_OUT", session.user.id, "web")

    return NextResponse.json({
      success: true,
      shift: { id: shift.id, status: "COMPLETED", actualEnd: now.toISOString(), hoursWorked: calculatedHours },
    })
```
Change to:
```typescript
    await logShiftAudit(shift.id, "CLOCK_OUT", session.user.id, "web")
    syncVenueOpenStatus(venue.id).catch(() => {})

    return NextResponse.json({
      success: true,
      shift: { id: shift.id, status: "COMPLETED", actualEnd: now.toISOString(), hoursWorked: calculatedHours },
    })
```

- [ ] **Step 6: Verify all 5 files compile**

```bash
cd ~/xiv-app/apps/web && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
cd ~/xiv-app
git add apps/web/app/api/plugin/shifts/clock-in/route.ts \
        apps/web/app/api/plugin/shifts/clock-out/route.ts \
        "apps/web/app/api/mobile/my/shifts/[shiftId]/route.ts" \
        "apps/web/app/api/mobile/operator/venues/[venueId]/shifts/[shiftId]/route.ts" \
        "apps/web/app/api/venues/[venueId]/shifts/[shiftId]/route.ts"
git commit -m "feat(web): notify Discord bot of venue open/close on every clock-in/out path"
```

### Task C7: Add region channel env vars

**Files:**
- Modify: `docker-compose.yml` (eorzea-bot service environment block)
- Modify: `apps/eorzea-bot/.env.example`

- [ ] **Step 1: Add to `docker-compose.yml`'s `eorzea-bot` service environment**

```yaml
      WHATS_HAPPENING_NA_CHANNEL_ID: ${WHATS_HAPPENING_NA_CHANNEL_ID}
      WHATS_HAPPENING_EU_CHANNEL_ID: ${WHATS_HAPPENING_EU_CHANNEL_ID}
      WHATS_HAPPENING_JP_CHANNEL_ID: ${WHATS_HAPPENING_JP_CHANNEL_ID}
      WHATS_HAPPENING_OCE_CHANNEL_ID: ${WHATS_HAPPENING_OCE_CHANNEL_ID}
```

- [ ] **Step 2: Add to `.env.example`**

```
WHATS_HAPPENING_NA_CHANNEL_ID=
WHATS_HAPPENING_EU_CHANNEL_ID=
WHATS_HAPPENING_JP_CHANNEL_ID=
WHATS_HAPPENING_OCE_CHANNEL_ID=
```

- [ ] **Step 3: Create the 4 region channels in Discord (manual, not code)**

In the XIV Venue Manager Discord server, create 4 channels under (or repurposing) the existing "What's Happening" category — one per region, e.g. `#whats-happening-na`, `#whats-happening-eu`, `#whats-happening-jp`, `#whats-happening-oce`. Copy each channel ID (right-click → Copy Channel ID, requires Developer Mode) into the server's real `.env` (not `.env.example`) at `~/xiv-app/.env` on the production host — this is a manual, non-git-tracked value like the other channel IDs already there.

- [ ] **Step 4: Commit the code/example changes (not the real .env, which isn't tracked)**

```bash
cd ~/xiv-app
git add docker-compose.yml apps/eorzea-bot/.env.example
git commit -m "chore: add per-region What's Happening channel env vars"
```

### Task C8: Deploy and manually verify

- [ ] **Step 1: Set the real channel IDs on the server and deploy**

```bash
ssh server@192.168.1.122 "cd ~/xiv-app && git pull && docker compose build venue-manager eorzea-bot && docker compose up -d venue-manager eorzea-bot"
```
(Confirm the 4 `WHATS_HAPPENING_*_CHANNEL_ID` values were added to `~/xiv-app/.env` on the server before this step — Task C7 Step 3.)

- [ ] **Step 2: Pick a real test venue and shift, clock in via the plugin or `/venue` command**

Watch the correct region channel (matching that venue's `dataCenter`). Expected: within a few seconds, a message appears (or an existing one edits) showing 🟢 that venue as open.

- [ ] **Step 3: Clock the same shift out**

Expected: the same region board updates, removing that venue from the list (or shows "No venues currently open" if it was the only one).

- [ ] **Step 4: Confirm no-op on redundant transitions**

Clock a second staff member into an already-open venue (same venue, different shift, both ACTIVE simultaneously). Check `docker logs eorzea-bot` for the `/webhook/venue-status` call.
Expected: log shows `{"ok":true,"changed":false}` in the webhook response — no re-render, no duplicate Discord edit.

---

## Self-review notes

- **Spec coverage:** Tonight (Task A1) ✓, Events 7-day digest with per-day messages (Tasks B1–B8) ✓, What's Happening region boards with transition-only re-renders (Tasks C1–C8) ✓, error-handling fallback for deleted tracked messages (Task B2) ✓.
- **Type consistency:** `syncVenueOpenStatus(venueId: string)` signature matches every call site in Task C6. `postVenueStatus(venue, isOpen)` and `regionForDataCenter`/`dataCentersForRegion`/`regionChannelId` names are used consistently between Task C2, C4, and C5.
- **No scope creep:** Existing per-route duplication of `queueOpenedNowNotifications` (5 separate local copies) is left untouched — not this task's job to refactor. `syncVenueOpenStatus` is introduced as a single shared helper only because it's new code this plan is adding in 5 places; consolidating it is directly in scope, not a bonus refactor.
