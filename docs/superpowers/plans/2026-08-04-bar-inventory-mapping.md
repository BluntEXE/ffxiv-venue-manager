# Bar Inventory Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a venue opt in to inventory tracking, link a `Service` ("drink") to a real FFXIV item, set a stock count, and have both the dashboard and the plugin automatically block sales and decrement stock through the one shared transaction path — with no per-venue clutter for venues that don't run a bar.

**Architecture:** New `VenueInventorySettings` opt-in toggle (mirrors `VenuePotSettings`). `Service` gains nullable `linkedItemId`/`linkedItemName`/`linkedItemIcon`/`stockCount` fields — no new item table. Stock check-and-decrement lives once in the shared `createTransaction` helper (`apps/web/lib/api/transactions.ts`), so both the dashboard transaction route and the plugin's `/api/plugin/transactions` route enforce it automatically. Item search is two independent paths that converge on the same real item ID: a new server-side XIVAPI v2 proxy route for the dashboard, and a local Lumina `Item` sheet lookup for the plugin (same technique as the community `ItemSearchPlugin`). New plugin "Inventory" tab, gated on the fetched `enabled` flag, following the existing cache-once-per-venue-select lifecycle already used for VIP/ban/services.

**Tech Stack:** Next.js 15 (App Router) + Prisma + PostgreSQL (web), C#/.NET 10 Dalamud plugin with Lumina Excel-sheet access (game client). Vitest for pure logic (web), no route-level or C# test infrastructure in this repo — same limitation as VIP/ban/rooms.

---

## Task 1: Schema — `VenueInventorySettings` + `Service` inventory fields

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add the `VenueInventorySettings` model**

Add directly after the existing `VenuePotSettings` model (find it via `grep -n "model VenuePotSettings" apps/web/prisma/schema.prisma`, currently around line 756):

```prisma
model VenueInventorySettings {
  id        String   @id @default(cuid())
  venueId   String   @unique
  enabled   Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)

  @@map("venue_inventory_settings")
}
```

- [ ] **Step 2: Add the back-relation on `Venue`**

Current block (around line 222):

```prisma
  venuePotSettings  VenuePotSettings?
  potDistributions  PotDistribution[]

  @@map("venues")
```

Replace with:

```prisma
  venuePotSettings       VenuePotSettings?
  potDistributions       PotDistribution[]
  venueInventorySettings VenueInventorySettings?

  @@map("venues")
```

- [ ] **Step 3: Add inventory fields to `Service`**

Current model (around line 565):

```prisma
model Service {
  id          String  @id @default(cuid())
  venueId     String
  name        String
  description String? @db.Text
  price       Decimal @db.Decimal(10, 2)
  category    String?
  isActive    Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  venue        Venue         @relation(fields: [venueId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  roles        Role[] // Roles that can provide this service

  @@map("services")
}
```

Replace with:

```prisma
model Service {
  id          String  @id @default(cuid())
  venueId     String
  name        String
  description String? @db.Text
  price       Decimal @db.Decimal(10, 2)
  category    String?
  isActive    Boolean @default(true)

  // Bar inventory mapping — a drink is an existing Service with these
  // populated. linkedItemId is the real FFXIV item ID (source of truth);
  // name/icon are a display cache either search path can refresh.
  // stockCount null = not inventory-tracked, even when the venue's
  // VenueInventorySettings.enabled is true (opt-in per venue AND per service).
  linkedItemId   Int?
  linkedItemName String?
  linkedItemIcon Int?
  stockCount     Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  venue        Venue         @relation(fields: [venueId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  roles        Role[] // Roles that can provide this service

  @@map("services")
}
```

- [ ] **Step 4: Format and regenerate the Prisma client**

Run: `cd apps/web && npx prisma format --schema=prisma/schema.prisma`
Run: `pnpm postinstall` (regenerates the Prisma client — no DB connection needed for `generate`)
Run: `pnpm typecheck`
Expected: no errors (nothing references the new fields/model yet).

**Note:** this repo uses `prisma db push` against the live Postgres container, not migrations (see project conventions). Do not run `db push` from a worktree — that's a manual, deliberate step against the real database, done once when this feature is deployed (matches how VIP/ban/rooms were rolled out).

- [ ] **Step 5: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat: add VenueInventorySettings model and Service inventory fields"
```

---

## Task 2: Inventory settings API route (dashboard, session-authed)

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/inventory-settings/route.ts`

Mirrors `apps/web/app/api/venues/[venueId]/pot-settings/route.ts` exactly (same auth/membership resolution shape), with one field (`enabled`) instead of four.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const updateInventorySettingsSchema = z.object({
  enabled: z.boolean(),
})

async function resolveVenueAndMembership(
  venueId: string,
  userId: string
): Promise<
  | { error: NextResponse }
  | {
      venue: NonNullable<Awaited<ReturnType<typeof prisma.venue.findFirst>>>
      membership: NonNullable<Awaited<ReturnType<typeof prisma.membership.findFirst>>>
    }
> {
  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
  })
  if (!venue) return { error: NextResponse.json({ error: "Venue not found" }, { status: 404 }) }

  const membership = await prisma.membership.findFirst({
    where: { userId, venueId: venue.id, status: "active" },
  })
  if (!membership) {
    return { error: NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 }) }
  }
  return { venue, membership }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const { venueId } = await context.params
      const resolved = await resolveVenueAndMembership(venueId, session.user.id)
      if ("error" in resolved) return resolved.error

      const settings = await prisma.venueInventorySettings.findUnique({
        where: { venueId: resolved.venue.id },
      })

      return NextResponse.json({
        settings: settings ? { enabled: settings.enabled } : { enabled: false },
      })
    } catch (error) {
      console.error("Error fetching inventory settings:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const { venueId } = await context.params
      const resolved = await resolveVenueAndMembership(venueId, session.user.id)
      if ("error" in resolved) return resolved.error
      if (!["OWNER", "MANAGER"].includes(resolved.membership.role)) {
        return NextResponse.json(
          { error: "Only owners and managers can change inventory settings" },
          { status: 403 }
        )
      }

      const body = await request.json()
      const data = updateInventorySettingsSchema.parse(body)

      const settings = await prisma.venueInventorySettings.upsert({
        where: { venueId: resolved.venue.id },
        create: { venueId: resolved.venue.id, ...data },
        update: data,
      })

      return NextResponse.json({ settings: { enabled: settings.enabled } })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      console.error("Error updating inventory settings:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/inventory-settings/route.ts
git commit -m "feat: add venue inventory settings API route"
```

---

## Task 3: Plugin-facing inventory settings read (api-key-authed)

**Files:**
- Create: `apps/web/app/api/plugin/inventory-settings/route.ts`

The plugin needs to know whether inventory is enabled to decide whether to show its Inventory nav icon at all — it authenticates via `x-api-key`, not a session, so this is a separate route from Task 2's session-authed one (same split as every other plugin-facing GET in this codebase).

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/plugin/inventory-settings?venueId=…
 *
 * Read-only enabled flag for the plugin's Inventory tab nav icon.
 * Any active staff can read this (no OWNER/MANAGER gate) — same tier
 * as GET /api/plugin/services, which any active member can call.
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

    const settings = await prisma.venueInventorySettings.findUnique({
      where: { venueId },
      select: { enabled: true },
    })

    return NextResponse.json({ enabled: settings?.enabled ?? false })
  } catch (error) {
    console.error('[Plugin API] Error fetching inventory settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/plugin/inventory-settings/route.ts
git commit -m "feat: add plugin-facing inventory settings read endpoint"
```

---

## Task 4: Stock enforcement in the shared `createTransaction` helper

**Files:**
- Modify: `apps/web/lib/api/transactions.ts`
- Modify: `apps/web/app/api/venues/[venueId]/transactions/route.ts:172-215`
- Modify: `apps/web/app/api/plugin/transactions/route.ts`
- Test: `apps/web/lib/api/transactions.test.ts`

This is the single choke point both the dashboard's transaction POST route and the plugin's `/api/plugin/transactions` route already call — putting the stock check-and-decrement here means both surfaces enforce it identically with no duplicated logic.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/api/transactions.test.ts` doesn't exist yet. Create it (mirrors the existing pure-function test style used by `apps/web/lib/pot-payroll.test.ts` — mock `prisma` since there's no route-level DB test infra in this repo):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockService = { findUnique: vi.fn() }
const mockTransaction = { create: vi.fn() }
const mockEvent = { findFirst: vi.fn() }
const mockVenue = { findUnique: vi.fn() }
const mockMembership = { findFirst: vi.fn() }
const mockTx = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    service: mockService,
    transaction: mockTransaction,
    event: mockEvent,
    venue: mockVenue,
    membership: mockMembership,
    $transaction: (fn: (tx: unknown) => unknown) => {
      mockTx()
      return fn({
        service: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        transaction: mockTransaction,
      })
    },
  },
}))
vi.mock("@/lib/sse/venue-events", () => ({ venueEventBus: { emit: vi.fn() } }))
vi.mock("@/lib/discord-webhook", () => ({
  sendDiscordWebhook: vi.fn(),
  formatSaleLoggedEmbed: vi.fn(() => ({})),
  getWebhookUrlForType: vi.fn(() => null),
}))
vi.mock("@/lib/redis-cache", () => ({ invalidateCache: vi.fn() }))
vi.mock("@/lib/display-name", () => ({ resolveDisplayName: vi.fn(() => "Staffer") }))

import { createTransaction, InsufficientStockError } from "./transactions"

describe("createTransaction stock enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEvent.findFirst.mockResolvedValue(null)
    mockVenue.findUnique.mockResolvedValue(null)
    mockTransaction.create.mockResolvedValue({
      id: "txn1",
      amount: 10,
      customerName: "Bob",
      notes: null,
      createdAt: new Date(),
      service: null,
      event: null,
      staff: null,
    })
  })

  it("rejects a sale when the service is out of stock", async () => {
    mockService.findUnique.mockResolvedValue({ stockCount: 0 })

    await expect(
      createTransaction("venue1", "user1", {
        serviceId: "svc1",
        type: "SALE",
        amount: 10,
        customerName: "Bob",
      } as any)
    ).rejects.toThrow(InsufficientStockError)

    expect(mockTransaction.create).not.toHaveBeenCalled()
  })

  it("allows a sale when stockCount is null (not tracked)", async () => {
    mockService.findUnique.mockResolvedValue({ stockCount: null })

    await expect(
      createTransaction("venue1", "user1", {
        serviceId: "svc1",
        type: "SALE",
        amount: 10,
        customerName: "Bob",
      } as any)
    ).resolves.toBeDefined()

    expect(mockTransaction.create).toHaveBeenCalled()
  })

  it("allows a sale and decrements stock when stockCount is positive", async () => {
    mockService.findUnique.mockResolvedValue({ stockCount: 5 })

    await createTransaction("venue1", "user1", {
      serviceId: "svc1",
      type: "SALE",
      amount: 10,
      customerName: "Bob",
    } as any)

    expect(mockTx).toHaveBeenCalled()
    expect(mockTransaction.create).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test transactions.test.ts`
Expected: FAIL — `InsufficientStockError` is not exported, and no stock check exists yet.

- [ ] **Step 3: Implement stock enforcement in `createTransaction`**

In `apps/web/lib/api/transactions.ts`, add the error class near the top (after the existing imports, before `createTransactionSchema`):

```ts
/**
 * Thrown by createTransaction when the target service has stockCount <= 0.
 * Callers translate this into a 409 response — it is a hard block, not a
 * warning, matching the approved bar-inventory-mapping design.
 */
export class InsufficientStockError extends Error {
  constructor(serviceId: string) {
    super(`Service ${serviceId} is out of stock`)
    this.name = "InsufficientStockError"
  }
}
```

Then replace the body of `createTransaction` (the section from the `eventId` resolution through the `prisma.transaction.create` call, currently lines 49-99) with:

```ts
  // If the caller didn't specify an event, attribute the sale to whatever
  // event is currently running at this venue (startTime <= now <= endTime,
  // status PUBLISHED or ACTIVE). Mirrors the lookup in
  // /api/plugin/events/active so sales logged during an event always count
  // toward its revenue, even if the client (plugin or web) doesn't pass
  // eventId explicitly.
  let eventId = input.eventId
  if (!eventId) {
    const now = new Date()
    const activeEvent = await prisma.event.findFirst({
      where: {
        venueId,
        startTime: { lte: now },
        endTime: { gte: now },
        status: { in: ["PUBLISHED", "ACTIVE"] },
      },
      orderBy: { startTime: "desc" },
      select: { id: true },
    })
    eventId = activeEvent?.id
  }

  // Stock check + create + decrement happen in one DB transaction so a
  // concurrent sale can't oversell the last unit. updateMany's gt:0 filter
  // is the atomic guard: if two requests race, only one's updateMany
  // affects a row, and the loser gets a hard 409 rather than a negative
  // stockCount.
  if (input.serviceId) {
    const service = await prisma.service.findUnique({
      where: { id: input.serviceId },
      select: { stockCount: true },
    })
    if (service && service.stockCount !== null && service.stockCount <= 0) {
      throw new InsufficientStockError(input.serviceId)
    }
  }

  const newTransaction = await prisma.$transaction(async (tx) => {
    if (input.serviceId) {
      const decremented = await tx.service.updateMany({
        where: { id: input.serviceId, stockCount: { gt: 0 } },
        data: { stockCount: { decrement: 1 } },
      })
      // decremented.count === 0 means either the service isn't
      // stock-tracked (stockCount is null, filtered out by gt:0 — fine,
      // not an error) or it hit zero between our findUnique check and
      // here (a real race — re-check to distinguish the two).
      if (decremented.count === 0) {
        const current = await tx.service.findUnique({
          where: { id: input.serviceId },
          select: { stockCount: true },
        })
        if (current && current.stockCount !== null && current.stockCount <= 0) {
          throw new InsufficientStockError(input.serviceId)
        }
      }
    }

    return tx.transaction.create({
      data: {
        venueId,
        serviceId: input.serviceId,
        eventId,
        staffId: staffUserId,
        type: input.type ?? "SALE",
        amount: input.amount,
        customerName: input.customerName,
        notes: input.notes,
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        event: {
          select: {
            id: true,
            title: true,
          },
        },
        staff: {
          select: {
            id: true,
            name: true,
            displayName: true,
            characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
          },
        },
      },
    })
  })
```

The rest of the function (staff nickname lookup, Discord webhook, cache invalidation, event emit, return) is unchanged — it already reads from `newTransaction`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm test transactions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Surface `InsufficientStockError` as a 409 in both callers**

In `apps/web/app/api/venues/[venueId]/transactions/route.ts`, find the `createTransaction` call (around line 210) and its surrounding try/catch. Add an import and a catch branch:

```ts
import { createTransaction, createTransactionSchema, InsufficientStockError } from "@/lib/api/transactions"
```

```ts
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    // ...existing catch-all handling below...
```

Do the same in `apps/web/app/api/plugin/transactions/route.ts` around its `createTransaction(venueId, auth.userId, input)` call (line 74) — import `InsufficientStockError` and add the same `instanceof` branch returning 409 before the existing generic 500 fallback.

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/api/transactions.ts apps/web/lib/api/transactions.test.ts apps/web/app/api/venues/[venueId]/transactions/route.ts apps/web/app/api/plugin/transactions/route.ts
git commit -m "feat: enforce stock hard-block and decrement in shared createTransaction"
```

---

## Task 5: XIVAPI v2 item-search proxy route (dashboard)

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/inventory/item-search/route.ts`

**Files:**
- Verify: real XIVAPI v2 response shape before writing the mapping code.

- [ ] **Step 1: Verify the real XIVAPI v2 search response shape**

Run this against the live public API (no auth needed) before writing any code — do not trust an assumed shape:

```bash
curl -s 'https://v2.xivapi.com/api/search?query=Name~"potion"&sheets=Item&fields=Name,Icon' | head -c 2000
```

Compare the actual JSON against the assumed shape below (`results[].row_id`, `results[].fields.Name`, `results[].fields.Icon.path` or `.id`). If the real response differs, adjust the `XivApiSearchResult` interface and field mapping in Step 2 to match what the curl actually returned — do not proceed with an unverified shape.

- [ ] **Step 2: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const XIVAPI_BASE_URL = process.env.XIVAPI_BASE_URL ?? "https://v2.xivapi.com"

interface XivApiSearchResult {
  row_id: number
  fields: {
    Name: string
    Icon?: { id?: number; path?: string }
  }
}

interface XivApiSearchResponse {
  results: XivApiSearchResult[]
}

export interface ItemSearchResult {
  itemId: number
  name: string
  iconId: number | null
}

export const GET = withRateLimit(
  async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { searchParams } = new URL(request.url)
      const query = searchParams.get("query")?.trim()
      if (!query || query.length < 2) {
        return NextResponse.json({ error: "query must be at least 2 characters" }, { status: 400 })
      }

      const url = `${XIVAPI_BASE_URL}/api/search?query=Name~"${encodeURIComponent(query)}"&sheets=Item&fields=Name,Icon&limit=20`
      const res = await fetch(url)
      if (!res.ok) {
        return NextResponse.json({ error: "XIVAPI request failed" }, { status: 502 })
      }

      const data: XivApiSearchResponse = await res.json()
      const items: ItemSearchResult[] = (data.results ?? []).map((r) => ({
        itemId: r.row_id,
        name: r.fields.Name,
        iconId: r.fields.Icon?.id ?? null,
      }))

      return NextResponse.json({ items })
    } catch (error) {
      console.error("Error searching XIVAPI:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/inventory/item-search/route.ts
git commit -m "feat: add XIVAPI v2 item-search proxy route"
```

---

## Task 6: Extend Service CRUD + plugin services read with inventory fields

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/services/[serviceId]/route.ts:9-15,110-135`
- Modify: `apps/web/app/api/venues/[venueId]/services/route.ts` (POST create schema — find via `grep -n "createServiceSchema\|export const POST" apps/web/app/api/venues/\[venueId\]/services/route.ts`)
- Modify: `apps/web/app/api/plugin/services/route.ts:75-80`

- [ ] **Step 1: Extend the update schema and response in the service-by-id route**

In `apps/web/app/api/venues/[venueId]/services/[serviceId]/route.ts`, replace the schema at lines 9-15:

```ts
const updateServiceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  price: z.number().min(0).optional(),
  roleIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  linkedItemId: z.number().int().positive().nullable().optional(),
  linkedItemName: z.string().nullable().optional(),
  linkedItemIcon: z.number().int().nullable().optional(),
  stockCount: z.number().int().min(0).nullable().optional(),
})
```

The `PUT` handler (lines 110-135) already spreads `...validatedData` into `prisma.service.update`'s `data`, so the new optional fields pass through with no further change to that handler.

- [ ] **Step 2: Extend the create schema in the services list route**

Read `apps/web/app/api/venues/[venueId]/services/route.ts` first to find its `createServiceSchema` (or equivalently named Zod object) and `POST` handler, then add the same four optional fields (`linkedItemId`, `linkedItemName`, `linkedItemIcon`, `stockCount`) to that schema, and pass them through in the `prisma.service.create({ data: {...} })` call the same way `name`/`description`/`price` already are.

- [ ] **Step 3: Include `stockCount` in the plugin's services response**

In `apps/web/app/api/plugin/services/route.ts`, the response mapping (lines 75-80):

```ts
    const services = Array.from(serviceMap.values()).map((svc) => ({
      id: svc.id,
      name: svc.name,
      description: svc.description,
      price: svc.price.toString(),
      category: svc.category,
    }))
```

Add `stockCount`:

```ts
    const services = Array.from(serviceMap.values()).map((svc) => ({
      id: svc.id,
      name: svc.name,
      description: svc.description,
      price: svc.price.toString(),
      category: svc.category,
      stockCount: svc.stockCount,
    }))
```

This requires the role's `include: { services: true }` up the chain (already present at the query above) to select all `Service` columns by default, which Prisma does — no explicit `select` list exists there today, so `stockCount` is already available on `svc`.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/services/[serviceId]/route.ts apps/web/app/api/venues/[venueId]/services/route.ts apps/web/app/api/plugin/services/route.ts
git commit -m "feat: expose inventory fields on service CRUD and plugin services read"
```

---

## Task 7: Dashboard Settings page — inventory toggle

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

Mirrors the existing pot-settings toggle exactly (fetch on mount at `page.tsx:213-221`, checkbox + conditional block at `page.tsx:1063-1103`).

- [ ] **Step 1: Add state and fetch**

Near the existing `potEnabled` state declaration, add:

```ts
  const [inventoryEnabled, setInventoryEnabled] = useState(false)
```

Near the existing pot-settings fetch (`page.tsx:213-221`), add a sibling fetch:

```ts
    fetch(`/api/venues/${venue.id}/inventory-settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        setInventoryEnabled(data.settings.enabled)
      })
```

- [ ] **Step 2: Add the toggle UI**

Near the existing pot-settings toggle block (`page.tsx:1063-1103`), add a parallel block:

```tsx
<label className="flex items-center gap-2 cursor-pointer ml-auto shrink-0">
  <input
    type="checkbox"
    checked={inventoryEnabled}
    onChange={(e) => setInventoryEnabled(e.target.checked)}
    className="rounded"
  />
  <span className="text-sm">{inventoryEnabled ? "Enabled" : "Disabled"}</span>
</label>
```

- [ ] **Step 3: Add the save call**

Find the existing pot-settings save handler (search for the `PUT` call to `/api/venues/${venue.id}/pot-settings` in this file) and add a sibling call in the same save flow:

```ts
    await fetch(`/api/venues/${venue.id}/inventory-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: inventoryEnabled }),
    })
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/[slug]/settings/page.tsx
git commit -m "feat: add inventory tracking toggle to venue settings"
```

---

## Task 8: Dashboard Services page — item picker, stock field, low-stock badge

**Files:**
- Create: `apps/web/components/item-search-combobox.tsx`
- Modify: `apps/web/app/dashboard/[slug]/services/page.tsx`

- [ ] **Step 1: Create the reusable item search combobox**

```tsx
"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"

interface ItemSearchResult {
  itemId: number
  name: string
  iconId: number | null
}

interface ItemSearchComboboxProps {
  venueId: string
  value: { itemId: number; name: string; iconId: number | null } | null
  onChange: (item: { itemId: number; name: string; iconId: number | null } | null) => void
}

export function ItemSearchCombobox({ venueId, value, onChange }: ItemSearchComboboxProps) {
  const [query, setQuery] = useState(value?.name ?? "")
  const [results, setResults] = useState<ItemSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(
        `/api/venues/${venueId}/inventory/item-search?query=${encodeURIComponent(query)}`
      )
      if (res.ok) {
        const data = await res.json()
        setResults(data.items)
        setIsOpen(true)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, venueId])

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (value) onChange(null)
        }}
        placeholder="Search FFXIV item…"
      />
      {isOpen && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.map((item) => (
            <button
              key={item.itemId}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onChange(item)
                setQuery(item.name)
                setIsOpen(false)
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Extend the `Service` interface and `formData` state**

In `apps/web/app/dashboard/[slug]/services/page.tsx`, the `Service` interface (around line 50):

```ts
interface Service {
  id: string
  name: string
  description: string | null
  price: number
  category?: string | null
  isActive: boolean
  linkedItemId?: number | null
  linkedItemName?: string | null
  linkedItemIcon?: number | null
  stockCount?: number | null
  roles?: Role[]
  _count?: {
    transactions: number
  }
}
```

Add inventory fields to `formData` state (every place `formData` is initialized — the `useState` declaration, `openCreateDialog`, `openEditDialog`, and the two post-submit resets in `handleCreateService`/`handleEditService` all currently write the literal `{ name: "", description: "", price: "", selectedRoleIds: [] as string[], isActive: true }` or the `openEditDialog` equivalent populated from `service`). Add these two fields to the shared shape everywhere it's constructed:

```ts
    linkedItem: null as { itemId: number; name: string; iconId: number | null } | null,
    stockCount: "" as string,
```

In `openEditDialog` specifically, populate from the service being edited:

```ts
      linkedItem: service.linkedItemId
        ? { itemId: service.linkedItemId, name: service.linkedItemName ?? "", iconId: service.linkedItemIcon ?? null }
        : null,
      stockCount: service.stockCount != null ? String(service.stockCount) : "",
```

- [ ] **Step 3: Fetch the venue's inventory-enabled flag**

Add state near `isLoading`:

```ts
  const [inventoryEnabled, setInventoryEnabled] = useState(false)
```

In the existing data-loading effect (the one that fetches `/api/venues/${venue.id}/services` and `/api/venues/${venue.id}/roles` around line 118-119), add a sibling fetch:

```ts
        fetch(`/api/venues/${venue.id}/inventory-settings`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setInventoryEnabled(data.settings.enabled)
          }),
```

- [ ] **Step 4: Add item picker + stock field to both dialogs, gated on `inventoryEnabled`**

In both the create dialog (around line 445-539) and edit dialog (around line 544-631), immediately after the existing `isActive` `Switch` control, add:

```tsx
{inventoryEnabled && (
  <div className="space-y-2 border-t pt-4">
    <Label>Linked FFXIV Item (optional)</Label>
    <ItemSearchCombobox
      venueId={venueId}
      value={formData.linkedItem}
      onChange={(item) => setFormData({ ...formData, linkedItem: item })}
    />
    <Label>Stock Count (leave blank if not tracked)</Label>
    <Input
      type="number"
      min="0"
      value={formData.stockCount}
      onChange={(e) => setFormData({ ...formData, stockCount: e.target.value })}
    />
  </div>
)}
```

This requires `venueId` in scope — the component currently resolves venue id inline inside each handler via a fresh `fetch("/api/venues")` call rather than storing it in state. Add a `venueId` state variable set once in the initial load effect (alongside the existing venue lookup at line ~109) and reuse it here and in the three handlers below instead of re-fetching `/api/venues` each time:

```ts
  const [venueId, setVenueId] = useState<string>("")
```

Set it where the venue is first resolved (the effect around line 109), and replace the repeated `const venueResponse = await fetch(...); const venue = venues.find(...)` blocks in `handleCreateService`, `handleEditService`, and `handleDeleteService`/`handleToggleService` with direct use of the `venueId` state — this is a pre-existing pattern of redundant fetches this task's new UI would otherwise have to duplicate a fifth time.

- [ ] **Step 5: Send inventory fields on create/edit**

In `handleCreateService`'s `body: JSON.stringify({...})` (around line 158-164) and `handleEditService`'s (around line 203-209), add:

```ts
          linkedItemId: formData.linkedItem?.itemId ?? null,
          linkedItemName: formData.linkedItem?.name ?? null,
          linkedItemIcon: formData.linkedItem?.iconId ?? null,
          stockCount: formData.stockCount.trim() === "" ? null : parseInt(formData.stockCount, 10),
```

- [ ] **Step 6: Low-stock badge in the service row**

In the row-rendering section (list of services, search for where `service.name` and `service.isActive` are rendered as a `Badge`), add a badge when the service is stock-tracked and at or below the fixed default threshold:

```tsx
{service.stockCount != null && service.stockCount <= 5 && (
  <Badge variant="destructive">
    {service.stockCount === 0 ? "Out of stock" : `Low stock: ${service.stockCount}`}
  </Badge>
)}
```

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/item-search-combobox.tsx apps/web/app/dashboard/[slug]/services/page.tsx
git commit -m "feat: add item linking and stock tracking to Services page"
```

---

## Task 9: Plugin — models and API client methods

**Files:**
- Modify: `VenueManager/VenueManager/XIVAppApiModels.cs:25-41`
- Modify: `VenueManager/VenueManager/XIVAppVenueApi.cs`

- [ ] **Step 1: Extend the `Service` model**

In `XIVAppApiModels.cs`, replace the `Service` class (lines 25-41):

```csharp
  public class Service
  {
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("price")]
    public string Price { get; set; } = "";

    [JsonPropertyName("category")]
    public string? Category { get; set; }

    [JsonPropertyName("stockCount")]
    public int? StockCount { get; set; }
  }
```

- [ ] **Step 2: Add request/response models for link-item, restock, and inventory settings**

Add to the same file, after the `Service`/`ServicesResponse` classes:

```csharp
  public class XIVAppLinkItemRequest
  {
    [JsonPropertyName("venueId")]
    public string VenueId { get; set; } = "";

    [JsonPropertyName("serviceId")]
    public string ServiceId { get; set; } = "";

    [JsonPropertyName("itemId")]
    public int ItemId { get; set; }

    [JsonPropertyName("itemName")]
    public string ItemName { get; set; } = "";

    [JsonPropertyName("iconId")]
    public int? IconId { get; set; }
  }

  public class XIVAppRestockRequest
  {
    [JsonPropertyName("venueId")]
    public string VenueId { get; set; } = "";

    [JsonPropertyName("serviceId")]
    public string ServiceId { get; set; } = "";

    [JsonPropertyName("stockCount")]
    public int StockCount { get; set; }
  }

  public class XIVAppInventorySettingsResponse
  {
    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; }
  }
```

- [ ] **Step 3: Add API client methods**

In `XIVAppVenueApi.cs`, add these three methods (following the exact try/catch/log pattern of `GetRoomsAsync`/`SetRoomStatusAsync`):

```csharp
    public async Task<bool> GetInventoryEnabledAsync(string venueId)
    {
      if (!_client.IsConfigured) return false;
      try
      {
        var response = await _client.Http.GetAsync($"{_client.BaseUrl}/api/plugin/inventory-settings?venueId={venueId}");
        if (!response.IsSuccessStatusCode) return false;
        var result = await response.Content.ReadFromJsonAsync<XIVAppInventorySettingsResponse>();
        return result?.Enabled ?? false;
      }
      catch (Exception ex)
      {
        Plugin.Log.Warning($"Error fetching inventory settings: {ex.Message}");
        return false;
      }
    }

    public async Task<LogTransactionResult> LinkItemAsync(string venueId, string serviceId, int itemId, string itemName, int? iconId)
    {
      if (!_client.IsConfigured)
        return new LogTransactionResult { Success = false, Error = "API not configured. Please set your API key in settings." };

      try
      {
        var request = new XIVAppLinkItemRequest
        {
          VenueId = venueId,
          ServiceId = serviceId,
          ItemId = itemId,
          ItemName = itemName,
          IconId = iconId,
        };
        var response = await _client.Http.PostAsJsonAsync($"{_client.BaseUrl}/api/plugin/inventory/link-item", request);
        if (!response.IsSuccessStatusCode)
        {
          var error = await response.Content.ReadAsStringAsync();
          Plugin.Log.Warning($"Failed to link item: {response.StatusCode} - {error}");
          return new LogTransactionResult { Success = false, Error = error };
        }
        return new LogTransactionResult { Success = true };
      }
      catch (Exception ex)
      {
        Plugin.Log.Warning($"Error linking item: {ex.Message}");
        return new LogTransactionResult { Success = false, Error = ex.Message };
      }
    }

    public async Task<LogTransactionResult> RestockAsync(string venueId, string serviceId, int stockCount)
    {
      if (!_client.IsConfigured)
        return new LogTransactionResult { Success = false, Error = "API not configured. Please set your API key in settings." };

      try
      {
        var request = new XIVAppRestockRequest { VenueId = venueId, ServiceId = serviceId, StockCount = stockCount };
        var response = await _client.Http.PostAsJsonAsync($"{_client.BaseUrl}/api/plugin/inventory/restock", request);
        if (!response.IsSuccessStatusCode)
        {
          var error = await response.Content.ReadAsStringAsync();
          Plugin.Log.Warning($"Failed to restock: {response.StatusCode} - {error}");
          return new LogTransactionResult { Success = false, Error = error };
        }
        return new LogTransactionResult { Success = true };
      }
      catch (Exception ex)
      {
        Plugin.Log.Warning($"Error restocking: {ex.Message}");
        return new LogTransactionResult { Success = false, Error = ex.Message };
      }
    }
```

- [ ] **Step 4: Build**

Run: `dotnet build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add VenueManager/VenueManager/XIVAppApiModels.cs VenueManager/VenueManager/XIVAppVenueApi.cs
git commit -m "feat: add inventory API client methods and models"
```

---

## Task 10: Web — inventory write routes (link-item, restock, OWNER/MANAGER only)

**Files:**
- Create: `apps/web/app/api/plugin/inventory/link-item/route.ts`
- Create: `apps/web/app/api/plugin/inventory/restock/route.ts`

Both mirror `apps/web/app/api/plugin/rooms/status/route.ts`'s structure but use the inline OWNER/MANAGER membership check (like `apps/web/app/api/plugin/patrons/ban/route.ts:51-56`) since this is a stricter two-role tier than `checkPermission`'s general STAFF-inclusive actions.

- [ ] **Step 1: Write the link-item route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

interface LinkItemPayload {
  venueId: string
  serviceId: string
  itemId: number
  itemName: string
  iconId?: number | null
}

/**
 * POST /api/plugin/inventory/link-item
 *
 * Link a Service to a real FFXIV item ID from the plugin's Inventory tab
 * (local Lumina search). OWNER/MANAGER only, same tier as editing a
 * Service from the dashboard.
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

    const body: LinkItemPayload = await request.json()
    const { venueId, serviceId, itemId, itemName, iconId } = body

    if (!venueId || !serviceId || !itemId || !itemName) {
      return NextResponse.json(
        { error: 'Missing required fields: venueId, serviceId, itemId, itemName' },
        { status: 400 }
      )
    }

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: 'Invalid venue' }, { status: 400 })
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, venueId, status: 'active' },
    })
    if (!membership || !['OWNER', 'MANAGER'].includes(membership.role)) {
      return NextResponse.json({ error: 'Owner or Manager role required' }, { status: 403 })
    }

    const service = await prisma.service.findFirst({ where: { id: serviceId, venueId } })
    if (!service) {
      return NextResponse.json({ error: 'Service not found in this venue' }, { status: 404 })
    }

    await prisma.service.update({
      where: { id: serviceId },
      data: { linkedItemId: itemId, linkedItemName: itemName, linkedItemIcon: iconId ?? null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Plugin API] Error linking item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Write the restock route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

interface RestockPayload {
  venueId: string
  serviceId: string
  stockCount: number
}

/**
 * POST /api/plugin/inventory/restock
 *
 * Set a Service's stockCount from the plugin's Inventory tab. OWNER/
 * MANAGER only — the automatic per-sale decrement (any staff, via
 * createTransaction) is a separate path from this explicit management
 * action.
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

    const body: RestockPayload = await request.json()
    const { venueId, serviceId, stockCount } = body

    if (!venueId || !serviceId || typeof stockCount !== 'number' || stockCount < 0) {
      return NextResponse.json(
        { error: 'Missing or invalid fields: venueId, serviceId, stockCount (>= 0)' },
        { status: 400 }
      )
    }

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: 'Invalid venue' }, { status: 400 })
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, venueId, status: 'active' },
    })
    if (!membership || !['OWNER', 'MANAGER'].includes(membership.role)) {
      return NextResponse.json({ error: 'Owner or Manager role required' }, { status: 403 })
    }

    const service = await prisma.service.findFirst({ where: { id: serviceId, venueId } })
    if (!service) {
      return NextResponse.json({ error: 'Service not found in this venue' }, { status: 404 })
    }

    await prisma.service.update({
      where: { id: serviceId },
      data: { stockCount },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Plugin API] Error restocking:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/plugin/inventory/link-item/route.ts apps/web/app/api/plugin/inventory/restock/route.ts
git commit -m "feat: add plugin-facing link-item and restock routes"
```

---

## Task 11: Plugin — local Lumina item search helper

**Files:**
- Create: `VenueManager/VenueManager/ItemSearch.cs`

Same technique as the community `ItemSearchPlugin` (`/xlitem`): direct `GetExcelSheet<Item>()` lookup, no network call. Follows the existing `TerritoryUtils.cs:158` / `Venue.cs:17-18` call pattern (`Plugin.DataManager.GetExcelSheet<...>()`).

- [ ] **Step 1: Write the helper**

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace VenueManager
{
  public class ItemSearchResult
  {
    public uint ItemId { get; set; }
    public string Name { get; set; } = "";
    public uint IconId { get; set; }
  }

  public static class ItemSearch
  {
    // Local Lumina lookup — no network call needed, unlike the dashboard's
    // XIVAPI proxy. Both paths converge on the same real item ID.
    public static List<ItemSearchResult> Search(string query, int limit = 20)
    {
      if (string.IsNullOrWhiteSpace(query) || query.Trim().Length < 2)
        return new List<ItemSearchResult>();

      var sheet = Plugin.DataManager.GetExcelSheet<Lumina.Excel.Sheets.Item>();
      if (sheet == null) return new List<ItemSearchResult>();

      var needle = query.Trim();
      return sheet
        .Where(item => !string.IsNullOrEmpty(item.Name.ExtractText())
                     && item.Name.ExtractText().Contains(needle, StringComparison.OrdinalIgnoreCase))
        .Take(limit)
        .Select(item => new ItemSearchResult
        {
          ItemId = item.RowId,
          Name = item.Name.ExtractText(),
          IconId = item.Icon,
        })
        .ToList();
    }
  }
}
```

- [ ] **Step 2: Build**

Run: `dotnet build`
Expected: build succeeds. If `Item.Name` or `Item.Icon` field names differ in the installed Lumina/FFXIVClientStructs version, fix the field access to match the actual generated `Lumina.Excel.Sheets.Item` type (check via IDE autocomplete or `dotnet build` error output — this sheet's exact property names can shift between Dalamud API levels).

- [ ] **Step 3: Commit**

```bash
git add VenueManager/VenueManager/ItemSearch.cs
git commit -m "feat: add local Lumina item search helper"
```

---

## Task 12: Plugin — Inventory tab

**Files:**
- Create: `VenueManager/VenueManager/UI/Tabs/InventoryTab.cs`

Follows the cache-once-per-venue-select lifecycle (reads `plugin.availableServices`, no polling in `draw()`) rather than the Rooms tab's live-polling exception, since stock/link data changes only on explicit management actions, not ambient state like room occupancy.

- [ ] **Step 1: Write the tab**

```csharp
using System;
using System.Collections.Generic;
using System.Numerics;
using Dalamud.Bindings.ImGui;

namespace VenueManager.UI.Tabs
{
  public class InventoryTab
  {
    private Plugin plugin;
    private string searchQuery = "";
    private List<ItemSearchResult> searchResults = new();
    private string? linkingServiceId = null;
    private string restockInput = "";
    private string? restockingServiceId = null;

    public InventoryTab(Plugin plugin)
    {
      this.plugin = plugin;
    }

    public void draw()
    {
      ImGui.BeginChild("##inventory", new Vector2(-1, -1), false);

      if (string.IsNullOrEmpty(plugin.currentXivAppVenueId))
      {
        ImGui.TextColored(Colors.XivSubtext0, "Select a venue in Settings first.");
        ImGui.EndChild();
        return;
      }

      bool isManager = plugin.pluginState.userRole == "OWNER" || plugin.pluginState.userRole == "MANAGER";

      foreach (var service in plugin.availableServices)
      {
        drawServiceRow(service, isManager);
      }

      ImGui.EndChild();
    }

    private void drawServiceRow(Service service, bool isManager)
    {
      ImGui.PushID(service.Id);
      ImGui.Separator();

      ImGui.TextColored(Colors.XivBlue, service.Name);

      if (service.StockCount.HasValue)
      {
        bool low = service.StockCount.Value <= 5;
        ImGui.SameLine();
        ImGui.TextColored(low ? Colors.XivRed : Colors.XivSubtext0, $"({service.StockCount.Value} in stock)");
      }
      else
      {
        ImGui.SameLine();
        ImGui.TextColored(Colors.XivOverlay0, "(not tracked)");
      }

      if (isManager)
      {
        if (ImGui.SmallButton("Link Item"))
        {
          linkingServiceId = linkingServiceId == service.Id ? null : service.Id;
          searchQuery = "";
          searchResults.Clear();
        }
        ImGui.SameLine();
        if (ImGui.SmallButton("Restock"))
        {
          restockingServiceId = restockingServiceId == service.Id ? null : service.Id;
          restockInput = service.StockCount?.ToString() ?? "";
        }

        if (linkingServiceId == service.Id) drawLinkItemPanel(service);
        if (restockingServiceId == service.Id) drawRestockPanel(service);
      }

      ImGui.PopID();
    }

    private void drawLinkItemPanel(Service service)
    {
      ImGui.Indent();
      if (ImGui.InputText("Item name##search", ref searchQuery, 100))
      {
        searchResults = ItemSearch.Search(searchQuery);
      }

      foreach (var result in searchResults)
      {
        if (ImGui.Selectable($"{result.Name}##{result.ItemId}"))
        {
          _ = LinkItemAsync(service.Id, (int)result.ItemId, result.Name, (int)result.IconId);
        }
      }
      ImGui.Unindent();
    }

    private void drawRestockPanel(Service service)
    {
      ImGui.Indent();
      ImGui.InputText("Stock count##restock", ref restockInput, 10);
      if (ImGui.SmallButton("Save##restock"))
      {
        if (int.TryParse(restockInput, out var count) && count >= 0)
        {
          _ = RestockAsync(service.Id, count);
        }
      }
      ImGui.Unindent();
    }

    private async System.Threading.Tasks.Task LinkItemAsync(string serviceId, int itemId, string itemName, int iconId)
    {
      if (plugin.xivAppClient == null) return;
      var result = await plugin.xivAppClient.Venue.LinkItemAsync(plugin.currentXivAppVenueId, serviceId, itemId, itemName, iconId);
      if (result.Success)
      {
        linkingServiceId = null;
        var servicesResp = await plugin.xivAppClient.Venue.GetServicesAsync(plugin.currentXivAppVenueId);
        plugin.availableServices = servicesResp?.Services ?? plugin.availableServices;
      }
      else
      {
        Plugin.Log.Warning($"Failed to link item: {result.Error}");
      }
    }

    private async System.Threading.Tasks.Task RestockAsync(string serviceId, int count)
    {
      if (plugin.xivAppClient == null) return;
      var result = await plugin.xivAppClient.Venue.RestockAsync(plugin.currentXivAppVenueId, serviceId, count);
      if (result.Success)
      {
        restockingServiceId = null;
        var servicesResp = await plugin.xivAppClient.Venue.GetServicesAsync(plugin.currentXivAppVenueId);
        plugin.availableServices = servicesResp?.Services ?? plugin.availableServices;
      }
      else
      {
        Plugin.Log.Warning($"Failed to restock: {result.Error}");
      }
    }
  }
}
```

**Note:** confirm the actual property name for the current user's role on `plugin.pluginState` (used here as `plugin.pluginState.userRole`) — check `Plugin.cs`/`PluginState`-equivalent for how `SettingsTab.cs` or the ban command already reads the caller's role client-side, and adjust `isManager`'s condition to match the real field/type (it may be a string, enum, or absent entirely if the plugin never stores it locally, in which case fall back to always showing the buttons and letting the server 403 — matching the ban command's existing "no local role check" precedent from Task reference in this plan).

- [ ] **Step 2: Build**

Run: `dotnet build`
Expected: build succeeds once the `isManager` field access above is corrected to match real plugin state.

- [ ] **Step 3: Commit**

```bash
git add VenueManager/VenueManager/UI/Tabs/InventoryTab.cs
git commit -m "feat: add plugin Inventory tab"
```

---

## Task 13: Wire Inventory tab into MainWindow + conditional nav icon

**Files:**
- Modify: `VenueManager/VenueManager/Windows/MainWindow.cs`
- Modify: `VenueManager/VenueManager/Plugin.cs:90,127-160`
- Modify: `VenueManager/VenueManager/UI/Tabs/SettingsTab.cs:687-696`

- [ ] **Step 1: Add the `xivAppInventoryEnabled` field and fetch it on venue (re)select**

In `Plugin.cs`, near the existing `public List<Service> availableServices = new();` (line 90), add:

```csharp
    public bool xivAppInventoryEnabled = false;
```

In `AutoLoadXivAppDataAsync` (around line 127-160), after the existing banned-patrons fetch:

```csharp
        xivAppInventoryEnabled = await xivAppClient.Venue.GetInventoryEnabledAsync(target.Id);
        Log.Information("Auto-loaded inventory-enabled={0} for venue {VenueId}", xivAppInventoryEnabled, target.Id);
```

In `SettingsTab.cs`'s `LoadVenueDataWithFeedbackAsync` (around line 687-696), add a sibling call after the existing `FetchXivAppBannedPatronsAsync(venueId)` line:

```csharp
    await FetchXivAppInventoryEnabledAsync(venueId);
```

And add the fetch method itself (mirrors `FetchXivAppBannedPatronsAsync` at line 810-819):

```csharp
  private async Task FetchXivAppInventoryEnabledAsync(string venueId)
  {
    try {
      if (plugin.xivAppClient == null || !plugin.xivAppClient.IsConfigured) return;

      plugin.xivAppInventoryEnabled = await plugin.xivAppClient.Venue.GetInventoryEnabledAsync(venueId);
      Plugin.Log.Information("Fetched inventory-enabled={0} for venue {1}", plugin.xivAppInventoryEnabled, venueId);
    } catch (Exception ex) {
      Plugin.Log.Error("Failed to fetch inventory settings: {0}", ex.Message);
    }
  }
```

- [ ] **Step 2: Add the tab to `MainWindow.cs`**

Add the field (near the other tab fields, e.g. `private RoomsTab roomsTab;`):

```csharp
    private InventoryTab inventoryTab;
```

Add to the `Tab` enum:

```csharp
    private enum Tab { Patrons, Sales, History, Shift, Rooms, Inventory, Venues, Settings }
```

Construct it in the constructor (alongside `this.roomsTab = new RoomsTab(plugin);`):

```csharp
        this.inventoryTab  = new InventoryTab(plugin);
```

Add to `OpenTab`'s switch:

```csharp
            "Inventory" => Tab.Inventory,
```

Add the conditional nav icon in `drawNavIcons()` (after the `Rooms` button, mirroring the existing `if (configuration.showVenueTab)` guard but keyed on the server-fetched flag instead of a local config toggle):

```csharp
        if (plugin.xivAppInventoryEnabled)
            navButton(Tab.Inventory, FontAwesomeIcon.Wineglass, "Inventory");
```

Add the fallback guard in `drawTabContent()` (alongside the existing `Tab.Venues` guard):

```csharp
        if (_currentTab == Tab.Inventory && !plugin.xivAppInventoryEnabled) _currentTab = Tab.Sales;
```

Add the dispatch case:

```csharp
            case Tab.Inventory: inventoryTab.draw(); break;
```

- [ ] **Step 3: Build**

Run: `dotnet build`
Expected: build succeeds. If `FontAwesomeIcon.Wineglass` doesn't exist in the installed Dalamud FontAwesome binding, pick any available drink-adjacent icon (`Beer`, `GlassMartini`, `Cocktail` are common alternatives) — check via IDE autocomplete on `FontAwesomeIcon.`.

- [ ] **Step 4: Commit**

```bash
git add VenueManager/VenueManager/Windows/MainWindow.cs VenueManager/VenueManager/Plugin.cs VenueManager/VenueManager/UI/Tabs/SettingsTab.cs
git commit -m "feat: wire Inventory tab into MainWindow with server-gated nav icon"
```

---

## Task 14: Plugin — Sales tab stock label

**Files:**
- Modify: `VenueManager/VenueManager/UI/Tabs/SalesTab.cs:91`

The existing service dropdown (already lists `plugin.availableServices`) gets a small "(N left)" label appended to stock-tracked drinks. Purely informational — enforcement happens server-side in `createTransaction` (Task 4); this just avoids surprising staff with a rejected sale.

- [ ] **Step 1: Find the dropdown label construction**

`SalesTab.cs:91` currently builds the dropdown from `plugin.availableServices` (exact label format may vary — read the surrounding ~10 lines to find where each service's display string is built, likely something like `service.Name` or `$"{service.Name} - {service.Price}g"`).

- [ ] **Step 2: Append the stock label**

Wherever the per-service label string is constructed, append a stock suffix when `StockCount` is set:

```csharp
var label = service.Name;
if (service.StockCount.HasValue)
{
  label += service.StockCount.Value <= 0 ? " (out of stock)" : $" ({service.StockCount.Value} left)";
}
```

Then use `label` in place of whatever the existing bare `service.Name` (or equivalent) reference was, in the dropdown item construction at line 91.

- [ ] **Step 3: Build**

Run: `dotnet build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add VenueManager/VenueManager/UI/Tabs/SalesTab.cs
git commit -m "feat: show stock count label in Sales tab service dropdown"
```

---

## Task 15: Manual verification

**No automated test covers the full flow end-to-end** (no route-level or C# test infra in this repo, matching VIP/ban/rooms). Requires a deployed server + real game client — cannot be performed in an isolated worktree. Verify manually once deployed:

- [ ] Toggle inventory on for a test venue in Settings → confirm the Services page shows the item picker/stock field, and the plugin's Inventory nav icon appears after a venue re-select (or plugin restart).
- [ ] Toggle inventory off → confirm both UIs hide the inventory controls again.
- [ ] Search and link a real FFXIV item from the dashboard Services page (verify the XIVAPI v2 search returns real results and the icon/name save correctly).
- [ ] Search and link a different item from the plugin's Inventory tab (verify local Lumina search works and converges on a real item ID).
- [ ] Set a stock count of 2 on a linked service from the dashboard.
- [ ] Log 2 sales of that service from the plugin's Sales tab → confirm the "(N left)" label counts down and the stock count decrements on the dashboard.
- [ ] Attempt a 3rd sale → confirm it's rejected with a 409 (both from the plugin and, separately, from the dashboard's own sale-logging UI if it exists) and stock stays at 0.
- [ ] Restock from the plugin's Inventory tab (OWNER/MANAGER account) → confirm the count updates and sales work again.
- [ ] Log in as a STAFF (non-OWNER/MANAGER) account → confirm they can see stock labels and log sales, but cannot see/use the Link Item or Restock controls.
- [ ] Leave a service's stock count blank (not tracked) while inventory is enabled venue-wide → confirm sales of that service are never blocked regardless of other services' stock.
