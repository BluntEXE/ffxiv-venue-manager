# Mobile Removal — Stage 1: Code Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the mobile app and its entire backend surface from the `xiv-app` monorepo — code only. No deploy, no DB migration. This is Stage 1 of `docs/superpowers/specs/2026-08-14-mobile-removal-design.md`; Stage 2 (deploy+soak) and Stage 3 (DB drop) happen later, after the current live event ends and in the next Tuesday maintenance window respectively.

**Architecture:** Confirmed by a completed audit (2026-08-14, see the design spec) that `apps/mobile` has zero shared-package coupling and the 25 mobile API routes only touch shared libs that are safely reused elsewhere. The 3 mobile-exclusive lib files and 3 mobile-exclusive Prisma models (`RefreshToken`, `NotificationPreference`, `DeviceToken`) are deleted here at the code/schema-source level; `DeviceToken`'s removal also requires editing two cron routes that read it, since nothing else in the codebase touches those models. `VenueFollow` and `PendingNotification` are shared/core and are explicitly NOT touched.

**Tech Stack:** TypeScript, Next.js App Router, Prisma, pnpm workspaces.

---

## Task 1: Delete `apps/mobile`

**Files:**
- Delete: `apps/mobile/` (entire directory)

- [ ] **Step 1: Delete the directory**

```bash
rm -rf apps/mobile
```

- [ ] **Step 2: Confirm the workspace glob still resolves cleanly**

`apps/*` in `pnpm-workspace.yaml` is a glob — no edit needed there. Confirm:

```bash
grep -n "apps" pnpm-workspace.yaml
pnpm install
```

Expected: `pnpm install` succeeds with no dangling workspace reference errors.

- [ ] **Step 3: Commit**

```bash
git add -A -- apps/mobile pnpm-lock.yaml
git commit -m "chore: remove apps/mobile"
```

---

## Task 2: Delete the 25 mobile API routes and 3 mobile-exclusive lib files

**Files:**
- Delete: `apps/web/app/api/mobile/` (entire directory, 25 route files confirmed via `find apps/web/app/api/mobile -name route.ts`)
- Delete: `apps/web/lib/mobile-auth-guard.ts`
- Delete: `apps/web/lib/mobile-operator-auth.ts`
- Delete: `apps/web/lib/auth/mobile-auth.ts`

- [ ] **Step 1: Delete the route tree**

```bash
rm -rf apps/web/app/api/mobile
```

- [ ] **Step 2: Delete the mobile-exclusive lib files**

```bash
rm apps/web/lib/mobile-auth-guard.ts
rm apps/web/lib/mobile-operator-auth.ts
rm apps/web/lib/auth/mobile-auth.ts
```

- [ ] **Step 3: Confirm nothing else imports the deleted lib files**

```bash
cd apps/web && grep -rn "mobile-auth-guard\|mobile-operator-auth\|auth/mobile-auth" app lib components 2>/dev/null
```

Expected: no output. (Already confirmed zero external references during the audit — this re-check catches any drift since then.)

- [ ] **Step 4: Commit**

```bash
git add -A -- apps/web/app/api/mobile apps/web/lib/mobile-auth-guard.ts apps/web/lib/mobile-operator-auth.ts apps/web/lib/auth/mobile-auth.ts
git commit -m "chore: remove mobile API routes and mobile-exclusive auth libs"
```

---

## Task 3: Remove mobile-exclusive Prisma models from the schema

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

Schema edit only — this does NOT run `prisma db push` or touch the live database. That happens in Stage 3, separately, in the maintenance window.

- [ ] **Step 1: Remove the three relation fields from `model User`**

Current (`apps/web/prisma/schema.prisma`, in the `User` model's relation block):

```prisma
  refreshTokens             RefreshToken[]
  deviceTokens              DeviceToken[]
  pendingNotifications      PendingNotification[]
  notificationPreference    NotificationPreference?
```

New:

```prisma
  pendingNotifications      PendingNotification[]
```

Only the `RefreshToken`, `DeviceToken`, and `NotificationPreference` relation lines are removed. `pendingNotifications` stays — `PendingNotification` is shared/core, not part of this removal.

- [ ] **Step 2: Delete the `DeviceToken` model**

Remove this block entirely:

```prisma
model DeviceToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  platform  String   @default("android")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("device_tokens")
}
```

Leave the `NotificationType` enum and `PendingNotification` model immediately below it untouched — both are shared/core.

- [ ] **Step 3: Delete the `NotificationPreference` model**

Remove this block entirely:

```prisma
model NotificationPreference {
  id               String   @id @default(cuid())
  userId           String   @unique
  shiftReminder    Boolean  @default(true)
  venueOpenedNow   Boolean  @default(true)
  eventReminder    Boolean  @default(true)
  followVisibility Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("notification_preferences")
}
```

- [ ] **Step 4: Delete the `RefreshToken` model**

Remove this block entirely:

```prisma
model RefreshToken {
  id          String    @id
  userId      String
  tokenHash   String    @unique
  deviceLabel String?
  createdAt   DateTime  @default(now())
  expiresAt   DateTime
  lastUsedAt  DateTime?
  revokedAt   DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([tokenHash])
  @@map("refresh_tokens")
}
```

- [ ] **Step 5: Regenerate the Prisma client against the edited schema**

```bash
cd apps/web && npx prisma generate
```

Expected: succeeds with no errors. This regenerates `@prisma/client` types locally so `tsc` in later steps reflects the schema change — it does NOT touch the live database (no `db push`, no migration run).

- [ ] **Step 6: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "chore: remove RefreshToken, DeviceToken, NotificationPreference from schema (code-only, no db push yet)"
```

---

## Task 4: Strip the dead push-notification-send code from the two cron routes

**Files:**
- Modify: `apps/web/app/api/cron/dispatch-notifications/route.ts`
- Delete: `apps/web/app/api/cron/poll-push-receipts/route.ts`

**Context:** `dispatch-notifications` currently does two things: (1) queues `EVENT_REMINDER_30M` rows into `PendingNotification` for upcoming events (`queueEventReminders`, untouched — stays), and (2) finds due `PendingNotification` rows, sends them via Expo push using each user's `deviceTokens`, and marks them sent. Part (2)'s send step depends entirely on `DeviceToken`, which is being deleted — so it's removed. The due rows still need `sentAt` set even without a real send, otherwise the same rows get re-selected and reprocessed every 60-second cron tick forever (unbounded query growth). `poll-push-receipts` exists *only* to poll Expo for delivery receipts of pushes sent by the code being removed in this task — once nothing ever sets `receiptId` again, the entire route has no purpose, so it's deleted outright rather than edited into a permanent no-op.

**Known gap this creates (explicitly out of scope to fix here — noted per the design spec's scope boundary):** `PendingNotification` rows are still created by non-mobile code (`app/api/plugin/shifts/clock-in`, `app/api/plugin/shifts/claim`, `app/api/bot/shifts/clock-in`, `lib/shift-notifications.ts`) for shift reminders and claim approvals — after this change they'll be created and immediately marked sent with no actual delivery to anyone. This was already effectively true for any user without the mobile app installed; this task doesn't change delivery for web users, it just removes the one delivery channel (mobile push) that existed. Fixing notification delivery is web-side follow-up work, not part of mobile removal.

- [ ] **Step 1: Rewrite `dispatch-notifications/route.ts`**

Current full file:

```typescript
/**
 * POST /api/cron/dispatch-notifications
 *
 * Sends all due pending_notifications via Expo Push API.
 * QStash config: every 60 seconds, Bearer = CRON_SECRET
 */
import { NextResponse } from "next/server"
import { verifyCronAuth } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
const BATCH_SIZE = 100

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  // Queue EVENT_REMINDER_30M for events starting in 28-32 min with no reminder yet
  await queueEventReminders(now).catch(() => {})

  const due = await prisma.pendingNotification.findMany({
    where: { scheduledFor: { lte: now }, sentAt: null },
    include: { user: { include: { deviceTokens: true } } },
    take: BATCH_SIZE,
    orderBy: { scheduledFor: "asc" },
  })

  if (due.length === 0) return NextResponse.json({ sent: 0 })

  const messages: object[] = []
  const ids: string[] = []

  for (const notif of due) {
    for (const device of notif.user.deviceTokens) {
      messages.push({
        to: device.token,
        title: notif.title,
        body: notif.body,
        data: notif.data ?? {},
        sound: "default",
      })
    }
    ids.push(notif.id)
  }

  let receipts: { id?: string }[] = []
  if (messages.length > 0) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      })
      const json = await res.json()
      receipts = json.data ?? []
    } catch {
      // Push failed but still mark sent to avoid retry storm
    }
  }

  // Mark all as sent; store first receipt ID per notification for later polling
  await Promise.all(
    ids.map((id, i) =>
      prisma.pendingNotification.update({
        where: { id },
        data: { sentAt: now, receiptId: receipts[i]?.id ?? null },
      })
    )
  )

  return NextResponse.json({ sent: ids.length, pushed: messages.length })
}

async function queueEventReminders(now: Date) {
  const windowStart = new Date(now.getTime() + 28 * 60 * 1000)
  const windowEnd   = new Date(now.getTime() + 32 * 60 * 1000)

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["PUBLISHED", "ACTIVE"] },
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      title: true,
      venueId: true,
      startTime: true,
      venue: {
        select: {
          name: true,
          follows: { select: { userId: true } },
        },
      },
    },
  })

  for (const event of events) {
    if (event.venue.follows.length === 0) continue

    // Skip if reminders already queued for this event
    const existing = await prisma.pendingNotification.findFirst({
      where: {
        type: "EVENT_REMINDER_30M",
        data: { path: ["eventId"], equals: event.id },
      },
    })
    if (existing) continue

    await prisma.pendingNotification.createMany({
      data: event.venue.follows.map((f) => ({
        userId: f.userId,
        type: "EVENT_REMINDER_30M" as const,
        title: `${event.venue.name} — starting soon`,
        body: `${event.title} starts in 30 minutes.`,
        data: { venueId: event.venueId, eventId: event.id },
        scheduledFor: now,
      })),
    })
  }
}
```

New full file:

```typescript
/**
 * POST /api/cron/dispatch-notifications
 *
 * Queues EVENT_REMINDER_30M reminders and marks all due pending_notifications
 * as sent. Push delivery (Expo, mobile-only) was removed with the mobile app
 * (2026-08-14) — there is currently no delivery channel for these
 * notifications. This cron still runs to prevent pending_notifications from
 * growing unbounded (rows are marked sent instead of endlessly re-selected).
 * QStash config: every 60 seconds, Bearer = CRON_SECRET
 */
import { NextResponse } from "next/server"
import { verifyCronAuth } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"

const BATCH_SIZE = 100

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  // Queue EVENT_REMINDER_30M for events starting in 28-32 min with no reminder yet
  await queueEventReminders(now).catch(() => {})

  const due = await prisma.pendingNotification.findMany({
    where: { scheduledFor: { lte: now }, sentAt: null },
    select: { id: true },
    take: BATCH_SIZE,
    orderBy: { scheduledFor: "asc" },
  })

  if (due.length === 0) return NextResponse.json({ sent: 0 })

  await prisma.pendingNotification.updateMany({
    where: { id: { in: due.map((n) => n.id) } },
    data: { sentAt: now },
  })

  return NextResponse.json({ sent: due.length })
}

async function queueEventReminders(now: Date) {
  const windowStart = new Date(now.getTime() + 28 * 60 * 1000)
  const windowEnd   = new Date(now.getTime() + 32 * 60 * 1000)

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["PUBLISHED", "ACTIVE"] },
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      title: true,
      venueId: true,
      startTime: true,
      venue: {
        select: {
          name: true,
          follows: { select: { userId: true } },
        },
      },
    },
  })

  for (const event of events) {
    if (event.venue.follows.length === 0) continue

    // Skip if reminders already queued for this event
    const existing = await prisma.pendingNotification.findFirst({
      where: {
        type: "EVENT_REMINDER_30M",
        data: { path: ["eventId"], equals: event.id },
      },
    })
    if (existing) continue

    await prisma.pendingNotification.createMany({
      data: event.venue.follows.map((f) => ({
        userId: f.userId,
        type: "EVENT_REMINDER_30M" as const,
        title: `${event.venue.name} — starting soon`,
        body: `${event.title} starts in 30 minutes.`,
        data: { venueId: event.venueId, eventId: event.id },
        scheduledFor: now,
      })),
    })
  }
}
```

`queueEventReminders` is byte-identical — only the `POST` handler's body-loop/Expo-fetch section changed.

- [ ] **Step 2: Delete `poll-push-receipts/route.ts`**

```bash
rm apps/web/app/api/cron/poll-push-receipts/route.ts
```

- [ ] **Step 3: Confirm no other code references the deleted route or `receiptId`'s producer**

```bash
cd apps/web && grep -rn "poll-push-receipts\|EXPO_RECEIPTS_URL" . --include="*.ts" --include="*.json" --include="*.md" 2>/dev/null
```

Expected: no output from `.ts`/`.json` (any hit in a `docs/` `.md` file is fine — historical, not functional). If a QStash schedule config file in this repo references `poll-push-receipts`, remove that entry too; if the schedule lives only in the external QStash dashboard, note it for the user to disable manually (this repo has no code-level QStash schedule config found during the audit).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/cron/dispatch-notifications/route.ts
git rm apps/web/app/api/cron/poll-push-receipts/route.ts
git commit -m "chore: remove dead Expo push-send/receipt-poll code (mobile removal)"
```

---

## Task 5: Fix the stale CI comment and update the roadmap doc

**Files:**
- Modify: `.github/workflows/security.yml`
- Modify: `docs/superpowers/plans/2026-08-11-codebase-cleanup-roadmap.md`

- [ ] **Step 1: Fix the stale comment in `.github/workflows/security.yml`**

Around line 70, current:

```yaml
              # anything that doesn't touch apps__web at all - mobile build
```

Read the surrounding 5-10 lines first to confirm the exact current wording and indentation (the audit only sampled this line), then replace the mobile reference with accurate current wording — the comment should no longer describe a "mobile build" path since `apps/mobile` no longer exists. If the surrounding logic itself doesn't actually change (this task is comment-only, not a CI logic change), just correct the comment text to describe what the workflow condition actually does now.

- [ ] **Step 2: Add a completion note to the roadmap doc**

Append to `docs/superpowers/plans/2026-08-11-codebase-cleanup-roadmap.md` (near the existing "Mobile deprecation note (2026-08-14)" entry found at line 96):

```markdown
**Mobile removal — Stage 1 complete (2026-08-14).** `apps/mobile`, all 25 `/api/mobile/*` routes, and the 3 mobile-exclusive lib files (`lib/mobile-auth-guard.ts`, `lib/mobile-operator-auth.ts`, `lib/auth/mobile-auth.ts`) are deleted. `RefreshToken`, `DeviceToken`, and `NotificationPreference` are removed from `schema.prisma` (code-only — `prisma db push` has NOT been run against the live database yet). `dispatch-notifications/route.ts` had its Expo push-send step removed (now just marks due `PendingNotification` rows as sent with no delivery — see the route's own doc comment); `poll-push-receipts/route.ts` was deleted outright since its entire purpose was polling receipts for the now-removed push-send call. Stage 2 (deploy) is held until the current live event ends; Stage 3 (`pg_dump` backup + live schema drop) happens in the next Tuesday 09:00–11:00 UTC maintenance window. See `docs/superpowers/specs/2026-08-14-mobile-removal-design.md` for the full design and audit findings.
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/security.yml docs/superpowers/plans/2026-08-11-codebase-cleanup-roadmap.md
git commit -m "docs: update roadmap and fix stale CI comment for mobile removal"
```

---

## Task 6: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors. This is the step most likely to surface anything the audit missed — any remaining import of a deleted file or Prisma model will fail here.

- [ ] **Step 2: Test suite**

```bash
cd apps/web && npx vitest run
```

Expected: all passing tests still pass. If any test file under a deleted path exists (unlikely — audit found no mobile-route tests, but confirm), it will need removal as part of this step, not left broken.

- [ ] **Step 3: Build**

```bash
cd apps/web && pnpm build
```

Expected: clean build, no missing-module errors, no stale route references in the build manifest.

- [ ] **Step 4: Final confirmation this is code-only**

```bash
git log --oneline -6
git status
```

Confirm: all 5 commits from Tasks 1-5 are present, working tree is clean, nothing has been pushed or deployed. Stage 2 (push + deploy) is a deliberate separate step, held until the live event ends — do not push in this task.
