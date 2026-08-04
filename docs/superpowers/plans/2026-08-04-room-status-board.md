# Room Status Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff mark venue rooms free/occupied (with an optional note) from the dashboard or in-game, with the dashboard updating live across viewers and the plugin polling while its Rooms tab is open.

**Architecture:** New standalone `Room` table (no relation to `Patron` — this is a different kind of feature). Two permission tiers: room-list management (add/rename/delete) is OWNER/MANAGER, matching the existing `bulk-reclassify`/ban pattern; status toggling is any active staff member, matching the existing `checkPermission` STAFF-inclusive pattern (new `'toggle_room'` action). Dashboard live sync reuses the existing `venueEventBus`/SSE infrastructure that already powers Live Mode. The plugin gets a new "Rooms" tab that polls only while it's the active tab, following the exact auto-refresh pattern `ShiftsTab.cs` already uses.

**Tech Stack:** Next.js 15 (App Router) + Prisma + PostgreSQL + Server-Sent Events (web), C#/.NET 10 Dalamud plugin (game client). Same testing convention as VIP/ban: Vitest for pure logic where it exists, no route-level or C# test infrastructure in this repo.

---

## Task 1: Add `Room` model and `'toggle_room'` permission

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Modify: `apps/web/lib/api/plugin-auth.ts`

- [ ] **Step 1: Add the `Room` model**

Insert after the `Patron` model (after its closing `}`, before the `// SERVICES & TRANSACTIONS` section comment):

```prisma
model Room {
  id          String   @id @default(cuid())
  venueId     String
  name        String
  isOccupied  Boolean  @default(false)
  note        String?
  updatedAt   DateTime @updatedAt
  updatedById String?

  venue     Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)
  updatedBy User? @relation(fields: [updatedById], references: [id], onDelete: SetNull)

  @@unique([venueId, name])
  @@index([venueId])
  @@map("rooms")
}
```

- [ ] **Step 2: Add back-relations**

In `model Venue`, add near the other list relations (alongside `patrons Patron[]`):

```prisma
  rooms Room[]
```

In `model User`, add near the other list relations (alongside `vipPatronsSet`/`bannedPatronsSet`):

```prisma
  roomsUpdated Room[]
```

(No `@relation` name needed — `Room` has only one relation to `User`, unlike `Patron`'s two.)

- [ ] **Step 3: Add the `'toggle_room'` action to `checkPermission`**

In `apps/web/lib/api/plugin-auth.ts`, find the `checkPermission` function (around line 209-246). Change the action union type:

```typescript
export async function checkPermission(
  userId: string,
  venueId: string,
  action: 'view' | 'log_service' | 'log_transaction' | 'log_patron' | 'view_shifts' | 'clock_shift' | 'toggle_room'
): Promise<boolean> {
```

And add `'toggle_room'` to the STAFF-tier allowed actions:

```typescript
  if (membership.role === 'STAFF') {
    return (
      action === 'log_service' ||
      action === 'log_patron' ||
      action === 'log_transaction' ||
      action === 'view_shifts' ||
      action === 'clock_shift' ||
      action === 'toggle_room'
    )
  }
```

- [ ] **Step 4: Validate offline**

Run: `cd apps/web && npx prisma format --schema=prisma/schema.prisma`
Expected: `Formatted prisma/schema.prisma in ...ms 🚀`

Run: `pnpm postinstall`
Expected: `✔ Generated Prisma Client...`

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/lib/api/plugin-auth.ts
git commit -m "feat(web): add Room model and toggle_room permission"
```

## Context for Task 1

This is Task 1 of 12 in a Room Status Board feature — third of four features from the original venue-feedback item (VIP and ban list shipped first, see their design specs/plans in the same directory for reference on established conventions). Unlike those two, `Room` has NO relationship to `Patron` — it's a standalone per-venue resource. There's no game API to detect actual room occupancy; this is a manual status board.

No `DATABASE_URL` in this worktree — same constraint as VIP/ban, schema validated offline via `prisma format`/`generate`/`typecheck`, real DDL applied to the server by hand later, separately.

---

## Task 2: Room-list management API (create/rename/delete, OWNER/MANAGER only)

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/rooms/route.ts`
- Create: `apps/web/app/api/venues/[venueId]/rooms/[roomId]/route.ts`

- [ ] **Step 1: Write the create route**

```typescript
// apps/web/app/api/venues/[venueId]/rooms/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { venueId } = await context.params

      const venue = await prisma.venue.findUnique({ where: { id: venueId } })
      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      const membership = await prisma.membership.findFirst({
        where: { userId: session.user.id, venueId: venue.id, status: "active" },
      })
      if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
        return NextResponse.json(
          { error: "Owner or Manager role required" },
          { status: 403 }
        )
      }

      const body = await request.json()
      const { name } = createRoomSchema.parse(body)

      const existing = await prisma.room.findFirst({
        where: { venueId: venue.id, name },
      })
      if (existing) {
        return NextResponse.json({ error: "A room with this name already exists" }, { status: 409 })
      }

      const room = await prisma.room.create({
        data: { venueId: venue.id, name },
      })

      return NextResponse.json({ id: room.id, name: room.name, isOccupied: room.isOccupied, note: room.note })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Invalid request", details: err.flatten() },
          { status: 400 }
        )
      }
      console.error("[rooms] error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 2: Write the rename/delete route**

```typescript
// apps/web/app/api/venues/[venueId]/rooms/[roomId]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const renameRoomSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

async function requireManager(session: { user?: { id?: string } } | null, venueId: string) {
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const venue = await prisma.venue.findUnique({ where: { id: venueId } })
  if (!venue) {
    return { error: NextResponse.json({ error: "Venue not found" }, { status: 404 }) }
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, venueId: venue.id, status: "active" },
  })
  if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
    return { error: NextResponse.json({ error: "Owner or Manager role required" }, { status: 403 }) }
  }
  return { venue }
}

export const PATCH = withRateLimit<{
  params: Promise<{ venueId: string; roomId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      const { venueId, roomId } = await context.params

      const gate = await requireManager(session, venueId)
      if (gate.error) return gate.error

      const body = await request.json()
      const { name } = renameRoomSchema.parse(body)

      const room = await prisma.room.findFirst({
        where: { id: roomId, venueId: gate.venue!.id },
        select: { id: true },
      })
      if (!room) {
        return NextResponse.json({ error: "Room not found in this venue" }, { status: 404 })
      }

      const updated = await prisma.room.update({
        where: { id: roomId },
        data: { name },
      })

      return NextResponse.json({ id: updated.id, name: updated.name })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Invalid request", details: err.flatten() },
          { status: 400 }
        )
      }
      console.error("[rooms/:id] PATCH error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{
  params: Promise<{ venueId: string; roomId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      const { venueId, roomId } = await context.params

      const gate = await requireManager(session, venueId)
      if (gate.error) return gate.error

      const room = await prisma.room.findFirst({
        where: { id: roomId, venueId: gate.venue!.id },
        select: { id: true },
      })
      if (!room) {
        return NextResponse.json({ error: "Room not found in this venue" }, { status: 404 })
      }

      await prisma.room.delete({ where: { id: roomId } })

      return NextResponse.json({ success: true })
    } catch (err) {
      console.error("[rooms/:id] DELETE error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/rooms/route.ts apps/web/app/api/venues/[venueId]/rooms/[roomId]/route.ts
git commit -m "feat(web): add room create/rename/delete endpoints (OWNER/MANAGER)"
```

## Context for Task 2

This is Task 2 of 12. Task 1 (done) added the `Room` model. This task adds the OWNER/MANAGER-only management endpoints — create, rename, delete. These follow the same auth pattern established in `patrons/[patronId]/vip/route.ts` and `patrons/[patronId]/ban/route.ts` (session auth → venue lookup → OWNER/MANAGER membership check → zod body → prisma write), but since TWO routes in this task (`PATCH` rename and `DELETE`) share the exact same auth gate, a small local `requireManager` helper avoids duplicating that block twice in the same file — this is new to this task (VIP/ban routes were always single-method files, so didn't need it), not an established codebase pattern, just a pragmatic local dedup for this specific file. Don't extract it further or move it to a shared lib — it's file-scoped.

Status toggling (Task 3, next) is a SEPARATE endpoint with different (any-active-staff) permissions — don't conflate the two.

---

## Task 3: Room status toggle API (any active staff, emits live update)

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/rooms/[roomId]/status/route.ts`
- Modify: `apps/web/lib/sse/venue-events.ts`

- [ ] **Step 1: Add `"room_status"` to the `VenueEvent` type union**

Current (`apps/web/lib/sse/venue-events.ts`):

```typescript
export interface VenueEvent {
  id: string
  type: "sale" | "patron_enter" | "patron_exit"
  venueId: string
  timestamp: string
  data: Record<string, any>
}
```

Change to:

```typescript
export interface VenueEvent {
  id: string
  type: "sale" | "patron_enter" | "patron_exit" | "room_status"
  venueId: string
  timestamp: string
  data: Record<string, any>
}
```

- [ ] **Step 2: Write the status route**

```typescript
// apps/web/app/api/venues/[venueId]/rooms/[roomId]/status/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { venueEventBus } from "@/lib/sse/venue-events"

const setStatusSchema = z.object({
  isOccupied: z.boolean(),
  note: z.string().trim().max(200).optional(),
})

export const PATCH = withRateLimit<{
  params: Promise<{ venueId: string; roomId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { venueId, roomId } = await context.params

      const venue = await prisma.venue.findUnique({ where: { id: venueId } })
      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Any active member can toggle room status — matches how patron-visit
      // logging and the transactions POST route already work (no OWNER/MANAGER
      // gate), unlike VIP/ban which are moderation actions.
      const membership = await prisma.membership.findFirst({
        where: { userId: session.user.id, venueId: venue.id, status: "active" },
      })
      if (!membership) {
        return NextResponse.json({ error: "Not an active member of this venue" }, { status: 403 })
      }

      const body = await request.json()
      const { isOccupied, note } = setStatusSchema.parse(body)

      const room = await prisma.room.findFirst({
        where: { id: roomId, venueId: venue.id },
      })
      if (!room) {
        return NextResponse.json({ error: "Room not found in this venue" }, { status: 404 })
      }

      const updated = await prisma.room.update({
        where: { id: roomId },
        data: {
          isOccupied,
          note: note ?? null,
          updatedById: session.user.id,
        },
        include: { updatedBy: { select: { name: true } } },
      })

      venueEventBus.emit(venue.id, {
        id: `room-${updated.id}-${updated.updatedAt.getTime()}`,
        type: "room_status",
        venueId: venue.id,
        timestamp: updated.updatedAt.toISOString(),
        data: {
          roomId: updated.id,
          name: updated.name,
          isOccupied: updated.isOccupied,
          note: updated.note,
          updatedByName: updated.updatedBy?.name ?? null,
        },
      })

      return NextResponse.json({ id: updated.id, isOccupied: updated.isOccupied, note: updated.note })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Invalid request", details: err.flatten() },
          { status: 400 }
        )
      }
      console.error("[rooms/:id/status] error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/rooms/[roomId]/status/route.ts apps/web/lib/sse/venue-events.ts
git commit -m "feat(web): add room status toggle endpoint with live SSE broadcast"
```

## Context for Task 3

This is Task 3 of 12. This is the operational, frequently-used endpoint — any active staff member can toggle a room's status, no OWNER/MANAGER gate (that's Task 2's routes, for the room LIST itself). The rate limit is higher here (60/min vs 30/min) since this is expected to be used more often during a live event than the setup-only create/rename/delete routes.

The `venueEventBus.emit(...)` call is what makes the dashboard board update live across viewers — reuses the exact same bus that `lib/api/transactions.ts` and `patron-visits/route.ts` already use for sale/patron events. The `/api/stream/[venueId]` SSE route doesn't filter by event type (confirmed by reading it — it streams everything for a venueId), so no changes are needed there; the client just needs to handle the new `"room_status"` type, which is Task 5's job.

Event `id` uses a synthetic `room-${id}-${timestamp}` string rather than a dedicated event-log row, since there's no `RoomEvent` table — this is purely for the client's de-dupe check (`prev.some(a => a.id === data.id)`, the same pattern `live-dashboard.tsx` already uses for sale/patron events).

---

## Task 4: Plugin-facing room endpoints (read + write)

**Files:**
- Create: `apps/web/app/api/plugin/rooms/route.ts`
- Create: `apps/web/app/api/plugin/rooms/status/route.ts`

- [ ] **Step 1: Write the read route**

```typescript
// apps/web/app/api/plugin/rooms/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/plugin/rooms?venueId=…
 *
 * Returns this venue's rooms with current status, for the plugin's
 * Rooms tab. Polled on an interval while that tab is open (see
 * RoomsTab.cs) — not a live push like the dashboard's SSE feed, since
 * this plugin has no persistent-connection infrastructure.
 */
export async function GET(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, 'read')
    if (limited) return limited

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    if (!venueId || !auth.venues.includes(venueId)) {
      return NextResponse.json({ error: 'Invalid venue' }, { status: 400 })
    }

    const rooms = await prisma.room.findMany({
      where: { venueId },
      select: { id: true, name: true, isOccupied: true, note: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ rooms })
  } catch (error) {
    console.error('[Plugin API] Error fetching rooms:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Write the write route**

```typescript
// apps/web/app/api/plugin/rooms/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkPermission } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'
import { venueEventBus } from '@/lib/sse/venue-events'

interface SetRoomStatusPayload {
  venueId: string
  roomId: string
  isOccupied: boolean
  note?: string
}

/**
 * POST /api/plugin/rooms/status
 *
 * Toggle a room's status from the plugin's Rooms tab. Any active
 * staff member (via checkPermission's 'toggle_room' action) — not
 * OWNER/MANAGER only, unlike the ban write endpoint. Also broadcasts
 * to the dashboard's live SSE feed, same as the web status route.
 */
export async function POST(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, 'write')
    if (limited) return limited

    const body: SetRoomStatusPayload = await request.json()
    const { venueId, roomId, isOccupied, note } = body

    if (!venueId || !roomId || typeof isOccupied !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: venueId, roomId, isOccupied' },
        { status: 400 }
      )
    }

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: 'Invalid venue' }, { status: 400 })
    }

    const canToggle = await checkPermission(auth.userId, venueId, 'toggle_room')
    if (!canToggle) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const room = await prisma.room.findFirst({ where: { id: roomId, venueId } })
    if (!room) {
      return NextResponse.json({ error: 'Room not found in this venue' }, { status: 404 })
    }

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: {
        isOccupied,
        note: note?.trim() || null,
        updatedById: auth.userId,
      },
      include: { updatedBy: { select: { name: true } } },
    })

    venueEventBus.emit(venueId, {
      id: `room-${updated.id}-${updated.updatedAt.getTime()}`,
      type: 'room_status',
      venueId,
      timestamp: updated.updatedAt.toISOString(),
      data: {
        roomId: updated.id,
        name: updated.name,
        isOccupied: updated.isOccupied,
        note: updated.note,
        updatedByName: updated.updatedBy?.name ?? null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Plugin API] Error setting room status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/plugin/rooms/route.ts apps/web/app/api/plugin/rooms/status/route.ts
git commit -m "feat(web): add plugin-facing room read/write endpoints"
```

## Context for Task 4

This is Task 4 of 12, the last web-app task (Tasks 5-6 are still web-app UI — see below — Tasks 7-11 are plugin-side). Uses `checkPermission(auth.userId, venueId, 'toggle_room')` (the STAFF-inclusive check added in Task 1), unlike the ban write endpoint which needed a hand-rolled OWNER/MANAGER check because `checkPermission` had no ban-appropriate action. Rooms fit `checkPermission`'s existing design cleanly since any active staff can toggle.

Both this write endpoint and the web dashboard's status route (Task 3) emit the same `"room_status"` SSE event — so a room toggled from the plugin shows up live on the dashboard too, and vice versa (the dashboard's own toggle already emits from Task 3). This task's route independently re-implements the emit rather than sharing a function with Task 3's route, matching how `patron-visits/route.ts` and the dashboard patron-log paths are already two independent emit sites for related events — not extracted into a shared helper in this codebase's existing convention.

Wait — actually, re-emitting from the dashboard's OWN status route (Task 3) after a change made there means the browser tab that made the change will also receive its own event back over SSE. Look at how `live-dashboard.tsx` already handles this for sales (it doesn't currently, since sales aren't authored from the same live-updating UI) — for rooms, this task doesn't need to solve that; Task 5's client component is responsible for de-duping self-originated updates if it becomes visually janky (e.g., briefly re-applying a value the optimistic update already set). Note this as something to watch for in Task 5's testing, not something to fix here.

---

## Task 5: Rooms dashboard page + live board component

**Files:**
- Create: `apps/web/app/dashboard/[slug]/rooms/page.tsx`
- Create: `apps/web/components/rooms-board.tsx`

- [ ] **Step 1: Write the page**

```tsx
// apps/web/app/dashboard/[slug]/rooms/page.tsx
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { RoomsBoard } from "@/components/rooms-board"

export default async function RoomsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role

  const rooms = await prisma.room.findMany({
    where: { venueId: venue.id },
    include: { updatedBy: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  })

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">{venue.name} &middot; {venue.dataCenter} &middot; {venue.world}</span>
          </div>
          <h1 className="page-h1">Rooms</h1>
        </div>

        <RoomsBoard
          venueId={venue.id}
          canManage={["OWNER", "MANAGER"].includes(userRole)}
          rooms={rooms.map((r) => ({
            id: r.id,
            name: r.name,
            isOccupied: r.isOccupied,
            note: r.note,
            updatedByName: r.updatedBy?.name ?? null,
          }))}
        />
      </div>
    </VenueLayout>
  )
}
```

Note: unlike `patron-logs`/`ban-list`, this page does NOT 404 non-OWNER/MANAGER users — any active member (the page already only renders for someone with a `Membership` row, via `venue.memberships.length === 0` → `notFound()`) can view and toggle rooms. `canManage` gates only the add/rename/delete controls client-side (and the server independently enforces this in Task 2's routes — `canManage` is UX-only, not a security boundary, matching the pattern already established for VIP's `canSetVip` prop).

- [ ] **Step 2: Write the board component**

```tsx
// apps/web/components/rooms-board.tsx
"use client"

import { useState, useEffect } from "react"

export type RoomItem = {
  id: string
  name: string
  isOccupied: boolean
  note: string | null
  updatedByName: string | null
}

export function RoomsBoard({
  venueId,
  canManage,
  rooms,
}: {
  venueId: string
  canManage: boolean
  rooms: RoomItem[]
}) {
  const [localRooms, setLocalRooms] = useState(rooms)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [newRoomName, setNewRoomName] = useState("")
  const [adding, setAdding] = useState(false)

  // Live sync via SSE — same bus/stream route the Live Mode page uses.
  useEffect(() => {
    const es = new EventSource("/api/stream/" + venueId)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type !== "room_status") return
        setLocalRooms((prev) =>
          prev.map((r) =>
            r.id === msg.data.roomId
              ? { ...r, isOccupied: msg.data.isOccupied, note: msg.data.note, updatedByName: msg.data.updatedByName }
              : r
          )
        )
      } catch {}
    }
    return () => es.close()
  }, [venueId])

  async function toggleStatus(room: RoomItem) {
    if (pendingIds.has(room.id)) return
    const nextOccupied = !room.isOccupied
    setPendingIds((prev) => new Set(prev).add(room.id))
    setLocalRooms((prev) =>
      prev.map((r) => (r.id === room.id ? { ...r, isOccupied: nextOccupied } : r))
    )
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOccupied: nextOccupied, note: room.note ?? undefined }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, isOccupied: room.isOccupied } : r))
      )
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function saveNote(room: RoomItem) {
    const trimmed = noteInput.trim()
    setEditingNoteId(null)
    setNoteInput("")
    if (pendingIds.has(room.id)) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    const prevNote = room.note
    setLocalRooms((prev) =>
      prev.map((r) => (r.id === room.id ? { ...r, note: trimmed || null } : r))
    )
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOccupied: room.isOccupied, note: trimmed || undefined }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, note: prevNote } : r))
      )
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function addRoom() {
    const name = newRoomName.trim()
    if (!name || adding) return
    setAdding(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || "Failed to add room")
        return
      }
      const created = await res.json()
      setLocalRooms((prev) => [...prev, { id: created.id, name: created.name, isOccupied: false, note: null, updatedByName: null }])
      setNewRoomName("")
    } catch {
      alert("Network error adding room.")
    } finally {
      setAdding(false)
    }
  }

  async function saveRename(room: RoomItem) {
    const name = renameInput.trim()
    setRenamingId(null)
    setRenameInput("")
    if (!name || name === room.name) return
    const prevName = room.name
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, name } : r)))
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, name: prevName } : r)))
      alert("Failed to rename room.")
    }
  }

  async function deleteRoom(room: RoomItem) {
    if (!confirm(`Delete "${room.name}"? This can't be undone.`)) return
    const prevList = localRooms
    setLocalRooms((prev) => prev.filter((r) => r.id !== room.id))
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalRooms(prevList)
      alert("Failed to delete room.")
    }
  }

  return (
    <div>
      {localRooms.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">No rooms yet.</p>
      ) : (
        <div className="panel">
          <table className="dtable">
            <thead>
              <tr>
                <th>Room</th>
                <th>Status</th>
                <th>Note</th>
                <th className="hide">Last updated by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {localRooms.map((room) => (
                <tr key={room.id}>
                  <td className="t-name">
                    {renamingId === room.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          type="text"
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          style={{ fontSize: "0.85rem", padding: "2px 6px", width: 140 }}
                          autoFocus
                        />
                        <button type="button" className="tag neutral" onClick={() => saveRename(room)}>Save</button>
                        <button type="button" className="tag neutral" onClick={() => { setRenamingId(null); setRenameInput("") }}>Cancel</button>
                      </div>
                    ) : (
                      room.name
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleStatus(room)}
                      disabled={pendingIds.has(room.id)}
                      className={`tag ${room.isOccupied ? "danger" : "vip"}`}
                      style={{ cursor: pendingIds.has(room.id) ? "default" : "pointer", opacity: pendingIds.has(room.id) ? 0.6 : 1 }}
                    >
                      {room.isOccupied ? "Occupied" : "Free"}
                    </button>
                  </td>
                  <td>
                    {editingNoteId === room.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          type="text"
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          placeholder="Note…"
                          style={{ fontSize: "0.85rem", padding: "2px 6px", width: 160 }}
                          autoFocus
                        />
                        <button type="button" className="tag neutral" onClick={() => saveNote(room)}>Save</button>
                        <button type="button" className="tag neutral" onClick={() => { setEditingNoteId(null); setNoteInput("") }}>Cancel</button>
                      </div>
                    ) : (
                      <span
                        onClick={() => { setEditingNoteId(room.id); setNoteInput(room.note ?? "") }}
                        style={{ cursor: "pointer" }}
                        className={room.note ? "" : "t-muted"}
                      >
                        {room.note || "Add note…"}
                      </span>
                    )}
                  </td>
                  <td className="hide t-muted">{room.updatedByName ?? "—"}</td>
                  <td>
                    {canManage && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="tag neutral" onClick={() => { setRenamingId(room.id); setRenameInput(room.name) }}>Rename</button>
                        <button type="button" className="tag danger" onClick={() => deleteRoom(room)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
          <input
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="New room name…"
            style={{ fontSize: "0.85rem", padding: "4px 8px", width: 200 }}
          />
          <button type="button" className="tag vip" disabled={!newRoomName.trim() || adding} onClick={addRoom}>
            Add Room
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/dashboard/[slug]/rooms/page.tsx apps/web/components/rooms-board.tsx
git commit -m "feat(web): add Rooms dashboard page with live status board"
```

## Context for Task 5

This is Task 5 of 12, the biggest single UI task in this feature. Tasks 1-4 (done) built the schema, both permission tiers' API routes, and the plugin-facing endpoints.

This component intentionally reuses UI patterns already proven in `patron-profiles-table.tsx` and `ban-list-manager.tsx`: optimistic updates with per-item rollback (not full-list, learning from the bug caught and fixed in the ban feature's `ban-list-manager.tsx`), inline text-input-with-Save/Cancel for notes and renaming (same shape as ban's inline reason input, closed synchronously — but note: unlike ban's reason input, THIS component's inline inputs don't have the same click-vs-response race risk since `saveNote`/`saveRename` close the input state synchronously at the start of the function, before the `await fetch(...)` — same fix pattern already applied to `patron-profiles-table.tsx`'s Confirm button, just built in from the start here instead of needing a follow-up fix).

The `confirm()` browser dialog for delete matches the existing pattern in `live-dashboard.tsx`'s `handleEndEvent` (`if (!confirm(...)) return`) — not a new UI pattern.

The SSE `useEffect` mirrors `live-dashboard.tsx`'s exact structure (`new EventSource(...)`, `onmessage` JSON.parse + type check, cleanup via `es.close()`), filtering for `msg.type === "room_status"` and updating the matching room by `roomId`. A room toggled by the current tab's own action will ALSO arrive back over SSE (self-originated event) — this is a known, accepted characteristic (noted in Task 4's context) since the SSE update just re-applies the same value the optimistic update already set; it's not visually harmful, just slightly redundant. Don't add de-dup logic for this unless testing (Task 12) actually reveals a visible glitch.

`className={`tag ${room.isOccupied ? "danger" : "vip"}`}` reuses the `tag danger`/`tag vip` classes already established in `patron-profiles-table.tsx` (red for occupied/danger-adjacent, the existing gold-ish "vip" class repurposed here just for its green-adjacent... — actually check this against the design spec's stated color choice before implementing: the design spec says free=green, occupied=amber/red. If `tag vip` doesn't render as green in the actual stylesheet, use a plain inline `style={{ color: ... }}` fallback instead — this is a case where the exact CSS class naming wasn't independently verified against a stylesheet (same caveat noted in the VIP/ban plans: the `tag` classes' underlying CSS was never located in the codebase during planning, only their usage was copied). If typecheck/build passes but the color looks wrong when manually verified (Task 12), that's a cosmetic follow-up, not a blocker.

---

## Task 6: Sidebar navigation entry

**Files:**
- Modify: `apps/web/components/venue-sidebar.tsx`

- [ ] **Step 1: Add the icon import**

Add `DoorOpen` to the lucide-react import list (alongside the icons already imported):

```typescript
import {
  Heart,
  Home,
  BarChart3,
  Calendar,
  Radio,
  Users,
  Clock,
  CheckSquare,
  ShoppingBag,
  Coins,
  Scroll,
  History,
  Wallet,
  Settings,
  Compass,
  BookHeart,
  Ban,
  DoorOpen,
  type LucideIcon,
} from "lucide-react"
```

- [ ] **Step 2: Add the nav entry to "Operations"**

Find the "Operations" section:

```typescript
    {
      label: "Operations",
      items: [
        { href: `/dashboard/${venueSlug}/events`, label: "Events", icon: Calendar },
        { href: `/dashboard/${venueSlug}/staff`, label: "Staff", icon: Users },
        { href: `/dashboard/${venueSlug}/shifts`, label: "Shifts", icon: Clock },
        { href: `/dashboard/${venueSlug}/tasks`, label: "Tasks", icon: CheckSquare },
        { href: `/dashboard/${venueSlug}/services`, label: "Services", icon: ShoppingBag },
      ],
    },
```

Add a `Rooms` entry after `Services`, with **no `roles` restriction** (unlike Payroll/Patron Logs/Ban List, which are all `roles: ["OWNER", "MANAGER"]`) — the Rooms page is visible to any active staff member, per this feature's permission design:

```typescript
    {
      label: "Operations",
      items: [
        { href: `/dashboard/${venueSlug}/events`, label: "Events", icon: Calendar },
        { href: `/dashboard/${venueSlug}/staff`, label: "Staff", icon: Users },
        { href: `/dashboard/${venueSlug}/shifts`, label: "Shifts", icon: Clock },
        { href: `/dashboard/${venueSlug}/tasks`, label: "Tasks", icon: CheckSquare },
        { href: `/dashboard/${venueSlug}/services`, label: "Services", icon: ShoppingBag },
        { href: `/dashboard/${venueSlug}/rooms`, label: "Rooms", icon: DoorOpen },
      ],
    },
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/venue-sidebar.tsx
git commit -m "feat(web): add Rooms sidebar nav entry"
```

## Context for Task 6

This is Task 6 of 12, the last web-app task. Deliberately has NO `roles` array on the nav item — every other recently-added nav entry (Ban List, Patron Logs, Payroll) is OWNER/MANAGER-gated, but Rooms is meant for all active staff per this feature's two-tier permission design (list management is OWNER/MANAGER, status toggling is anyone) — don't copy the `roles: ["OWNER", "MANAGER"]` pattern here, that would incorrectly hide the page from regular STAFF who should be able to toggle rooms.

---

## Task 7: Plugin — room models and API client methods

**Files:**
- Modify: `VenueManager/XIVAppApiModels.cs`
- Modify: `VenueManager/XIVAppVenueApi.cs`

- [ ] **Step 1: Add `Room`/`RoomsResponse`/request models**

In `XIVAppApiModels.cs`, add after `BannedPatronsResponse`:

```csharp
  public class Room
  {
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("isOccupied")]
    public bool IsOccupied { get; set; }

    [JsonPropertyName("note")]
    public string? Note { get; set; }
  }

  public class RoomsResponse
  {
    [JsonPropertyName("rooms")]
    public List<Room> Rooms { get; set; } = new();
  }

  public class XIVAppSetRoomStatusRequest
  {
    [JsonPropertyName("venueId")]
    public string VenueId { get; set; } = "";

    [JsonPropertyName("roomId")]
    public string RoomId { get; set; } = "";

    [JsonPropertyName("isOccupied")]
    public bool IsOccupied { get; set; }

    [JsonPropertyName("note")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Note { get; set; }
  }
```

- [ ] **Step 2: Add `GetRoomsAsync`/`SetRoomStatusAsync` to `XIVAppVenueApi.cs`**

Add after `GetActiveEventAsync` (at the end of the class, before its closing brace):

```csharp
    public async Task<List<Room>> GetRoomsAsync(string venueId)
    {
      if (!_client.IsConfigured) return new List<Room>();
      try
      {
        var response = await _client.Http.GetAsync($"{_client.BaseUrl}/api/plugin/rooms?venueId={venueId}");
        if (!response.IsSuccessStatusCode)
        {
          Plugin.Log.Warning($"Failed to get rooms: {response.StatusCode}");
          return new List<Room>();
        }
        var result = await response.Content.ReadFromJsonAsync<RoomsResponse>();
        return result?.Rooms ?? new List<Room>();
      }
      catch (Exception ex)
      {
        Plugin.Log.Warning($"Error fetching rooms: {ex.Message}");
        return new List<Room>();
      }
    }

    public async Task<LogTransactionResult> SetRoomStatusAsync(string venueId, string roomId, bool isOccupied, string? note)
    {
      if (!_client.IsConfigured)
        return new LogTransactionResult { Success = false, Error = "API not configured. Please set your API key in settings." };

      try
      {
        var request = new XIVAppSetRoomStatusRequest
        {
          VenueId = venueId,
          RoomId = roomId,
          IsOccupied = isOccupied,
          Note = note,
        };
        var response = await _client.Http.PostAsJsonAsync($"{_client.BaseUrl}/api/plugin/rooms/status", request);
        if (!response.IsSuccessStatusCode)
        {
          var error = await response.Content.ReadAsStringAsync();
          Plugin.Log.Warning($"Failed to set room status: {response.StatusCode} - {error}");
          return new LogTransactionResult { Success = false, Error = error };
        }
        return new LogTransactionResult { Success = true };
      }
      catch (Exception ex)
      {
        Plugin.Log.Warning($"Error setting room status: {ex.Message}");
        return new LogTransactionResult { Success = false, Error = ex.Message };
      }
    }
```

- [ ] **Step 3: Build the plugin**

Run: `dotnet build`
Expected: `Build succeeded.`

- [ ] **Step 4: Commit**

```bash
git add VenueManager/XIVAppApiModels.cs VenueManager/XIVAppVenueApi.cs
git commit -m "feat: add Room model, GetRoomsAsync, SetRoomStatusAsync"
```

## Context for Task 7

This is Task 7 of 12, the first plugin-side (C#) task. Both the read (`GetRoomsAsync`) and write (`SetRoomStatusAsync`) methods live on `XIVAppVenueApi` (not a new dedicated API class, and not `XIVAppPatronApi`) since rooms are venue-scoped, not patron-scoped — matching where `GetRolesAsync`/`GetServicesAsync`/`GetVipPatronsAsync`/`GetBannedPatronsAsync` already live. `SetRoomStatusAsync` reuses `LogTransactionResult` (the same `{Success, Error}` type already reused for `BanPatronAsync`), not a new result type.

This task ONLY adds models + client methods — nothing calls them yet (Task 8 builds the `RoomsTab` that consumes both).

---

## Task 8: Plugin — Rooms tab (poll-while-visible + toggle UI)

**Files:**
- Create: `VenueManager/UI/Tabs/RoomsTab.cs`

- [ ] **Step 1: Write the tab**

```csharp
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Dalamud.Bindings.ImGui;
using VenueManager.UI;

namespace VenueManager.Tabs;

public class RoomsTab
{
  private Plugin plugin;

  private List<Room> rooms = new();
  private bool loading = false;
  private string statusMessage = string.Empty;
  private bool statusIsError = false;
  private DateTime lastFetch = DateTime.MinValue;

  // Poll while this tab is visible — draw() is only called by MainWindow
  // when Rooms is the active tab, so this check naturally stops polling
  // the moment staff switch away. Matches ShiftsTab's exact pattern.
  private static readonly TimeSpan RefreshInterval = TimeSpan.FromSeconds(25);

  private Dictionary<string, string> noteDrafts = new();

  public RoomsTab(Plugin plugin)
  {
    this.plugin = plugin;
  }

  public void draw()
  {
    ImGui.BeginChild(1);

    if (plugin.xivAppClient == null || !plugin.xivAppClient.IsConfigured)
    {
      ThemeManager.ConfigBanner("XIV-App is not configured. Add your API key in Settings.");
      ImGui.EndChild();
      return;
    }

    if (string.IsNullOrEmpty(plugin.currentXivAppVenueId))
    {
      ThemeManager.ConfigBanner("No venue selected. Pick one in Settings.");
      ImGui.EndChild();
      return;
    }

    if (!loading && DateTime.Now - lastFetch > RefreshInterval)
    {
      _ = FetchRoomsAsync();
    }

    if (loading)
    {
      ImGui.TextDisabled("Loading...");
    }
    else
    {
      if (ImGui.SmallButton("Refresh"))
      {
        _ = FetchRoomsAsync();
      }
    }

    ImGui.Separator();

    if (rooms.Count == 0 && !loading)
    {
      ThemeManager.EmptyState("No rooms configured. Add rooms from the dashboard.");
      ImGui.EndChild();
      return;
    }

    foreach (var room in rooms)
      drawRoomRow(room);

    if (!string.IsNullOrEmpty(statusMessage))
    {
      ImGui.Spacing();
      ImGui.TextColored(statusIsError ? Colors.StatusErr : Colors.StatusOk, statusMessage);
    }

    ImGui.EndChild();
  }

  private void drawRoomRow(Room room)
  {
    var statusColor = room.IsOccupied ? Colors.XivRed : Colors.XivGreen;
    var statusLabel = room.IsOccupied ? "Occupied" : "Free";

    ImGui.TextColored(statusColor, statusLabel);
    ImGui.SameLine();
    ImGui.Text(room.Name);

    if (!string.IsNullOrEmpty(room.Note))
    {
      ImGui.SameLine();
      ImGui.TextDisabled($"({room.Note})");
    }

    string toggleLabel = room.IsOccupied ? $"Mark Free##{room.Id}" : $"Mark Occupied##{room.Id}";
    float btnWidth = ImGui.CalcTextSize(toggleLabel.Split('#')[0]).X + ImGui.GetStyle().FramePadding.X * 2;
    float rightEdge = ImGui.GetContentRegionAvail().X + ImGui.GetCursorPosX();
    ImGui.SameLine();
    ImGui.SetCursorPosX(rightEdge - btnWidth);

    using (ThemeManager.PrimaryButton())
    {
      if (ImGui.SmallButton(toggleLabel))
        _ = SetStatusAsync(room, !room.IsOccupied, room.Note);
    }

    if (!noteDrafts.TryGetValue(room.Id, out var draft))
      draft = room.Note ?? "";

    ImGui.PushItemWidth(200);
    if (ImGui.InputTextWithHint($"##note{room.Id}", "Note…", ref draft, 200, ImGuiInputTextFlags.EnterReturnsTrue))
    {
      _ = SetStatusAsync(room, room.IsOccupied, draft);
      noteDrafts.Remove(room.Id);
    }
    else
    {
      noteDrafts[room.Id] = draft;
    }
    ImGui.PopItemWidth();

    ImGui.Spacing();
  }

  private async Task FetchRoomsAsync()
  {
    if (plugin.xivAppClient == null || string.IsNullOrEmpty(plugin.currentXivAppVenueId))
      return;

    loading = true;
    try
    {
      rooms = await plugin.xivAppClient.Venue.GetRoomsAsync(plugin.currentXivAppVenueId);
      lastFetch = DateTime.Now;
    }
    catch (Exception ex)
    {
      Plugin.Log.Warning($"Error fetching rooms: {ex.Message}");
    }
    finally
    {
      loading = false;
    }
  }

  private async Task SetStatusAsync(Room room, bool isOccupied, string? note)
  {
    if (plugin.xivAppClient == null || string.IsNullOrEmpty(plugin.currentXivAppVenueId)) return;

    try
    {
      var result = await plugin.xivAppClient.Venue.SetRoomStatusAsync(plugin.currentXivAppVenueId, room.Id, isOccupied, note);
      if (result.Success)
      {
        statusMessage = $"{room.Name}: {(isOccupied ? "marked occupied" : "marked free")}";
        statusIsError = false;
        _ = FetchRoomsAsync();
      }
      else
      {
        statusMessage = $"Failed to update {room.Name}: {result.Error ?? "unknown error"}";
        statusIsError = true;
      }
    }
    catch (Exception ex)
    {
      statusMessage = $"Error: {ex.Message}";
      statusIsError = true;
    }
  }
}
```

- [ ] **Step 2: Build the plugin**

Run: `dotnet build`
Expected: `Build succeeded.`

- [ ] **Step 3: Commit**

```bash
git add VenueManager/UI/Tabs/RoomsTab.cs
git commit -m "feat: add RoomsTab with poll-while-visible refresh and status toggle"
```

## Context for Task 8

This is Task 8 of 12. `RoomsTab.cs` is modeled directly on `ShiftsTab.cs`'s structure (`lastFetch`/`RefreshInterval` auto-refresh check inside `draw()`, loading/status-message fields, `FetchXAsync`/action-method split) — that pattern already achieves "poll only while visible" for free, since `draw()` is only invoked by `MainWindow`'s tab-dispatch switch when Rooms is the currently selected tab (confirmed by reading `MainWindow.cs`'s `drawTabContent()` switch statement). No new visibility-tracking mechanism needed.

The inline note editing uses `ImGuiInputTextFlags.EnterReturnsTrue` (press Enter to submit) rather than a separate Save button, since ImGui text inputs in a table-like row list don't have the same "click to reveal, Save/Cancel" affordance the web dashboard uses — this is a different, ImGui-native interaction pattern, not an attempt to mirror the web UI 1:1. The `noteDrafts` dictionary holds in-progress typing per room so switching between rows doesn't lose unsaved text, then clears on submit.

**Colors**: free = `Colors.XivGreen`, occupied = `Colors.XivRed` — both pre-existing constants in `Colors.cs`, matching the "green=free/red=occupied" semantic the design spec called for (no color invented).

---

## Task 9: Wire RoomsTab into MainWindow

**Files:**
- Modify: `VenueManager/Windows/MainWindow.cs`

- [ ] **Step 1: Add the field and constructor initialization**

Add near the other tab fields (after `private ShiftsTab shiftsTab;`):

```csharp
    private RoomsTab roomsTab;
```

Add to the constructor (after `this.shiftsTab = new ShiftsTab(plugin);`):

```csharp
        this.roomsTab      = new RoomsTab(plugin);
```

- [ ] **Step 2: Add to the `Tab` enum**

Change:

```csharp
    private enum Tab { Patrons, Sales, History, Shift, Venues, Settings }
```

to:

```csharp
    private enum Tab { Patrons, Sales, History, Shift, Rooms, Venues, Settings }
```

- [ ] **Step 3: Add to `OpenTab`'s name-to-enum mapping**

```csharp
    public void OpenTab(string name)
    {
        _currentTab = name switch
        {
            "Patrons"  => Tab.Patrons,
            "Sales"    => Tab.Sales,
            "History"  => Tab.History,
            "My Shift" => Tab.Shift,
            "Rooms"    => Tab.Rooms,
            "Venues"   => Tab.Venues,
            "Settings" => Tab.Settings,
            _          => _currentTab,
        };
    }
```

- [ ] **Step 4: Add the nav icon**

In `drawNavIcons()`, add after the `Tab.Shift` nav button:

```csharp
        navButton(Tab.Shift,   FontAwesomeIcon.CalendarCheck,   "My Shift");

        navButton(Tab.Rooms,   FontAwesomeIcon.DoorOpen,        "Rooms");
```

(No `configuration.showXTab`-style visibility toggle — unlike Patrons/History/Venues, which are conditionally shown via `configuration.showGuestsTab`/`showVenueTab`, Rooms has no such setting; it's always shown, matching how `Sales`/`Shift`/`Settings` are always shown.)

- [ ] **Step 5: Dispatch to `roomsTab.draw()`**

In `drawTabContent()`'s switch statement:

```csharp
        switch (_currentTab)
        {
            case Tab.Patrons:  guestsTab.draw();    break;
            case Tab.Sales:    salesTab.draw();     break;
            case Tab.History:  guestLogTab.draw();  break;
            case Tab.Shift:    shiftsTab.draw();    break;
            case Tab.Rooms:    roomsTab.draw();     break;
            case Tab.Venues:   venuesTab.draw();    break;
            case Tab.Settings: settingsTab.draw();  break;
        }
```

- [ ] **Step 6: Build the plugin**

Run: `dotnet build`
Expected: `Build succeeded.`

- [ ] **Step 7: Commit**

```bash
git add VenueManager/Windows/MainWindow.cs
git commit -m "feat: wire Rooms tab into MainWindow navigation"
```

## Context for Task 9

This is Task 9 of 12. `FontAwesomeIcon.DoorOpen` maps to the standard Font Awesome `fa-door-open` glyph — the same PascalCase-of-kebab-case naming convention already used by every other icon in this file (`UserFriends`, `DollarSign`, `CalendarCheck`, `Building`), so it's expected to resolve without needing a fallback.

---

## Task 10: Manual verification

**No automated test covers the full flow end-to-end** (no route-level or C# test infra in this repo, matching VIP/ban's own limitation, and no live DB in the implementation worktrees to exercise the SSE flow either). Requires a deployed server + real game client + two browser tabs (to verify live sync). Verify manually once deployed:

- [ ] **Step 1: Dashboard — room management (OWNER/MANAGER)**

1. Load `/dashboard/<slug>/rooms`. Add a room via the "New room name…" input.
2. Rename it via the "Rename" button (inline input).
3. Toggle it Free ↔ Occupied — confirm the tag color/label updates immediately (own action, no reload).
4. Add a note, confirm it displays and can be edited.
5. Delete it via "Delete" (confirms via browser `confirm()` dialog).

- [ ] **Step 2: Dashboard — live sync across two viewers**

1. Open `/dashboard/<slug>/rooms` in two browser tabs (or two different staff accounts).
2. Toggle a room's status in Tab A — confirm Tab B's board updates within a second or two, without reloading.
3. Confirm the "Last updated by" column reflects whoever made the change.

- [ ] **Step 3: Dashboard — permission boundaries**

1. As a regular STAFF member (not OWNER/MANAGER): confirm the Rooms page loads and status can be toggled, but Rename/Delete/Add-Room controls are NOT visible.
2. Confirm a STAFF-authenticated direct `POST`/`PATCH .../rooms` (list management) request gets a 403 even if attempted directly (not just hidden in the UI).

- [ ] **Step 4: Plugin — Rooms tab**

1. Open the Rooms tab in-game — confirm the room list loads (matching whatever exists on the dashboard for the selected venue).
2. Click "Mark Occupied"/"Mark Free" on a room — confirm the status flips and a status message shows.
3. Type a note and press Enter — confirm it saves (re-fetch shows the note).
4. While the Rooms tab is open, wait ~25-30s without doing anything — confirm the list auto-refreshes (e.g., toggle a room from the dashboard in another window, watch it appear in-game without clicking Refresh).
5. Switch to a different plugin tab (e.g., Sales) for a minute, then switch back to Rooms — confirm it refetches on return rather than showing a minute-stale list (the `lastFetch` check should trigger immediately since more than `RefreshInterval` has elapsed).

- [ ] **Step 5: Cross-surface sync**

1. Toggle a room from the plugin — confirm it shows up live on an open dashboard Rooms page (via SSE) without the dashboard needing to poll or reload.
2. Toggle a room from the dashboard — confirm the plugin's Rooms tab picks it up on its next poll cycle (within ~30s, or immediately if Refresh is clicked).
