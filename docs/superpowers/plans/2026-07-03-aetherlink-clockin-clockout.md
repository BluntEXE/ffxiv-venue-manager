# Aetherlink /clockin and /clockout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/clockin` and `/clockout` slash commands to the Aetherlink Discord bot, letting staff clock in/out of their scheduled shift from Discord — a 6th trigger path that reuses the exact clock-in/out business logic already used by the plugin, mobile, and web routes.

**Architecture:** Bot commands call two new bot-only web API endpoints (`/api/bot/shifts/clock-in`, `/api/bot/shifts/clock-out`), authenticated by a new shared secret (`EORZEA_BOT_API_SECRET`, mirroring the existing reverse-direction `EORZEA_BOT_WEBHOOK_SECRET`). The web endpoints resolve the caller's Discord ID to a `User` via the existing unique `users.discordId` column, then run the same `updateMany` + `logShiftAudit` + `syncVenueOpenStatus` (+`queueOpenedNowNotifications`/`postShiftXp`) sequence already duplicated across the other clock-in/out routes.

**Tech Stack:** Next.js 15 (API routes) + Prisma for `apps/web`; discord.js v14 + Express for `apps/eorzea-bot`. No automated test suite in either app — verification is manual (curl the endpoints directly, then confirm via the real Discord commands).

---

## File Structure

- **Create:** `apps/web/lib/bot-auth.ts` — shared-secret verification for bot→web requests (mirrors `apps/web/lib/cron-auth.ts`)
- **Create:** `apps/web/app/api/bot/shifts/clock-in/route.ts`
- **Create:** `apps/web/app/api/bot/shifts/clock-out/route.ts`
- **Create:** `apps/eorzea-bot/src/commands/venue/clockin.ts`
- **Create:** `apps/eorzea-bot/src/commands/venue/clockout.ts`
- **Modify:** `docker-compose.yml` — add `API_SECRET` and `WEB_APP_URL` to the `eorzea-bot` service's environment block
- **Modify:** `apps/eorzea-bot/.env.example` — document the two new env vars

---

## Task 1: Bot-auth verification helper

**Files:**
- Create: `apps/web/lib/bot-auth.ts`

- [ ] **Step 1: Write the helper**

```typescript
import { NextResponse } from "next/server"
import crypto from "crypto"

/**
 * Validate that a request came from the Aetherlink bot, using timing-safe
 * comparison. Returns null if authorized, or a NextResponse error if not.
 * Mirrors verifyCronAuth in cron-auth.ts, but for bot -> web requests
 * (the reverse direction of the existing EORZEA_BOT_WEBHOOK_SECRET, which
 * is used for web -> bot requests).
 */
export function verifyBotAuth(request: Request): NextResponse | null {
  const botSecret = process.env.EORZEA_BOT_API_SECRET
  if (!botSecret) {
    console.error("EORZEA_BOT_API_SECRET not configured")
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    )
  }

  const provided = request.headers.get("x-bot-secret") ?? ""

  const a = Buffer.from(provided)
  const b = Buffer.from(botSecret)

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/bot-auth.ts
git commit -m "feat(web): add verifyBotAuth for bot-to-web authenticated requests"
```

---

## Task 2: Clock-in endpoint

**Files:**
- Create: `apps/web/app/api/bot/shifts/clock-in/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyBotAuth } from "@/lib/bot-auth"
import { checkPermission } from "@/lib/api/plugin-auth"
import { logShiftAudit } from "@/lib/shift-audit"
import { syncVenueOpenStatus } from "@/lib/venue-status"

const CLOCK_IN_EARLY_MS = 30 * 60 * 1000
const CLOCK_IN_LATE_MS = 60 * 60 * 1000

/**
 * POST /api/bot/shifts/clock-in
 *
 * Called by Aetherlink's /clockin command. Body: { discordId: string }.
 * Finds the caller's one SCHEDULED shift within the clock-in window
 * (30 min before scheduledStart through 60 min after) and starts it —
 * same window and side effects as every other clock-in path.
 */
export async function POST(request: Request) {
  const authError = verifyBotAuth(request)
  if (authError) return authError

  const body = await request.json().catch(() => ({}))
  const discordId = typeof body.discordId === "string" ? body.discordId : null
  if (!discordId) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { discordId } })
  if (!user) {
    return NextResponse.json({ ok: false, code: "NOT_LINKED" })
  }

  const now = new Date()
  const windowStart = new Date(now.getTime() - CLOCK_IN_LATE_MS)
  const windowEnd = new Date(now.getTime() + CLOCK_IN_EARLY_MS)

  const candidates = await prisma.shift.findMany({
    where: {
      membership: { userId: user.id },
      status: "SCHEDULED",
      scheduledStart: { gte: windowStart, lte: windowEnd },
    },
    include: { venue: { select: { id: true, name: true } } },
  })

  const shift = candidates.find((s) => {
    const earliest = new Date(s.scheduledStart.getTime() - CLOCK_IN_EARLY_MS)
    const latest = new Date(s.scheduledStart.getTime() + CLOCK_IN_LATE_MS)
    return now >= earliest && now <= latest
  })

  if (!shift) {
    // Already-active check: distinguish "nothing scheduled" from
    // "you're already clocked in" so the bot can give the friendly
    // no-op message instead of a generic error.
    const active = await prisma.shift.findFirst({
      where: { membership: { userId: user.id }, status: "ACTIVE" },
      include: { venue: { select: { name: true } } },
    })
    if (active) {
      return NextResponse.json({
        ok: true,
        alreadyActive: true,
        venueName: active.venue.name,
        actualStart: active.actualStart?.toISOString() ?? null,
      })
    }
    return NextResponse.json({ ok: false, code: "NO_SHIFT" })
  }

  const canClock = await checkPermission(user.id, shift.venueId, "clock_shift")
  if (!canClock) {
    return NextResponse.json({ ok: false, code: "FORBIDDEN" })
  }

  const writeResult = await prisma.shift.updateMany({
    where: { id: shift.id, status: "SCHEDULED" },
    data: { actualStart: now, status: "ACTIVE" },
  })
  if (writeResult.count === 0) {
    return NextResponse.json({ ok: false, code: "CONFLICT" }, { status: 409 })
  }

  await queueOpenedNowNotifications(shift.venue.id, shift.venue.name, now)
  await logShiftAudit(shift.id, "CLOCK_IN", user.id, "discord")
  syncVenueOpenStatus(shift.venue.id).catch(() => {})

  return NextResponse.json({
    ok: true,
    alreadyActive: false,
    venueName: shift.venue.name,
    actualStart: now.toISOString(),
  })
}

async function queueOpenedNowNotifications(venueId: string, venueName: string, now: Date) {
  const recentlySent = await prisma.pendingNotification.findFirst({
    where: {
      type: "VENUE_OPENED_NOW",
      data: { path: ["venueId"], equals: venueId },
      createdAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
    },
  })
  if (recentlySent) return

  const follows = await prisma.venueFollow.findMany({
    where: { venueId },
    select: { userId: true },
  })
  if (follows.length === 0) return

  await prisma.pendingNotification.createMany({
    data: follows.map((f) => ({
      userId: f.userId,
      type: "VENUE_OPENED_NOW" as const,
      title: `${venueName} is open!`,
      body: "A venue you follow just opened.",
      data: { venueId },
      scheduledFor: now,
    })),
  })
}
```

This duplicates the local `queueOpenedNowNotifications` helper the same way the other 4 clock-in call sites each have their own local copy — matching the established pattern (each fire-and-forget notification queue is file-local, not a shared import, per this codebase's existing convention noted in the discord-feed-channels plan's self-review).

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/bot/shifts/clock-in/route.ts
git commit -m "feat(web): add /api/bot/shifts/clock-in endpoint for Aetherlink"
```

---

## Task 3: Clock-out endpoint

**Files:**
- Create: `apps/web/app/api/bot/shifts/clock-out/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyBotAuth } from "@/lib/bot-auth"
import { checkPermission } from "@/lib/api/plugin-auth"
import { logShiftAudit } from "@/lib/shift-audit"
import { postShiftXp } from "@/lib/discord-feed"
import { syncVenueOpenStatus } from "@/lib/venue-status"

/**
 * POST /api/bot/shifts/clock-out
 *
 * Called by Aetherlink's /clockout command. Body: { discordId: string }.
 * Finds the caller's one ACTIVE shift (at most one, since shifts can't
 * overlap) and completes it.
 */
export async function POST(request: Request) {
  const authError = verifyBotAuth(request)
  if (authError) return authError

  const body = await request.json().catch(() => ({}))
  const discordId = typeof body.discordId === "string" ? body.discordId : null
  if (!discordId) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { discordId } })
  if (!user) {
    return NextResponse.json({ ok: false, code: "NOT_LINKED" })
  }

  const shift = await prisma.shift.findFirst({
    where: { membership: { userId: user.id }, status: "ACTIVE" },
    include: { venue: { select: { id: true, name: true } } },
  })

  if (!shift) {
    return NextResponse.json({ ok: false, code: "NO_SHIFT" })
  }

  const canClock = await checkPermission(user.id, shift.venueId, "clock_shift")
  if (!canClock) {
    return NextResponse.json({ ok: false, code: "FORBIDDEN" })
  }

  const now = new Date()
  const calculatedHours = shift.actualStart
    ? Math.round(((now.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)) * 100) / 100
    : null

  const writeResult = await prisma.shift.updateMany({
    where: { id: shift.id, status: "ACTIVE" },
    data: { actualEnd: now, status: "COMPLETED", hoursWorked: calculatedHours },
  })
  if (writeResult.count === 0) {
    return NextResponse.json({ ok: false, code: "CONFLICT" }, { status: 409 })
  }

  await logShiftAudit(shift.id, "CLOCK_OUT", user.id, "discord")
  postShiftXp(user.id, shift.venueId)
  syncVenueOpenStatus(shift.venueId).catch(() => {})

  return NextResponse.json({
    ok: true,
    venueName: shift.venue.name,
    hoursWorked: calculatedHours,
  })
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/bot/shifts/clock-out/route.ts
git commit -m "feat(web): add /api/bot/shifts/clock-out endpoint for Aetherlink"
```

---

## Task 4: Wire env vars

**Files:**
- Modify: `docker-compose.yml`
- Modify: `apps/eorzea-bot/.env.example`

- [ ] **Step 1: Add to the `eorzea-bot` service's environment block in `docker-compose.yml`**

Find the line `WEBHOOK_SECRET: ${EORZEA_BOT_WEBHOOK_SECRET}` and add immediately after it:

```yaml
      API_SECRET: ${EORZEA_BOT_API_SECRET}
      WEB_APP_URL: "http://venue-manager:3000"
```

- [ ] **Step 2: Add to `apps/eorzea-bot/.env.example`**

```
API_SECRET=
WEB_APP_URL=http://localhost:3000
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml apps/eorzea-bot/.env.example
git commit -m "chore: wire API_SECRET and WEB_APP_URL env vars for bot-to-web calls"
```

Note: the real `EORZEA_BOT_API_SECRET` value on the production server's `.env` (not `.env.example`, not git-tracked) is a manual step — generate a random secret (e.g. `openssl rand -hex 32`) and add it during deploy, same as every other `EORZEA_BOT_*` secret already there.

---

## Task 5: `/clockin` bot command

**Files:**
- Create: `apps/eorzea-bot/src/commands/venue/clockin.ts`

- [ ] **Step 1: Write the command**

```typescript
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

const WEB_APP_URL = process.env.WEB_APP_URL!;
const API_SECRET = process.env.API_SECRET!;

interface ClockInResponse {
  ok: boolean;
  code?: 'NOT_LINKED' | 'NO_SHIFT' | 'FORBIDDEN' | 'CONFLICT' | 'BAD_REQUEST';
  alreadyActive?: boolean;
  venueName?: string;
  actualStart?: string | null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('clockin')
    .setDescription('Clock in to your scheduled shift'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const res = await fetch(`${WEB_APP_URL}/api/bot/shifts/clock-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': API_SECRET,
      },
      body: JSON.stringify({ discordId: interaction.user.id }),
    }).catch(() => null);

    if (!res) {
      await interaction.editReply({ content: '⚠️ Could not reach the server. Try again in a moment.' });
      return;
    }

    const data = (await res.json().catch(() => ({ ok: false }))) as ClockInResponse;

    if (!data.ok) {
      const message = {
        NOT_LINKED: '🔗 Your Discord isn\'t linked to a venue manager account. Link it at **[xivvenuemanager.com/dashboard/account](https://xivvenuemanager.com/dashboard/account)**.',
        NO_SHIFT: '📭 Nothing scheduled to start soon. Shifts can be clocked in 30 minutes before through 60 minutes after their scheduled start.',
        FORBIDDEN: '🚫 You don\'t have permission to clock shifts at this venue.',
        CONFLICT: '⚠️ That shift just changed status — try again.',
        BAD_REQUEST: '⚠️ Something went wrong on our end.',
      }[data.code ?? 'BAD_REQUEST'];
      await interaction.editReply({ content: message });
      return;
    }

    const fmt = (iso: string | null | undefined) =>
      iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '';

    if (data.alreadyActive) {
      await interaction.editReply({
        content: `✅ You're already clocked in at **${data.venueName}** since ${fmt(data.actualStart)} ST.`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setTitle('🟢 Clocked In')
      .setDescription(`You're now clocked in at **${data.venueName}**.`)
      .addFields({ name: 'Started', value: `${fmt(data.actualStart)} ST`, inline: true })
      .setFooter({ text: 'XIV Venue Manager' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/eorzea-bot/src/commands/venue/clockin.ts
git commit -m "feat(bot): add /clockin slash command"
```

---

## Task 6: `/clockout` bot command

**Files:**
- Create: `apps/eorzea-bot/src/commands/venue/clockout.ts`

- [ ] **Step 1: Write the command**

```typescript
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

const WEB_APP_URL = process.env.WEB_APP_URL!;
const API_SECRET = process.env.API_SECRET!;

interface ClockOutResponse {
  ok: boolean;
  code?: 'NOT_LINKED' | 'NO_SHIFT' | 'FORBIDDEN' | 'CONFLICT' | 'BAD_REQUEST';
  venueName?: string;
  hoursWorked?: number | null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('clockout')
    .setDescription('Clock out of your active shift'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const res = await fetch(`${WEB_APP_URL}/api/bot/shifts/clock-out`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': API_SECRET,
      },
      body: JSON.stringify({ discordId: interaction.user.id }),
    }).catch(() => null);

    if (!res) {
      await interaction.editReply({ content: '⚠️ Could not reach the server. Try again in a moment.' });
      return;
    }

    const data = (await res.json().catch(() => ({ ok: false }))) as ClockOutResponse;

    if (!data.ok) {
      const message = {
        NOT_LINKED: '🔗 Your Discord isn\'t linked to a venue manager account. Link it at **[xivvenuemanager.com/dashboard/account](https://xivvenuemanager.com/dashboard/account)**.',
        NO_SHIFT: '📭 You\'re not currently clocked in anywhere.',
        FORBIDDEN: '🚫 You don\'t have permission to clock shifts at this venue.',
        CONFLICT: '⚠️ That shift just changed status — try again.',
        BAD_REQUEST: '⚠️ Something went wrong on our end.',
      }[data.code ?? 'BAD_REQUEST'];
      await interaction.editReply({ content: message });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00b4ff)
      .setTitle('🔴 Clocked Out')
      .setDescription(`You're now clocked out of **${data.venueName}**.`)
      .addFields({ name: 'Hours worked', value: data.hoursWorked != null ? `${data.hoursWorked}h` : 'n/a', inline: true })
      .setFooter({ text: 'XIV Venue Manager' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/eorzea-bot/src/commands/venue/clockout.ts
git commit -m "feat(bot): add /clockout slash command"
```

---

## Task 7: Deploy and manually verify

- [ ] **Step 1: Generate and set the real secret on the production server**

```bash
ssh server@192.168.1.122 "openssl rand -hex 32"
```
Copy the output, then append to the server's `~/xiv-app/.env` (not `.env.example`):
```bash
ssh server@192.168.1.122 "echo 'EORZEA_BOT_API_SECRET=<generated-value>' >> ~/xiv-app/.env"
```

- [ ] **Step 2: Deploy**

```bash
ssh server@192.168.1.122 "cd ~/xiv-app && git pull && docker compose build venue-manager eorzea-bot && docker compose up -d venue-manager eorzea-bot"
```

- [ ] **Step 3: Register the new slash commands with Discord**

The bot auto-loads commands from disk on startup (confirmed via `[Commands] Loaded /...` log lines), but Discord's own command registry needs a separate push via `deploy-commands.ts`:

```bash
ssh server@192.168.1.122 "cd ~/xiv-app && docker compose exec eorzea-bot node dist/deploy-commands.js"
```
Expected: `[Deploy] Registered N commands to guild <id> (instant)` — confirm the count includes the 2 new commands.

- [ ] **Step 4: Verify a linked test account can clock in and out**

Using a Discord account whose `users.discordId` is set and who has a `SCHEDULED` shift starting within the next 30 minutes (create one via the dashboard if needed): run `/clockin` in Discord.

Expected: ephemeral embed "🟢 Clocked In" with the correct venue and start time.

Then confirm in the DB:
```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c \"SELECT status, \\\"actualStart\\\" FROM shifts WHERE id = '<shift-id>';\""
```
Expected: `status = ACTIVE`, `actualStart` set to the current time.

- [ ] **Step 5: Verify the already-active no-op**

Run `/clockin` again immediately.

Expected: "✅ You're already clocked in at **{venue}** since {time} ST." — not an error, no duplicate audit log entry:
```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c \"SELECT count(*) FROM shift_audit_logs WHERE \\\"shiftId\\\" = '<shift-id>' AND action = 'CLOCK_IN';\""
```
Expected: `1`, not `2`.

- [ ] **Step 6: Verify clock-out and the What's Happening board**

Before running `/clockout`, note which region board channel the venue's data center maps to (check `apps/eorzea-bot/src/utils/regions.ts`) and confirm the venue currently shows as open there. Run `/clockout`.

Expected: ephemeral embed "🔴 Clocked Out" with hours worked, and — if this was the venue's only active shift — the region board updates to remove it (or shows "No venues currently open" if it was the only one open).

- [ ] **Step 7: Verify the not-linked path**

Using a Discord account with no `users.discordId` match, run `/clockin`.

Expected: "🔗 Your Discord isn't linked..." message, no shift touched.
