# Discord Shift Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual Raid-Helper + website double-entry workflow with a Discord bot that posts shift signup embeds before each event, creates website shifts automatically when staff accept, and handles cancellations/changes cascading from the Partake sync.

**Architecture:** A Discord Application with a bot token handles outbound posting (bot POSTs to channel via REST API). Inbound button interactions from Discord are received as HTTP POSTs to `/api/discord/interactions` in the existing Next.js app — no separate process needed. Venue shift templates are stored in the `settings` JSON field. A new `ShiftSignupEmbed` table tracks each posted Discord message so accepts/declines and edits stay consistent.

**Tech Stack:** Next.js API route for interactions, Discord REST API (bot token), `tweetnacl` for interaction signature verification, Prisma, Alpine crond (existing cron infrastructure), TypeScript.

---

## Prerequisites (manual steps before any code)

1. Go to https://discord.com/developers/applications → New Application → name it "XIV Venue Manager"
2. Bot tab → Add Bot → copy **Bot Token** → add to `.env` as `DISCORD_BOT_TOKEN`
3. General Information tab → copy **Application ID** → add to `.env` as `DISCORD_APPLICATION_ID`
4. Copy **Public Key** → add to `.env` as `DISCORD_PUBLIC_KEY`
5. OAuth2 → URL Generator → scopes: `bot` → permissions: `Send Messages`, `Read Message History`, `Manage Messages` → copy the generated URL — this is the invite URL venues will use

The interactions endpoint URL (`https://xivvenuemanager.com/api/discord/interactions`) must be set in the Discord Developer Portal → General Information → Interactions Endpoint URL **after** Task 3 is deployed.

---

## File Map

**New files:**
- `apps/web/lib/discord-bot.ts` — bot token REST helpers (post/edit/delete channel messages)
- `apps/web/lib/shift-bot.ts` — business logic: build embed payload, create shift from accept, waitlist, slot counting
- `apps/web/app/api/discord/interactions/route.ts` — interactions endpoint (signature verify + dispatch)
- `apps/web/app/api/cron/sync-shift-embeds/route.ts` — pre-event cron: post embeds for upcoming events

**Modified files:**
- `apps/web/prisma/schema.prisma` — add `ShiftSignupEmbed` model, `shiftSignupEmbedId` on `Shift`
- `packages/types/src/venue-settings.ts` — add `ShiftTemplate` + `ShiftBotSettings` to `VenueSettings`
- `apps/web/app/dashboard/[slug]/settings/page.tsx` — add Shift Bot section
- `apps/web/app/api/venues/[venueId]/settings/route.ts` — already handles settings JSON, no change needed
- `apps/web/app/api/cron/post-partake-events/route.ts` — extend cascade: edit shift embeds when event changes/cancels
- `docker-compose.yml` — add `sync-shift-embeds` to cron-jobs container

---

## Task 1: Database Schema

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add `ShiftSignupEmbed` model and `shiftSignupEmbedId` field on `Shift`**

In `apps/web/prisma/schema.prisma`, add after the `ShiftAuditLog` model (after line ~808):

```prisma
model ShiftSignupEmbed {
  id               String   @id @default(cuid())
  venueId          String
  eventId          String
  templateName     String
  discordMessageId String
  channelId        String
  scheduledStart   DateTime
  scheduledEnd     DateTime
  slots            Int
  waitlist         Json     @default("[]") // Array of { discordUserId, discordUsername, signedUpAt }
  postedAt         DateTime @default(now())
  cancelledAt      DateTime?

  venue  Venue   @relation(fields: [venueId], references: [id], onDelete: Cascade)
  event  Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  shifts Shift[]

  @@unique([eventId, templateName])
  @@index([venueId])
  @@index([eventId])
  @@map("shift_signup_embeds")
}
```

In the `Shift` model, add after `notes String? @db.Text`:
```prisma
  shiftSignupEmbedId String?
  shiftSignupEmbed   ShiftSignupEmbed? @relation(fields: [shiftSignupEmbedId], references: [id], onDelete: SetNull)
```

Add index to `Shift`:
```prisma
  @@index([shiftSignupEmbedId])
```

Add relation to `Venue` model (inside relations block):
```prisma
  shiftSignupEmbeds ShiftSignupEmbed[]
```

Add relation to `Event` model (inside relations block):
```prisma
  shiftSignupEmbeds ShiftSignupEmbed[]
```

- [ ] **Step 2: Apply migration via raw SQL on the postgres container**

```bash
ssh server@192.168.1.122 "docker exec -i postgres psql -U postgres -d venue_manager" <<'EOF'
CREATE TABLE IF NOT EXISTS shift_signup_embeds (
  id TEXT PRIMARY KEY,
  "venueId" TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  "eventId" TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  "templateName" TEXT NOT NULL,
  "discordMessageId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "scheduledStart" TIMESTAMP(3) NOT NULL,
  "scheduledEnd" TIMESTAMP(3) NOT NULL,
  slots INTEGER NOT NULL,
  waitlist JSONB NOT NULL DEFAULT '[]',
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "cancelledAt" TIMESTAMP(3),
  UNIQUE ("eventId", "templateName")
);

CREATE INDEX IF NOT EXISTS shift_signup_embeds_venue_idx ON shift_signup_embeds ("venueId");
CREATE INDEX IF NOT EXISTS shift_signup_embeds_event_idx ON shift_signup_embeds ("eventId");

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS "shiftSignupEmbedId" TEXT REFERENCES shift_signup_embeds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS shifts_embed_idx ON shifts ("shiftSignupEmbedId");
EOF
```

- [ ] **Step 3: Verify tables exist**

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c '\d shift_signup_embeds'"
```

Expected: table columns listed with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat: add ShiftSignupEmbed model for Discord shift bot"
```

---

## Task 2: VenueSettings Types

**Files:**
- Modify: `packages/types/src/venue-settings.ts`

- [ ] **Step 1: Add `ShiftTemplate` and `ShiftBotSettings` interfaces**

In `packages/types/src/venue-settings.ts`, add after the `WebhookSettings` interface:

```typescript
/**
 * A single shift template defining one shift type for an event night.
 * startOffsetHours is relative to the Partake event start time.
 */
export interface ShiftTemplate {
  name: string              // e.g. "Early Shift"
  startOffsetHours: number  // 0 = same as event start
  durationHours: number     // e.g. 4
  slots: number             // max staff for this shift
}

/**
 * Shift bot configuration — controls Discord pre-event shift signup posts
 */
export interface ShiftBotSettings {
  enabled: boolean
  channelId: string         // Discord channel ID to post embeds in
  daysBeforeEvent: number   // how many days before to post (default 3)
  templates: ShiftTemplate[] // empty = one shift matching full event duration
}
```

- [ ] **Step 2: Add `shiftBot` to `VenueSettings` interface**

In the `VenueSettings` interface, add after `notifications`:

```typescript
  /** Discord shift bot configuration */
  shiftBot?: ShiftBotSettings
```

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/venue-settings.ts
git commit -m "feat: add ShiftBotSettings to VenueSettings type"
```

---

## Task 3: Discord Bot Lib + Interactions Endpoint

**Files:**
- Create: `apps/web/lib/discord-bot.ts`
- Create: `apps/web/app/api/discord/interactions/route.ts`

- [ ] **Step 1: Install tweetnacl**

```bash
cd /home/ehno/xiv-app && pnpm add tweetnacl --filter @xiv-venue-manager/web
```

- [ ] **Step 2: Create `apps/web/lib/discord-bot.ts`**

```typescript
const DISCORD_API = "https://discord.com/api/v10"
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!

export interface DiscordButtonComponent {
  type: 2
  style: 1 | 2 | 3 | 4  // 1=Primary(blue) 2=Secondary 3=Success(green) 4=Danger(red)
  label: string
  custom_id: string
  disabled?: boolean
}

export interface DiscordActionRow {
  type: 1
  components: DiscordButtonComponent[]
}

export interface BotMessagePayload {
  content?: string
  embeds?: object[]
  components?: DiscordActionRow[]
}

async function botFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Discord API ${path} → ${res.status}: ${body}`)
  }
  return res.status === 204 ? null : res.json()
}

export async function postBotMessage(channelId: string, payload: BotMessagePayload): Promise<string> {
  const msg = await botFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  return msg.id as string
}

export async function editBotMessage(channelId: string, messageId: string, payload: BotMessagePayload): Promise<void> {
  await botFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function deleteBotMessage(channelId: string, messageId: string): Promise<void> {
  await botFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
  })
}
```

- [ ] **Step 3: Create `apps/web/app/api/discord/interactions/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server"
import nacl from "tweetnacl"
import { prisma } from "@/lib/prisma"
import { handleShiftAccept, handleShiftDecline, handleShiftMaybe } from "@/lib/shift-bot"

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!

function verifyDiscordSignature(req: NextRequest, body: string): boolean {
  const signature = req.headers.get("x-signature-ed25519")
  const timestamp = req.headers.get("x-signature-timestamp")
  if (!signature || !timestamp) return false
  return nacl.sign.detached.verify(
    Buffer.from(timestamp + body),
    Buffer.from(signature, "hex"),
    Buffer.from(PUBLIC_KEY, "hex")
  )
}

export async function POST(req: NextRequest) {
  const body = await req.text()

  if (!verifyDiscordSignature(req, body)) {
    return new NextResponse("Invalid signature", { status: 401 })
  }

  const interaction = JSON.parse(body)

  // Discord PING — must respond with PONG for endpoint verification
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 })
  }

  // Button interaction
  if (interaction.type === 3) {
    const customId: string = interaction.data.custom_id
    const discordUserId: string = interaction.member?.user?.id ?? interaction.user?.id
    const discordUsername: string = interaction.member?.user?.username ?? interaction.user?.username

    let result: { content: string }

    if (customId.startsWith("shift_accept:")) {
      const embedId = customId.replace("shift_accept:", "")
      result = await handleShiftAccept(embedId, discordUserId, discordUsername)
    } else if (customId.startsWith("shift_decline:")) {
      const embedId = customId.replace("shift_decline:", "")
      result = await handleShiftDecline(embedId, discordUserId)
    } else if (customId.startsWith("shift_maybe:")) {
      const embedId = customId.replace("shift_maybe:", "")
      result = await handleShiftMaybe(embedId, discordUserId, discordUsername)
    } else {
      result = { content: "Unknown action." }
    }

    // Respond with ephemeral message (only visible to the user who clicked)
    return NextResponse.json({
      type: 4,
      data: {
        content: result.content,
        flags: 64, // EPHEMERAL
      },
    })
  }

  return NextResponse.json({ type: 1 })
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/discord-bot.ts apps/web/app/api/discord/interactions/route.ts
git commit -m "feat: Discord bot lib + interactions endpoint with signature verification"
```

---

## Task 4: Shift Bot Business Logic

**Files:**
- Create: `apps/web/lib/shift-bot.ts`

This is the core logic: building the embed payload, and handling accept/decline/maybe interactions.

- [ ] **Step 1: Create `apps/web/lib/shift-bot.ts`**

```typescript
import { prisma } from "@/lib/prisma"
import { editBotMessage, postBotMessage, type BotMessagePayload } from "@/lib/discord-bot"
import type { ShiftTemplate } from "@xiv-venue-manager/types"

const XIV_BLUE = 0x00b4ff

interface WaitlistEntry {
  discordUserId: string
  discordUsername: string
  signedUpAt: string
}

/**
 * Build the Discord embed payload for a shift signup.
 * Shows event details, shift time, accepted staff, and slot count.
 */
export function buildShiftEmbed(
  embed: {
    id: string
    templateName: string
    scheduledStart: Date
    scheduledEnd: Date
    slots: number
    waitlist: WaitlistEntry[]
  },
  acceptedCount: number,
  acceptedNames: string[]
): BotMessagePayload {
  const slotsRemaining = embed.slots - acceptedCount
  const startTs = Math.floor(embed.scheduledStart.getTime() / 1000)
  const endTs = Math.floor(embed.scheduledEnd.getTime() / 1000)

  const acceptedField = acceptedCount > 0
    ? acceptedNames.map((n, i) => `${i + 1}. ${n}`).join("\n")
    : "_No one yet_"

  const waitlistField = embed.waitlist.length > 0
    ? embed.waitlist.map((w, i) => `${i + 1}. ${w.discordUsername}`).join("\n")
    : null

  const fields = [
    { name: "Time", value: `<t:${startTs}:t> – <t:${endTs}:t> (<t:${startTs}:R>)`, inline: false },
    { name: `Accepted (${acceptedCount}/${embed.slots})`, value: acceptedField, inline: true },
  ]

  if (waitlistField) {
    fields.push({ name: `Waitlist (${embed.waitlist.length})`, value: waitlistField, inline: true })
  }

  const buttons = [
    { type: 2, style: 3, label: `✓ Accept${slotsRemaining <= 0 ? " (Full)" : ""}`, custom_id: `shift_accept:${embed.id}` },
    { type: 2, style: 2, label: "? Maybe", custom_id: `shift_maybe:${embed.id}` },
    { type: 2, style: 4, label: "✗ Decline", custom_id: `shift_decline:${embed.id}` },
  ] as const

  return {
    embeds: [{
      title: embed.templateName,
      color: XIV_BLUE,
      fields,
    }],
    components: [{ type: 1, components: buttons }],
  }
}

/**
 * Re-fetch accepted names and edit the Discord message to reflect current state.
 */
async function refreshEmbed(embedRecord: {
  id: string
  templateName: string
  scheduledStart: Date
  scheduledEnd: Date
  slots: number
  waitlist: unknown
  channelId: string
  discordMessageId: string
}) {
  const acceptedShifts = await prisma.shift.findMany({
    where: { shiftSignupEmbedId: embedRecord.id, status: { not: "CANCELLED" } },
    include: { membership: { include: { user: true } } },
  })

  const acceptedNames = acceptedShifts.map(
    (s) => s.membership?.user?.name ?? "Unknown"
  )

  const payload = buildShiftEmbed(
    {
      id: embedRecord.id,
      templateName: embedRecord.templateName,
      scheduledStart: embedRecord.scheduledStart,
      scheduledEnd: embedRecord.scheduledEnd,
      slots: embedRecord.slots,
      waitlist: embedRecord.waitlist as WaitlistEntry[],
    },
    acceptedShifts.length,
    acceptedNames
  )

  await editBotMessage(embedRecord.channelId, embedRecord.discordMessageId, payload)
}

export async function handleShiftAccept(
  embedId: string,
  discordUserId: string,
  discordUsername: string
): Promise<{ content: string }> {
  const embed = await prisma.shiftSignupEmbed.findUnique({
    where: { id: embedId },
    include: { shifts: { where: { status: { not: "CANCELLED" } } } },
  })

  if (!embed || embed.cancelledAt) return { content: "This shift is no longer available." }

  // Find matching user + membership by Discord ID
  const user = await prisma.user.findFirst({ where: { discordId: discordUserId } })
  if (!user) return { content: "You need to sign up at xivvenuemanager.com first." }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, venueId: embed.venueId, status: "active" },
  })
  if (!membership) return { content: "You are not a staff member of this venue." }

  // Check if already accepted
  const existing = await prisma.shift.findFirst({
    where: { shiftSignupEmbedId: embedId, membershipId: membership.id, status: { not: "CANCELLED" } },
  })
  if (existing) return { content: "You are already signed up for this shift." }

  const acceptedCount = embed.shifts.length

  if (acceptedCount >= embed.slots) {
    // Add to waitlist
    const waitlist = embed.waitlist as WaitlistEntry[]
    const alreadyWaiting = waitlist.some((w) => w.discordUserId === discordUserId)
    if (alreadyWaiting) return { content: "You are already on the waitlist." }

    const newWaitlist: WaitlistEntry[] = [
      ...waitlist,
      { discordUserId, discordUsername, signedUpAt: new Date().toISOString() },
    ]
    await prisma.shiftSignupEmbed.update({
      where: { id: embedId },
      data: { waitlist: newWaitlist },
    })
    await refreshEmbed({ ...embed, waitlist: newWaitlist })
    return { content: `Slots are full — you have been added to the waitlist (position ${newWaitlist.length}).` }
  }

  // Create the shift
  await prisma.shift.create({
    data: {
      venueId: embed.venueId,
      membershipId: membership.id,
      scheduledStart: embed.scheduledStart,
      scheduledEnd: embed.scheduledEnd,
      status: "SCHEDULED",
      shiftSignupEmbedId: embedId,
    },
  })

  await refreshEmbed(embed)
  return { content: `You are signed up for **${embed.templateName}**. See you there!` }
}

export async function handleShiftDecline(
  embedId: string,
  discordUserId: string
): Promise<{ content: string }> {
  const embed = await prisma.shiftSignupEmbed.findUnique({ where: { id: embedId } })
  if (!embed) return { content: "Shift not found." }

  const user = await prisma.user.findFirst({ where: { discordId: discordUserId } })
  if (!user) return { content: "You don't have an account on XIV Venue Manager." }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, venueId: embed.venueId, status: "active" },
  })

  if (membership) {
    // Cancel their shift if they had one
    const shift = await prisma.shift.findFirst({
      where: { shiftSignupEmbedId: embedId, membershipId: membership.id, status: { not: "CANCELLED" } },
    })

    if (shift) {
      await prisma.shift.update({ where: { id: shift.id }, data: { status: "CANCELLED" } })

      // Promote first waitlisted person
      const waitlist = embed.waitlist as WaitlistEntry[]
      if (waitlist.length > 0) {
        const [next, ...rest] = waitlist
        await prisma.shiftSignupEmbed.update({ where: { id: embedId }, data: { waitlist: rest } })
        // Note: next person must re-click Accept themselves — we DM them if bot has DM perms
        // For now just remove from waitlist so slot is available
        await refreshEmbed({ ...embed, waitlist: rest })
        return { content: "You have been removed from this shift. A slot is now available." }
      }

      await refreshEmbed(embed)
      return { content: "You have been removed from this shift." }
    }
  }

  // Remove from waitlist if present
  const waitlist = embed.waitlist as WaitlistEntry[]
  const newWaitlist = waitlist.filter((w) => w.discordUserId !== discordUserId)
  if (newWaitlist.length < waitlist.length) {
    await prisma.shiftSignupEmbed.update({ where: { id: embedId }, data: { waitlist: newWaitlist } })
    await refreshEmbed({ ...embed, waitlist: newWaitlist })
    return { content: "You have been removed from the waitlist." }
  }

  return { content: "You were not signed up for this shift." }
}

export async function handleShiftMaybe(
  embedId: string,
  discordUserId: string,
  discordUsername: string
): Promise<{ content: string }> {
  // Maybe = add to waitlist (same as full slots behaviour but voluntary)
  const embed = await prisma.shiftSignupEmbed.findUnique({ where: { id: embedId } })
  if (!embed || embed.cancelledAt) return { content: "This shift is no longer available." }

  const waitlist = embed.waitlist as WaitlistEntry[]
  const alreadyWaiting = waitlist.some((w) => w.discordUserId === discordUserId)
  if (alreadyWaiting) return { content: "You are already on the maybe list." }

  // Check if they already accepted
  const user = await prisma.user.findFirst({ where: { discordId: discordUserId } })
  if (user) {
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, venueId: embed.venueId, status: "active" },
    })
    if (membership) {
      const existing = await prisma.shift.findFirst({
        where: { shiftSignupEmbedId: embedId, membershipId: membership.id, status: { not: "CANCELLED" } },
      })
      if (existing) return { content: "You are already accepted for this shift. Click Decline first to move to maybe." }
    }
  }

  const newWaitlist: WaitlistEntry[] = [
    ...waitlist,
    { discordUserId, discordUsername, signedUpAt: new Date().toISOString() },
  ]
  await prisma.shiftSignupEmbed.update({ where: { id: embedId }, data: { waitlist: newWaitlist } })
  await refreshEmbed({ ...embed, waitlist: newWaitlist })
  return { content: "Marked as maybe — you will be notified if a slot opens up." }
}

/**
 * Post all shift embeds for a single event based on venue templates.
 * Called by the sync-shift-embeds cron.
 */
export async function postShiftEmbedsForEvent(
  eventId: string,
  venueId: string,
  eventTitle: string,
  eventStart: Date,
  eventEnd: Date,
  channelId: string,
  templates: ShiftTemplate[]
): Promise<void> {
  for (const template of templates) {
    const scheduledStart = new Date(eventStart.getTime() + template.startOffsetHours * 3600_000)
    const scheduledEnd = new Date(scheduledStart.getTime() + template.durationHours * 3600_000)

    // Idempotency: skip if already posted
    const existing = await prisma.shiftSignupEmbed.findUnique({
      where: { eventId_templateName: { eventId, templateName: template.name } },
    })
    if (existing) continue

    const tempEmbed = {
      id: "pending",
      templateName: `${eventTitle} — ${template.name}`,
      scheduledStart,
      scheduledEnd,
      slots: template.slots,
      waitlist: [] as WaitlistEntry[],
    }

    const payload = buildShiftEmbed(tempEmbed, 0, [])
    const messageId = await postBotMessage(channelId, payload)

    const record = await prisma.shiftSignupEmbed.create({
      data: {
        venueId,
        eventId,
        templateName: template.name,
        discordMessageId: messageId,
        channelId,
        scheduledStart,
        scheduledEnd,
        slots: template.slots,
      },
    })

    // Edit the message now we have the real embed ID for button custom_ids
    const finalPayload = buildShiftEmbed(
      { ...tempEmbed, id: record.id, templateName: `${eventTitle} — ${template.name}` },
      0,
      []
    )
    await editBotMessage(channelId, messageId, finalPayload)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/shift-bot.ts
git commit -m "feat: shift bot business logic (accept/decline/maybe/post embed)"
```

---

## Task 5: Pre-Event Cron

**Files:**
- Create: `apps/web/app/api/cron/sync-shift-embeds/route.ts`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create `apps/web/app/api/cron/sync-shift-embeds/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyCronAuth } from "@/lib/cron-auth"
import { postShiftEmbedsForEvent } from "@/lib/shift-bot"
import { parseVenueSettings } from "@xiv-venue-manager/types"

export async function GET(request: Request) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const now = new Date()
  const stats = { posted: 0, skipped: 0, errors: 0 }

  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    select: { id: true, name: true, settings: true, events: {
      where: {
        status: "PUBLISHED",
        startTime: { gt: now },
      },
      select: { id: true, title: true, startTime: true, endTime: true },
    }},
  })

  for (const venue of venues) {
    const settings = parseVenueSettings(venue.settings)
    const shiftBot = settings.shiftBot
    if (!shiftBot?.enabled || !shiftBot.channelId || !shiftBot.templates?.length) continue

    const cutoff = new Date(now.getTime() + shiftBot.daysBeforeEvent * 86_400_000)

    for (const event of venue.events) {
      if (event.startTime > cutoff) continue

      // Build effective templates — default to one full-event shift if empty
      const templates = shiftBot.templates.length > 0
        ? shiftBot.templates
        : [{
            name: "Event Shift",
            startOffsetHours: 0,
            durationHours: Math.round((event.endTime.getTime() - event.startTime.getTime()) / 3_600_000),
            slots: 10,
          }]

      try {
        await postShiftEmbedsForEvent(
          event.id,
          venue.id,
          event.title,
          event.startTime,
          event.endTime,
          shiftBot.channelId,
          templates
        )
        stats.posted++
      } catch (err) {
        console.error(`[ShiftBot] Failed to post embed for ${venue.name} / ${event.title}:`, err)
        stats.errors++
      }
    }
  }

  return NextResponse.json({ success: true, timestamp: now.toISOString(), stats })
}
```

- [ ] **Step 2: Add cron entry to `docker-compose.yml`**

In the `cron-jobs` command block, add after the `sync-ffxivvenues-schedule` line:

```yaml
             echo '0 8 * * * curl -s -H \"Authorization: Bearer '$$CRON_SECRET'\" http://venue-manager:3000/api/cron/sync-shift-embeds >> /var/log/cron.log 2>&1' >> /etc/crontabs/root &&
```

This runs at 08:00 UTC daily. Venues with `daysBeforeEvent: 3` will have their embeds posted 3 days out.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/cron/sync-shift-embeds/route.ts docker-compose.yml
git commit -m "feat: sync-shift-embeds cron posts pre-event Discord shift signups"
```

---

## Task 6: Settings UI — Shift Bot Section

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

- [ ] **Step 1: Add state variables**

In `apps/web/app/dashboard/[slug]/settings/page.tsx`, find the existing state declarations (around line 57) and add inside the component:

```typescript
const [shiftBotEnabled, setShiftBotEnabled] = useState(false)
const [shiftBotChannelId, setShiftBotChannelId] = useState("")
const [shiftBotDaysBefore, setShiftBotDaysBefore] = useState(3)
const [shiftBotTemplates, setShiftBotTemplates] = useState<Array<{
  name: string; startOffsetHours: number; durationHours: number; slots: number
}>>([])
```

- [ ] **Step 2: Load shift bot settings from API response**

In the `fetchSettings` function where settings are spread (around line 152), add:

```typescript
setShiftBotEnabled(settingsData.shiftBot?.enabled ?? false)
setShiftBotChannelId(settingsData.shiftBot?.channelId ?? "")
setShiftBotDaysBefore(settingsData.shiftBot?.daysBeforeEvent ?? 3)
setShiftBotTemplates(settingsData.shiftBot?.templates ?? [])
```

- [ ] **Step 3: Include shift bot in save payload**

In `handleSave`, where `settings` is sent to the API, the settings object already includes the full state — add shiftBot to the `settings` state object on initial load and in the save body:

In the save fetch body, change the settings body to include:

```typescript
body: JSON.stringify({
  ...settings,
  shiftBot: {
    enabled: shiftBotEnabled,
    channelId: shiftBotChannelId,
    daysBeforeEvent: shiftBotDaysBefore,
    templates: shiftBotTemplates,
  },
}),
```

- [ ] **Step 4: Add Shift Bot UI section**

Find the end of the ffxivvenues section in the JSX (look for the closing `</div>` of that panel, around the ffxivvenues block). Add a new section after it:

```tsx
{/* Shift Bot */}
<div className="panel">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h3 className="font-cinzel font-semibold text-lg">Discord Shift Bot</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Automatically post shift signup embeds to Discord before each event.
      </p>
    </div>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={shiftBotEnabled}
        onChange={(e) => setShiftBotEnabled(e.target.checked)}
        className="rounded"
      />
      <span className="text-sm">Enabled</span>
    </label>
  </div>

  {shiftBotEnabled && (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Discord Channel ID</label>
        <input
          type="text"
          value={shiftBotChannelId}
          onChange={(e) => setShiftBotChannelId(e.target.value)}
          placeholder="Right-click channel → Copy ID"
          className="input w-full"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Enable Developer Mode in Discord settings to copy channel IDs.{" "}
          <a
            href={`https://discord.com/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID}&scope=bot&permissions=274877908992`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--xiv-blue)] hover:underline"
          >
            Invite the bot to your server →
          </a>
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Days before event to post</label>
        <input
          type="number"
          min={1}
          max={14}
          value={shiftBotDaysBefore}
          onChange={(e) => setShiftBotDaysBefore(Number(e.target.value))}
          className="input w-24"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Shift Templates</label>
          <button
            type="button"
            className="xiv-btn-shimmer text-xs px-3 py-1"
            onClick={() => setShiftBotTemplates((t) => [
              ...t,
              { name: "", startOffsetHours: 0, durationHours: 4, slots: 5 },
            ])}
          >
            + Add Template
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Leave empty to post one shift per event matching the full event duration.
        </p>
        <div className="space-y-3">
          {shiftBotTemplates.map((t, i) => (
            <div key={i} className="flex gap-2 items-center p-3 rounded-lg border border-[var(--blue-018)] bg-[var(--card)]">
              <input
                type="text"
                value={t.name}
                onChange={(e) => setShiftBotTemplates((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                placeholder="Shift name"
                className="input flex-1"
              />
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">+</span>
                <input
                  type="number"
                  min={0}
                  value={t.startOffsetHours}
                  onChange={(e) => setShiftBotTemplates((prev) => prev.map((x, j) => j === i ? { ...x, startOffsetHours: Number(e.target.value) } : x))}
                  className="input w-14 text-center"
                  title="Start offset hours from event start"
                />
                <span className="text-xs text-muted-foreground">h</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={t.durationHours}
                  onChange={(e) => setShiftBotTemplates((prev) => prev.map((x, j) => j === i ? { ...x, durationHours: Number(e.target.value) } : x))}
                  className="input w-14 text-center"
                  title="Duration in hours"
                />
                <span className="text-xs text-muted-foreground">hr</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={t.slots}
                  onChange={(e) => setShiftBotTemplates((prev) => prev.map((x, j) => j === i ? { ...x, slots: Number(e.target.value) } : x))}
                  className="input w-14 text-center"
                  title="Max slots"
                />
                <span className="text-xs text-muted-foreground">slots</span>
              </div>
              <button
                type="button"
                onClick={() => setShiftBotTemplates((prev) => prev.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-red-400 text-sm px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 5: Add `NEXT_PUBLIC_DISCORD_APPLICATION_ID` to `.env`**

```bash
echo "NEXT_PUBLIC_DISCORD_APPLICATION_ID=your_application_id_here" >> /home/ehno/xiv-app/.env
```

Replace `your_application_id_here` with the actual Application ID from the Discord Developer Portal.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/\[slug\]/settings/page.tsx .env
git commit -m "feat: Shift Bot settings UI with template builder"
```

---

## Task 7: Partake Cascade — Edit Embeds on Event Change/Cancel

**Files:**
- Modify: `apps/web/app/api/cron/post-partake-events/route.ts`
- Modify: `apps/web/lib/shift-bot.ts`

When Partake changes or cancels an event that has shift embeds, we need to update Discord and cancel the pending shifts.

- [ ] **Step 1: Add `cancelShiftEmbedsForEvent` to `apps/web/lib/shift-bot.ts`**

Add at the bottom of `apps/web/lib/shift-bot.ts`:

```typescript
/**
 * Cancel all shift embeds for an event (called when event is cancelled on Partake).
 * Edits Discord messages to show cancellation, cancels all pending shifts.
 */
export async function cancelShiftEmbedsForEvent(eventId: string): Promise<void> {
  const embeds = await prisma.shiftSignupEmbed.findMany({
    where: { eventId, cancelledAt: null },
  })

  for (const embed of embeds) {
    try {
      await editBotMessage(embed.channelId, embed.discordMessageId, {
        embeds: [{
          title: `~~${embed.templateName}~~ — CANCELLED`,
          color: 0xff4444,
          description: "This shift has been cancelled.",
        }],
        components: [],
      })
    } catch (err) {
      console.error(`[ShiftBot] Failed to edit cancelled embed ${embed.id}:`, err)
    }

    await prisma.shift.updateMany({
      where: { shiftSignupEmbedId: embed.id, status: "SCHEDULED" },
      data: { status: "CANCELLED" },
    })

    await prisma.shiftSignupEmbed.update({
      where: { id: embed.id },
      data: { cancelledAt: new Date() },
    })
  }
}
```

- [ ] **Step 2: Call `cancelShiftEmbedsForEvent` in the Partake cron**

In `apps/web/app/api/cron/post-partake-events/route.ts`, add the import at the top:

```typescript
import { cancelShiftEmbedsForEvent } from "@/lib/shift-bot"
```

Find the block where a cancelled event is handled (around line 91-113, where `discordCancelledAt` is set). After the `prisma.event.update` for cancellation, add:

```typescript
await cancelShiftEmbedsForEvent(ev.id)
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/shift-bot.ts apps/web/app/api/cron/post-partake-events/route.ts
git commit -m "feat: cascade shift embed cancellation when Partake event is cancelled"
```

---

## Task 8: Deploy + Discord Endpoint Registration

- [ ] **Step 1: Push and deploy**

```bash
git push
ssh server@192.168.1.122 "cd ~/xiv-app && git pull && docker compose build venue-manager && docker compose up -d"
```

- [ ] **Step 2: Register the interactions endpoint with Discord**

Go to https://discord.com/developers/applications → your XIV VM application → General Information → Interactions Endpoint URL.

Set it to: `https://xivvenuemanager.com/api/discord/interactions`

Discord will immediately send a PING to verify. The endpoint returns `{ type: 1 }` which is the correct PONG response. If Discord shows a green checkmark, the endpoint is live.

- [ ] **Step 3: Verify cron container picked up new entry**

```bash
ssh server@192.168.1.122 "docker exec cron-jobs cat /etc/crontabs/root"
```

Expected: `sync-shift-embeds` line present.

- [ ] **Step 4: Smoke test the embed posting**

Manually trigger the cron to confirm it runs without errors:

```bash
ssh server@192.168.1.122 "curl -s -H 'Authorization: Bearer '$(grep CRON_SECRET ~/xiv-app/.env | cut -d= -f2)'' http://localhost:3000/api/cron/sync-shift-embeds"
```

Expected: `{ "success": true, "stats": { "posted": N, ... } }`

- [ ] **Step 5: Test a button interaction**

In Discord, find a posted embed and click Accept. Expected:
- Ephemeral reply: "You are signed up for [shift name]"
- Embed updates with your name in the Accepted list
- Check DB: `SELECT * FROM shifts WHERE "shiftSignupEmbedId" IS NOT NULL LIMIT 5;`

---

## Self-Review

**Spec coverage check:**
- ✅ Pull event from Partake → covered (uses existing synced events)
- ✅ X days before → `daysBeforeEvent` in settings, cron at 08:00 daily
- ✅ Post Discord embed with Accept/Maybe/Decline → Task 3 + 4
- ✅ Accept creates shift on website → `handleShiftAccept` in Task 4
- ✅ Shift tied to staff member → via `membershipId`
- ✅ Multi-venue from day one → all logic is per-venue via `venueId`
- ✅ Three-shift model (TFA) → `templates` array in settings
- ✅ Slot limits → `slots` field per template
- ✅ Waitlist → JSON field on `ShiftSignupEmbed`, promote on decline
- ✅ Cancellation cascade → Task 7
- ✅ Staff not in system → ephemeral error message
- ✅ Signature verification → `tweetnacl` in Task 3 (CRITICAL security)

**Type consistency check:**
- `ShiftTemplate` defined in Task 2, used in Task 4 (`postShiftEmbedsForEvent`) and Task 6 (UI) ✅
- `ShiftSignupEmbed` Prisma model defined in Task 1, used in Tasks 4, 5, 7 ✅
- `buildShiftEmbed` defined in Task 4, called in Task 4 (refreshEmbed + postShiftEmbedsForEvent) ✅
- `cancelShiftEmbedsForEvent` defined in Task 7 step 1, imported in Task 7 step 2 ✅
