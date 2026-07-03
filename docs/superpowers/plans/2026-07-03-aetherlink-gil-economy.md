# Aetherlink Gil Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the dormant `DiscordMember.gil` column into a working cosmetic currency — earned via 3 Discord-native triggers (Tonight/Events reactions, `/suggest`, `/clockin`), spendable on 2 perks (XP Boost, Cooldown Skip) via a new `/gil` command, plus a one-time retroactive launch bonus.

**Architecture:** All state lives in the bot's own Postgres tables (`discord_members` gains 2 columns, plus a new `discord_gil_reaction_rewards` dedup table). A shared `utils/gil.ts` module centralizes award/spend logic so the 3 earn hooks and 2 spend paths don't duplicate raw SQL. The chat-XP cooldown (currently an in-memory `Map` in `messageCreate.ts`) gets a DB-backed skip-token check on its existing block branch; the chat-XP amount gets a DB-backed boost check before award.

**Tech Stack:** discord.js v14 (Partials required for reactions on old messages — not currently configured, added in Task 3), Prisma raw SQL against the bot's own schema (matching this project's established `prisma db push` / raw-DDL convention, no `prisma migrate`).

---

## File Structure

- **Modify:** `apps/eorzea-bot/prisma/schema.prisma` — new `GilReactionReward` model, 2 new `DiscordMember` columns
- **Create:** `apps/eorzea-bot/src/utils/gil.ts` — `awardGil`, `hasActiveXpBoost`, `consumeCooldownSkip`, `buyXpBoost`, `buyCooldownSkip`
- **Create:** `apps/eorzea-bot/src/events/messageReactionAdd.ts` — Tonight/Events reaction earn hook
- **Modify:** `apps/eorzea-bot/src/index.ts` — add `Partials` config (required for reactions on old/uncached messages)
- **Modify:** `apps/eorzea-bot/src/commands/community/suggest.ts` — `/suggest` earn hook
- **Modify:** `apps/eorzea-bot/src/commands/venue/clockin.ts` — `/clockin` earn hook
- **Modify:** `apps/eorzea-bot/src/events/messageCreate.ts` — XP boost multiplier + cooldown skip consumption
- **Create:** `apps/eorzea-bot/src/commands/economy/gil.ts` — `/gil shop` and `/gil buy <perk>`

---

## Task 1: Schema changes

**Files:**
- Modify: `apps/eorzea-bot/prisma/schema.prisma`

- [ ] **Step 1: Add the new columns to `DiscordMember` and the new `GilReactionReward` model**

Find the `DiscordMember` model and add two fields after `gil`:

```prisma
model DiscordMember {
  id                String    @id @default(cuid())
  discordId         String    @unique
  guildId           String
  xp                Int       @default(0)
  level             Int       @default(1)
  gil               Int       @default(0)
  xpBoostExpiresAt  DateTime?
  cooldownSkips     Int       @default(0)
  warns             Int       @default(0)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@map("discord_members")
}
```

Add a new model after `OpenVenue` (the last model in the file):

```prisma
model GilReactionReward {
  id        String   @id @default(cuid())
  discordId String
  messageId String
  createdAt DateTime @default(now())

  @@unique([discordId, messageId])
  @@map("discord_gil_reaction_rewards")
}
```

- [ ] **Step 2: Regenerate the Prisma client locally**

```bash
cd apps/eorzea-bot && npx prisma generate
```
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 3: Commit**

```bash
cd /path/to/worktree
git add apps/eorzea-bot/prisma/schema.prisma
git commit -m "feat(bot): add Gil economy schema (xpBoostExpiresAt, cooldownSkips, GilReactionReward)"
```

(Applying the matching DDL to the production DB is a deploy step — see Task 8. Do not run `prisma db push` or `prisma migrate` against prod, matching this project's established convention.)

---

## Task 2: Gil helper module

**Files:**
- Create: `apps/eorzea-bot/src/utils/gil.ts`

- [ ] **Step 1: Write the module**

```typescript
import prisma from './prisma.js';

/**
 * Award Gil to a member, creating their discord_members row if it doesn't
 * exist yet (same upsert pattern messageCreate.ts uses for XP — a member
 * can earn Gil via reaction/suggest/clockin before ever sending a chat
 * message, so the row may not exist).
 */
export async function awardGil(discordId: string, guildId: string, amount: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO discord_members ("discordId", "guildId", gil)
    VALUES (${discordId}, ${guildId}, ${amount})
    ON CONFLICT ("discordId") DO UPDATE
      SET gil = discord_members.gil + ${amount},
          "updatedAt" = NOW()
  `;
}

/**
 * True if this member currently has an active XP boost. Used by
 * messageCreate.ts to decide whether to double the chat-XP award.
 */
export async function hasActiveXpBoost(discordId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ active: boolean }[]>`
    SELECT ("xpBoostExpiresAt" IS NOT NULL AND "xpBoostExpiresAt" > NOW()) AS active
    FROM discord_members WHERE "discordId" = ${discordId}
  `;
  return rows[0]?.active ?? false;
}

/**
 * Attempt to consume one banked cooldown skip. Returns true if one was
 * available and consumed (caller should let the message earn XP despite
 * being on cooldown), false if none were available (caller should block
 * as normal).
 */
export async function consumeCooldownSkip(discordId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ cooldownSkips: number }[]>`
    UPDATE discord_members
    SET "cooldownSkips" = "cooldownSkips" - 1
    WHERE "discordId" = ${discordId} AND "cooldownSkips" > 0
    RETURNING "cooldownSkips"
  `;
  return rows.length > 0;
}

const XP_BOOST_COST = 500;
const COOLDOWN_SKIP_COST = 100;

/**
 * Spend 500 Gil on an XP boost. Extends the timer if one is already
 * active (max(now, currentExpiry) + 1h), never resets or rejects a
 * stacked purchase. Returns true if the purchase succeeded (had enough
 * Gil), false if the balance was insufficient (no row updated, no charge).
 */
export async function buyXpBoost(discordId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE discord_members
    SET "xpBoostExpiresAt" = GREATEST(COALESCE("xpBoostExpiresAt", NOW()), NOW()) + INTERVAL '1 hour',
        gil = gil - ${XP_BOOST_COST},
        "updatedAt" = NOW()
    WHERE "discordId" = ${discordId} AND gil >= ${XP_BOOST_COST}
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Spend 100 Gil on one banked cooldown skip. Returns true if the
 * purchase succeeded, false if the balance was insufficient.
 */
export async function buyCooldownSkip(discordId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE discord_members
    SET "cooldownSkips" = "cooldownSkips" + 1,
        gil = gil - ${COOLDOWN_SKIP_COST},
        "updatedAt" = NOW()
    WHERE "discordId" = ${discordId} AND gil >= ${COOLDOWN_SKIP_COST}
    RETURNING id
  `;
  return rows.length > 0;
}

export { XP_BOOST_COST, COOLDOWN_SKIP_COST };
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/eorzea-bot/src/utils/gil.ts
git commit -m "feat(bot): add Gil award/spend helper module"
```

---

## Task 3: Reaction earn hook (Tonight/Events)

**Files:**
- Create: `apps/eorzea-bot/src/events/messageReactionAdd.ts`
- Modify: `apps/eorzea-bot/src/index.ts`

- [ ] **Step 1: Add Partials to the Discord client**

Reactions on messages the bot hasn't seen since its last restart arrive as "partial" objects and are silently dropped unless Partials are configured — Tonight/Events messages live for hours to days, so this is required, not optional. Modify `apps/eorzea-bot/src/index.ts`:

```typescript
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { BotClient } from './types/index.js';
import { loadCommands } from './handlers/commandHandler.js';
import { loadEvents } from './handlers/eventHandler.js';
import { startWebhookServer } from './webhook/server.js';
import { startShiftReminder } from './jobs/shiftReminder.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
}) as BotClient;
```

(Only the `intents:` array gains a sibling `partials:` key — everything else in the file is unchanged.)

- [ ] **Step 2: Write the reaction handler**

```typescript
import { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import prisma from '../utils/prisma.js';
import { awardGil } from '../utils/gil.js';

const REACTION_GIL_AMOUNT = 25;

export default {
  name: 'messageReactionAdd',
  once: false,
  async execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    if (user.bot) return;

    const tonightChannelId = process.env.TONIGHT_CHANNEL_ID;
    const eventsChannelId = process.env.EVENTS_FEED_CHANNEL_ID;
    const channelId = reaction.message.channelId;
    if (channelId !== tonightChannelId && channelId !== eventsChannelId) return;

    if (reaction.partial) {
      await reaction.fetch().catch(() => null);
    }
    const message = reaction.message.partial
      ? await reaction.message.fetch().catch(() => null)
      : reaction.message;
    if (!message) return;
    if (!message.author?.bot) return; // only our own bot-posted embeds pay out

    const guildId = message.guildId;
    if (!guildId) return;

    try {
      await prisma.gilReactionReward.create({
        data: { discordId: user.id, messageId: message.id },
      });
    } catch (err) {
      const isUniqueViolation = (err as { code?: string }).code === 'P2002';
      if (!isUniqueViolation) console.error('[Gil] Reaction reward insert failed:', err);
      return; // already rewarded for this message (or a real error — either way, no double-pay)
    }

    await awardGil(user.id, guildId, REACTION_GIL_AMOUNT);
  },
};
```

- [ ] **Step 3: Verify it compiles**

```bash
cd apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/eorzea-bot/src/index.ts apps/eorzea-bot/src/events/messageReactionAdd.ts
git commit -m "feat(bot): award Gil for reacting to Tonight/Events posts"
```

---

## Task 4: `/suggest` earn hook

**Files:**
- Modify: `apps/eorzea-bot/src/commands/community/suggest.ts`

- [ ] **Step 1: Add the Gil award after the suggestion posts successfully**

Add the import at the top:
```typescript
import { awardGil } from '../../utils/gil.js';
```

Find:
```typescript
    const msg = await channel.send({ embeds: [embed] });
    await msg.react('👍');
    await msg.react('👎');

    await interaction.editReply({ content: 'Your suggestion has been submitted!' });
```

Change to:
```typescript
    const msg = await channel.send({ embeds: [embed] });
    await msg.react('👍');
    await msg.react('👎');

    if (interaction.guildId) {
      await awardGil(interaction.user.id, interaction.guildId, 50).catch(() => null);
    }

    await interaction.editReply({ content: 'Your suggestion has been submitted!' });
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/eorzea-bot/src/commands/community/suggest.ts
git commit -m "feat(bot): award Gil for submitting a suggestion"
```

---

## Task 5: `/clockin` earn hook

**Files:**
- Modify: `apps/eorzea-bot/src/commands/venue/clockin.ts`

- [ ] **Step 1: Add the Gil award on the real success path only (not the `alreadyActive` no-op)**

Add the import at the top:
```typescript
import { awardGil } from '../../utils/gil.js';
```

Find:
```typescript
    if (data.alreadyActive) {
      await interaction.editReply({
        content: `✅ You're already clocked in at **${data.venueName}** since ${fmt(data.actualStart)} ST.`,
      });
      return;
    }

    const embed = new EmbedBuilder()
```

Change to:
```typescript
    if (data.alreadyActive) {
      await interaction.editReply({
        content: `✅ You're already clocked in at **${data.venueName}** since ${fmt(data.actualStart)} ST.`,
      });
      return;
    }

    if (interaction.guildId) {
      await awardGil(interaction.user.id, interaction.guildId, 100).catch(() => null);
    }

    const embed = new EmbedBuilder()
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/eorzea-bot/src/commands/venue/clockin.ts
git commit -m "feat(bot): award Gil for a successful /clockin"
```

---

## Task 6: XP boost + cooldown skip application

**Files:**
- Modify: `apps/eorzea-bot/src/events/messageCreate.ts`

- [ ] **Step 1: Wire in the boost check and skip consumption**

Add the import at the top:
```typescript
import { hasActiveXpBoost, consumeCooldownSkip } from '../utils/gil.js';
```

Find:
```typescript
    const now = Date.now();
    const last = cooldowns.get(message.author.id) ?? 0;
    if (now - last < COOLDOWN_MS) return;
    cooldowns.set(message.author.id, now);

    const earned = messageXp();
```

Change to:
```typescript
    const now = Date.now();
    const last = cooldowns.get(message.author.id) ?? 0;
    if (now - last < COOLDOWN_MS) {
      const skipped = await consumeCooldownSkip(message.author.id);
      if (!skipped) return;
    }
    cooldowns.set(message.author.id, now);

    let earned = messageXp();
    if (await hasActiveXpBoost(message.author.id)) {
      earned *= 2;
    }
```

This keeps the in-memory `cooldowns` Map as the source of truth for pacing (a skip consumes exactly one block, not the whole cooldown system — the timestamp still updates to `now`, so the *next* message still needs to wait out the normal 60s window unless another skip is banked). The `hasActiveXpBoost`/`consumeCooldownSkip` DB calls only run when relevant: the boost check runs on every message that gets this far (already gated by the cooldown check above), and the skip check only runs on the already-rare "message would be blocked" branch.

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/eorzea-bot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/eorzea-bot/src/events/messageCreate.ts
git commit -m "feat(bot): apply XP boost multiplier and cooldown skip consumption"
```

---

## Task 7: `/gil shop` and `/gil buy` command

**Files:**
- Create: `apps/eorzea-bot/src/commands/economy/gil.ts`

- [ ] **Step 1: Write the command**

```typescript
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { buyXpBoost, buyCooldownSkip, XP_BOOST_COST, COOLDOWN_SKIP_COST } from '../../utils/gil.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gil')
    .setDescription('Spend your Gil')
    .addSubcommand(sub =>
      sub.setName('shop').setDescription('See what you can buy with Gil')
    )
    .addSubcommand(sub =>
      sub.setName('buy')
        .setDescription('Buy a perk with Gil')
        .addStringOption(o =>
          o.setName('perk')
            .setDescription('Which perk to buy')
            .setRequired(true)
            .addChoices(
              { name: `XP Boost (${XP_BOOST_COST} Gil) — 2x XP for 1 hour`, value: 'xp_boost' },
              { name: `Cooldown Skip (${COOLDOWN_SKIP_COST} Gil) — bypass one chat-XP cooldown`, value: 'cooldown_skip' },
            )
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'shop') {
      const embed = new EmbedBuilder()
        .setColor(0x00b4ff)
        .setTitle('🛒 Gil Shop')
        .addFields(
          { name: `XP Boost — ${XP_BOOST_COST} Gil`, value: '2x XP for 1 hour. Buying while one is active extends the timer.', inline: false },
          { name: `Cooldown Skip — ${COOLDOWN_SKIP_COST} Gil`, value: 'Bypasses one chat-XP cooldown. Skips stack, no cap.', inline: false },
        )
        .setFooter({ text: 'Use /gil buy <perk> to purchase' });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // sub === 'buy'
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const perk = interaction.options.getString('perk', true);

    if (perk === 'xp_boost') {
      const bought = await buyXpBoost(interaction.user.id);
      await interaction.editReply({
        content: bought
          ? `✨ XP Boost purchased! 2x XP for the next hour.`
          : `⚠️ Not enough Gil — XP Boost costs ${XP_BOOST_COST} Gil.`,
      });
      return;
    }

    if (perk === 'cooldown_skip') {
      const bought = await buyCooldownSkip(interaction.user.id);
      await interaction.editReply({
        content: bought
          ? `✨ Cooldown Skip purchased! Your next message will earn XP even on cooldown.`
          : `⚠️ Not enough Gil — Cooldown Skip costs ${COOLDOWN_SKIP_COST} Gil.`,
      });
      return;
    }

    await interaction.editReply({ content: 'Unknown perk.' });
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
git add apps/eorzea-bot/src/commands/economy/gil.ts
git commit -m "feat(bot): add /gil shop and /gil buy commands"
```

---

## Task 8: Deploy, backfill, and manually verify

- [ ] **Step 1: Backup before touching the production database**

```bash
ssh server@192.168.1.122 "docker exec postgres pg_dump -U postgres venue_manager > ~/backups/venue_manager-pre-\$(date +%Y%m%d-%H%M%S)-gil-economy.sql"
```

- [ ] **Step 2: Apply the schema DDL to production**

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c \"
ALTER TABLE discord_members
  ADD COLUMN IF NOT EXISTS \\\"xpBoostExpiresAt\\\" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS \\\"cooldownSkips\\\" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS discord_gil_reaction_rewards (
  id TEXT PRIMARY KEY,
  \\\"discordId\\\" TEXT NOT NULL,
  \\\"messageId\\\" TEXT NOT NULL,
  \\\"createdAt\\\" TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (\\\"discordId\\\", \\\"messageId\\\")
);\""
```

- [ ] **Step 3: Verify the DDL landed**

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c '\d discord_members' -c '\d discord_gil_reaction_rewards'"
```
Expected: `discord_members` shows `xpBoostExpiresAt` and `cooldownSkips` columns; `discord_gil_reaction_rewards` exists with a unique constraint on `(discordId, messageId)`.

- [ ] **Step 4: Deploy the bot**

```bash
ssh server@192.168.1.122 "cd ~/xiv-app && git pull && docker compose build eorzea-bot && docker compose up -d eorzea-bot"
```

- [ ] **Step 5: Register the new `/gil` command with Discord**

```bash
ssh server@192.168.1.122 "docker compose -f ~/xiv-app/docker-compose.yml exec eorzea-bot node dist/deploy-commands.js"
```
Expected: `[Deploy] Registered N commands` where N includes the new `/gil` command (17 total, up from 16 after tonight's `/clockin`/`/clockout` addition).

- [ ] **Step 6: Run the retroactive launch bonus**

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c \"UPDATE discord_members SET gil = gil + 200 WHERE xp > 0 RETURNING \\\"discordId\\\", gil;\""
```
Note how many rows were updated — this is a one-shot operation, do not re-run it (re-running would grant the bonus twice to everyone).

- [ ] **Step 7: Verify the reaction earn path**

React to the live `#tonight` post (or an `#events` day-message) with any emoji. Check the bot logs for no errors:
```bash
ssh server@192.168.1.122 "docker logs eorzea-bot --since 1m 2>&1"
```
Then confirm via `/myprofile` or a direct DB check that Gil increased by 25. React/unreact/react again on the *same* message and confirm Gil does NOT increase a second time.

- [ ] **Step 8: Verify `/suggest` and `/clockin` earn paths**

Submit `/suggest` with any text, confirm +50 Gil. Run `/clockin` against a real or test shift (same pattern as tonight's clock-in/out verification — create a throwaway `SCHEDULED` shift if no real one is available, delete it after), confirm +100 Gil on success and no Gil on an `alreadyActive` re-run.

- [ ] **Step 9: Verify `/gil shop` and `/gil buy`**

Run `/gil shop`, confirm both perks display with correct costs. Run `/gil buy perk:xp_boost`, confirm the Gil balance drops by 500 and the next chat message (after waiting out or skipping the normal cooldown) earns double XP. Run `/gil buy perk:xp_boost` again immediately, confirm it succeeds again (extends, doesn't reject) if balance allows. Run `/gil buy perk:cooldown_skip`, chat immediately (inside the 60s window), confirm XP is awarded anyway.

- [ ] **Step 10: Verify insufficient-balance handling**

With a low-balance test account (or after spending down), attempt `/gil buy perk:xp_boost`, confirm the ephemeral "not enough Gil" message and no balance change.
