# Pot Payroll Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, per-venue "pot payroll" mode to XIV Venue Manager: nightly revenue/tip pooling with tax-cut, per-role payout modes (Standard/Pot/Contractor), and a "Generate pot payroll" action per completed Event, with zero effect on venues that don't enable it.

**Architecture:** New `VenuePotSettings` (1:1 Venue) and `PotDistribution` (1:1 Event, audit row) tables; `Role.potPayoutMode`/`contractorSharesPot`, `Shift.eventId`, `Membership.tipPooled` added to existing models; `PaymentType` enum gains `POT_SHARE`/`CONTRACTOR_PAYOUT`. All money math lives in one pure, DB-free function (`lib/pot-payroll.ts`) that a new API route calls after resolving Prisma data into plain inputs — mirrors how `lib/payroll-rates.ts` separates rate resolution from the route handler.

**Tech Stack:** Next.js App Router API routes, Prisma (Postgres, hand-authored SQL migrations — this repo does NOT use `prisma db push`, see Task 2 note), Zod validation, Vitest (net-new to `apps/web`, see Task 4).

**Spec:** `docs/superpowers/specs/2026-07-31-pot-payroll-design.md` (scope locked from prior brainstorming — do not re-open scope decisions; if a step below seems to need a scope change, stop and ask rather than deciding solo).

---

## Implementer notes (read before starting)

1. **Repo layout:** the actual app is at `apps/web`, not repo root. All paths below are relative to `/home/ehno/xiv-app/apps/web` unless prefixed otherwise.
2. **Migrations:** there is no `_prisma_migrations` table in this project's Postgres — `prisma migrate dev`/`deploy` are not the deploy path here. `prisma/migrations/` holds hand-authored SQL as repo-level documentation (4 folders so far, most recent `20260614000000_add_shift_audit_log`); the actual DDL gets applied by hand via `docker compose exec postgres psql`, then the `venue-manager` image is rebuilt so its baked-in Prisma client matches (see Task 2).
3. **No unit test runner exists in `apps/web` today.** The spec assumes "mirroring the existing `payroll-rates` test style" — that file has no tests. Task 4 adds Vitest fresh (matching the sibling `apps/shout-crafter` app's Vitest setup, the only precedent in the monorepo).
4. **`taxPercent` uses `Decimal(5,2)`**, unlike every other money field's `Decimal(10,2)` — this is intentional (it's a 0–100 percentage, not gil), not a typo to fix.

---

### Task 1: Prisma schema changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `PotPayoutMode` enum**

Add near the other enums (e.g. after the `PaymentType` enum, `prisma/schema.prisma:619-622`):

```prisma
enum PotPayoutMode {
  STANDARD
  POT
  CONTRACTOR
}
```

(No `@@map` — matches `PaymentType`'s own convention, not the spec draft's inconsistent `@@map("pot_payout_mode")`.)

- [ ] **Step 2: Extend `PaymentType` enum**

```prisma
enum PaymentType {
  FIXED_SALARY
  HOURLY
  POT_SHARE
  CONTRACTOR_PAYOUT
}
```

- [ ] **Step 3: Add fields to `Role` model** (`prisma/schema.prisma:324-345`)

```prisma
model Role {
  id               String   @id @default(cuid())
  venueId          String
  name             String
  color            String?  @default("#6366f1")
  responsibilities String?  @db.Text
  permissions      Json     @default("{}")
  hourlyRate       Decimal? @db.Decimal(10, 2)
  potPayoutMode       PotPayoutMode @default(STANDARD)
  contractorSharesPot Boolean       @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  venue         Venue                      @relation(fields: [venueId], references: [id], onDelete: Cascade)
  memberships   Membership[]
  additionalFor MembershipRoleAssignment[]
  shifts        Shift[]
  services      Service[]
  assignedTasks Task[]                     @relation("RoleTasks")

  @@unique([venueId, name])
  @@map("roles")
}
```

- [ ] **Step 4: Add `tipPooled` to `Membership`** (`prisma/schema.prisma:283-322`, next to the existing `hourlyRate` compensation field)

```prisma
  hourlyRate Decimal? @db.Decimal(10, 2)
  tipPooled  Boolean?
```

- [ ] **Step 5: Add `eventId`/`event` to `Shift`** (`prisma/schema.prisma:785-843`, alongside the existing `roleId`/`role` optional-FK pair)

```prisma
  roleId String?
  role   Role?   @relation(fields: [roleId], references: [id], onDelete: SetNull)
  eventId String?
  event   Event?  @relation(fields: [eventId], references: [id], onDelete: SetNull)
```

- [ ] **Step 6: Add `PotDistribution` model and `potDistributionId` on `PayrollEntry`**

```prisma
model PotDistribution {
  id              String   @id @default(cuid())
  venueId         String
  eventId         String
  regularSales    Decimal  @db.Decimal(10, 2)
  contractorSales Decimal  @db.Decimal(10, 2)
  pooledTips      Decimal  @db.Decimal(10, 2)
  taxPercent      Decimal  @db.Decimal(5, 2)
  potTotal        Decimal  @db.Decimal(10, 2)
  recipientCount  Int
  perPersonShare  Decimal  @db.Decimal(10, 2)
  generatedById   String
  generatedAt     DateTime @default(now())

  venue       Venue          @relation(fields: [venueId], references: [id], onDelete: Cascade)
  event       Event          @relation(fields: [eventId], references: [id], onDelete: Cascade)
  generatedBy User           @relation("PotDistributionGeneratedBy", fields: [generatedById], references: [id])
  entries     PayrollEntry[]

  @@unique([eventId])
  @@index([venueId])
  @@map("pot_distributions")
}
```

Add to `PayrollEntry` (`prisma/schema.prisma:619-665`):

```prisma
  potDistributionId String?
  potDistribution   PotDistribution? @relation(fields: [potDistributionId], references: [id], onDelete: SetNull)
```

Note the `User` relation name `"PotDistributionGeneratedBy"` — `User` already has a named relation `"PayrollPaidBy"` for `PayrollEntry.paidBy`; Prisma requires a distinct relation name here since `User` now has two different relations pointing at money-adjacent models with a `String` FK named similarly. Add `potDistributionsGenerated PotDistribution[] @relation("PotDistributionGeneratedBy")` to the `User` model's relations block.

- [ ] **Step 7: Add back-relations to `Venue` and `Event`**

`Venue` (`prisma/schema.prisma:200-215` relations block):
```prisma
  venuePotSettings VenuePotSettings?
  potDistributions PotDistribution[]
```

`Event` (`prisma/schema.prisma:383-434` relations):
```prisma
  shifts          Shift[]
  potDistribution PotDistribution?
```

- [ ] **Step 8: Add `VenuePotSettings` model**

```prisma
model VenuePotSettings {
  id                String  @id @default(cuid())
  venueId           String  @unique
  enabled           Boolean @default(false)
  taxPercent        Decimal @default(0) @db.Decimal(5, 2)
  includeSalesInPot Boolean @default(false)
  defaultTipPooled  Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)

  @@map("venue_pot_settings")
}
```

- [ ] **Step 9: Generate the Prisma client (no DB write yet)**

Run: `cd ~/xiv-app/apps/web && npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors. This validates the schema is syntactically/referentially valid before hand-writing SQL in Task 2.

---

### Task 2: Hand-authored SQL migration

**Files:**
- Create: `prisma/migrations/20260803000000_add_pot_payroll/migration.sql`

- [ ] **Step 1: Write the migration SQL**, following the exact style of `prisma/migrations/20260614000000_add_shift_audit_log/migration.sql` (raw DDL, quoted identifiers, explicit constraint names):

```sql
-- CreateEnum
CREATE TYPE "PotPayoutMode" AS ENUM ('STANDARD', 'POT', 'CONTRACTOR');

-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'POT_SHARE';
ALTER TYPE "PaymentType" ADD VALUE 'CONTRACTOR_PAYOUT';

-- AlterTable Role
ALTER TABLE "roles" ADD COLUMN "potPayoutMode" "PotPayoutMode" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "roles" ADD COLUMN "contractorSharesPot" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Membership
ALTER TABLE "memberships" ADD COLUMN "tipPooled" BOOLEAN;

-- AlterTable Shift
ALTER TABLE "shifts" ADD COLUMN "eventId" TEXT;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable VenuePotSettings
CREATE TABLE "venue_pot_settings" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "includeSalesInPot" BOOLEAN NOT NULL DEFAULT false,
    "defaultTipPooled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_pot_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_pot_settings_venueId_key" ON "venue_pot_settings"("venueId");

ALTER TABLE "venue_pot_settings" ADD CONSTRAINT "venue_pot_settings_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable PotDistribution
CREATE TABLE "pot_distributions" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "regularSales" DECIMAL(10,2) NOT NULL,
    "contractorSales" DECIMAL(10,2) NOT NULL,
    "pooledTips" DECIMAL(10,2) NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL,
    "potTotal" DECIMAL(10,2) NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "perPersonShare" DECIMAL(10,2) NOT NULL,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pot_distributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pot_distributions_eventId_key" ON "pot_distributions"("eventId");
CREATE INDEX "pot_distributions_venueId_idx" ON "pot_distributions"("venueId");

ALTER TABLE "pot_distributions" ADD CONSTRAINT "pot_distributions_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pot_distributions" ADD CONSTRAINT "pot_distributions_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pot_distributions" ADD CONSTRAINT "pot_distributions_generatedById_fkey"
  FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable PayrollEntry
ALTER TABLE "payroll_entries" ADD COLUMN "potDistributionId" TEXT;
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_potDistributionId_fkey"
  FOREIGN KEY ("potDistributionId") REFERENCES "pot_distributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Check the actual `users`/`venues`/`events`/`payroll_entries` table names via `grep '@@map' prisma/schema.prisma` before finalizing — confirm each matches the FK target names above.

- [ ] **Step 2: Apply the DDL directly — do NOT use `prisma migrate deploy`/`resolve`**

There is no `_prisma_migrations` table in this project's Postgres (dev or prod) — `prisma/migrations/` is repo-level documentation only, never auto-applied. Apply each statement from Step 1's SQL file by hand, outside one giant transaction (so one bad statement doesn't roll back the rest):

```bash
docker compose exec -T postgres psql -U postgres -d venue_manager -f - < prisma/migrations/20260803000000_add_pot_payroll/migration.sql
```

Expected: no errors; `docker compose exec postgres psql -U postgres -d venue_manager -c '\d venue_pot_settings'` and `-c '\d pot_distributions'` show the new tables.

- [ ] **Step 3: Rebuild the web image so its bundled Prisma client matches the new schema**

The standalone Next build bakes the Prisma client in at build time — editing `schema.prisma` on disk does nothing at runtime until rebuilt.

Run: `docker builder prune -af && docker compose build venue-manager && docker compose up -d venue-manager`
Expected: build succeeds, container restarts, no schema-drift errors in its logs.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260803000000_add_pot_payroll
git commit -m "feat(schema): add pot payroll data model"
```

---

### Task 3: `lib/pot-payroll.ts` — pure calculation function (TDD)

**Files:**
- Create: `lib/pot-payroll.ts`
- Test: `lib/pot-payroll.test.ts`

This must depend on nothing but `Decimal` — no Prisma calls — so it's testable in isolation per the spec's Testing section, and so the API route (Task 6) can stay a thin DB-fetch + call + write wrapper.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/pot-payroll.test.ts
import { describe, it, expect } from "vitest"
import { Decimal } from "@prisma/client/runtime/library"
import { computePotDistribution, type PotStaffMember, type PotTransactionInput } from "./pot-payroll"

function staff(overrides: Partial<PotStaffMember> & { membershipId: string }): PotStaffMember {
  return {
    potPayoutMode: "STANDARD",
    contractorSharesPot: false,
    tipPooled: false,
    hasQualifyingShift: true,
    ...overrides,
  }
}

function tx(overrides: Partial<PotTransactionInput>): PotTransactionInput {
  return {
    type: "SALE",
    amount: new Decimal(0),
    membershipId: null,
    ...overrides,
  }
}

describe("computePotDistribution", () => {
  it("splits regular sales pot evenly among POT-role recipients, minus tax", () => {
    const staffList = [
      staff({ membershipId: "m1", potPayoutMode: "POT" }),
      staff({ membershipId: "m2", potPayoutMode: "POT" }),
    ]
    const transactions = [
      tx({ type: "SALE", amount: new Decimal(1000), membershipId: "m1" }),
      tx({ type: "SALE", amount: new Decimal(1000), membershipId: "m2" }),
    ]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(10),
      includeSalesInPot: true,
    })

    expect(result.regularSales.toNumber()).toBe(2000)
    expect(result.potTotal.toNumber()).toBe(1800) // 2000 * 0.9
    expect(result.recipientCount).toBe(2)
    expect(result.perPersonShare.toNumber()).toBe(900)
  })

  it("does not double-count contractor gross: pot only gets the tax skim", () => {
    const staffList = [
      staff({ membershipId: "m1", potPayoutMode: "POT" }),
      staff({ membershipId: "c1", potPayoutMode: "CONTRACTOR", contractorSharesPot: false }),
    ]
    const transactions = [
      tx({ type: "SALE", amount: new Decimal(500), membershipId: "c1" }),
    ]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(20),
      includeSalesInPot: true,
    })

    // pot gets ONLY the tax (100), not the 500 gross
    expect(result.potTotal.toNumber()).toBe(100)
    expect(result.contractorPayouts).toEqual([
      { membershipId: "c1", grossSales: expect.objectContaining({}), payout: expect.objectContaining({}) },
    ])
    expect(result.contractorPayouts[0].payout.toNumber()).toBe(400) // 500 * 0.8
    // contractor did not opt to share, so pot has 1 recipient (m1) even though c1 has a qualifying shift
    expect(result.recipientCount).toBe(1)
  })

  it("includes a contractor as a pot recipient only when contractorSharesPot is true", () => {
    const staffList = [
      staff({ membershipId: "c1", potPayoutMode: "CONTRACTOR", contractorSharesPot: true }),
    ]
    const transactions = [tx({ type: "SALE", amount: new Decimal(100), membershipId: "c1" })]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(10),
      includeSalesInPot: true,
    })

    expect(result.recipientCount).toBe(1)
    expect(result.perPersonShare.toNumber()).toBe(10) // pot = 100 * 0.1 tax skim only
  })

  it("splits pooled tips into the pot and keeps unpooled tips with the individual", () => {
    const staffList = [
      staff({ membershipId: "m1", potPayoutMode: "POT", tipPooled: true }),
      staff({ membershipId: "m2", potPayoutMode: "STANDARD", tipPooled: false }),
    ]
    const transactions = [
      tx({ type: "TIP", amount: new Decimal(50), membershipId: "m1" }),
      tx({ type: "TIP", amount: new Decimal(30), membershipId: "m2" }),
      tx({ type: "TIP", amount: new Decimal(999), membershipId: null }), // till-level, excluded
    ]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(0),
      includeSalesInPot: false,
    })

    expect(result.pooledTips.toNumber()).toBe(50)
    expect(result.keptTipsByMembership.get("m2")?.toNumber()).toBe(30)
    expect(result.keptTipsByMembership.has("m1")).toBe(false)
  })

  it("excludes staff without a qualifying shift from recipients", () => {
    const staffList = [
      staff({ membershipId: "m1", potPayoutMode: "POT", hasQualifyingShift: true }),
      staff({ membershipId: "m2", potPayoutMode: "POT", hasQualifyingShift: false }), // no-show
    ]
    const transactions = [tx({ type: "SALE", amount: new Decimal(200), membershipId: "m1" })]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(0),
      includeSalesInPot: true,
    })

    expect(result.recipientCount).toBe(1)
    expect(result.recipientMembershipIds).toEqual(["m1"])
  })

  it("writes a zero-recipient distribution rather than dropping it", () => {
    const result = computePotDistribution(
      [],
      [tx({ type: "SALE", amount: new Decimal(100), membershipId: null })],
      { taxPercent: new Decimal(0), includeSalesInPot: true }
    )

    expect(result.recipientCount).toBe(0)
    expect(result.potTotal.toNumber()).toBe(0) // no staff resolved for the sale, so it's dropped from regularSales
    expect(result.perPersonShare.toNumber()).toBe(0)
  })

  it("does not redistribute the rounding remainder; it stays with the venue", () => {
    const staffList = [
      staff({ membershipId: "m1", potPayoutMode: "POT" }),
      staff({ membershipId: "m2", potPayoutMode: "POT" }),
      staff({ membershipId: "m3", potPayoutMode: "POT" }),
    ]
    const transactions = [tx({ type: "SALE", amount: new Decimal(100), membershipId: "m1" })]
    const result = computePotDistribution(staffList, transactions, {
      taxPercent: new Decimal(0),
      includeSalesInPot: true,
    })

    // 100 / 3 = 33.33... -> floor to 33 per person, 1 gil stays with the venue
    expect(result.perPersonShare.toNumber()).toBe(33)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/xiv-app/apps/web && npx vitest run lib/pot-payroll.test.ts`
Expected: FAIL — `Cannot find module './pot-payroll'` (module doesn't exist yet).

- [ ] **Step 3: Implement `lib/pot-payroll.ts`**

```typescript
import { Decimal } from "@prisma/client/runtime/library"

export type PotRole = "STANDARD" | "POT" | "CONTRACTOR"

export interface PotStaffMember {
  membershipId: string
  potPayoutMode: PotRole
  contractorSharesPot: boolean
  /** Resolved: Membership.tipPooled if set, else VenuePotSettings.defaultTipPooled */
  tipPooled: boolean
  /** True if this member has at least one COMPLETED shift on the event with both actualStart and actualEnd set */
  hasQualifyingShift: boolean
}

export interface PotTransactionInput {
  type: "SALE" | "TIP"
  amount: Decimal
  /** Resolved staff membership id for this transaction, or null for till-level (no staffId) */
  membershipId: string | null
}

export interface PotSettingsInput {
  /** 0-100 */
  taxPercent: Decimal
  includeSalesInPot: boolean
}

export interface PotContractorPayout {
  membershipId: string
  grossSales: Decimal
  payout: Decimal
}

export interface PotDistributionResult {
  regularSales: Decimal
  contractorSales: Decimal
  contractorPayouts: PotContractorPayout[]
  pooledTips: Decimal
  potTotal: Decimal
  recipientMembershipIds: string[]
  recipientCount: number
  perPersonShare: Decimal
  keptTipsByMembership: Map<string, Decimal>
}

export function computePotDistribution(
  staff: PotStaffMember[],
  transactions: PotTransactionInput[],
  settings: PotSettingsInput
): PotDistributionResult {
  const staffById = new Map(staff.map((s) => [s.membershipId, s]))
  const taxRate = settings.taxPercent.dividedBy(100)

  let regularSales = new Decimal(0)
  const contractorSalesByMember = new Map<string, Decimal>()
  let pooledTips = new Decimal(0)
  const keptTipsByMembership = new Map<string, Decimal>()

  for (const t of transactions) {
    if (t.membershipId === null) continue // till-level, no owner to resolve
    const member = staffById.get(t.membershipId)
    if (!member) continue // transaction from staff not in this resolved set

    if (t.type === "SALE") {
      if (member.potPayoutMode === "CONTRACTOR") {
        const prev = contractorSalesByMember.get(t.membershipId) ?? new Decimal(0)
        contractorSalesByMember.set(t.membershipId, prev.plus(t.amount))
      } else {
        regularSales = regularSales.plus(t.amount)
      }
    } else if (t.type === "TIP") {
      if (member.tipPooled) {
        pooledTips = pooledTips.plus(t.amount)
      } else {
        const prev = keptTipsByMembership.get(t.membershipId) ?? new Decimal(0)
        keptTipsByMembership.set(t.membershipId, prev.plus(t.amount))
      }
    }
  }

  const contractorPayouts: PotContractorPayout[] = []
  let contractorTaxSkim = new Decimal(0)
  let contractorSalesTotal = new Decimal(0)
  for (const [membershipId, grossSales] of contractorSalesByMember) {
    if (grossSales.lessThanOrEqualTo(0)) continue
    contractorSalesTotal = contractorSalesTotal.plus(grossSales)
    contractorTaxSkim = contractorTaxSkim.plus(grossSales.times(taxRate))
    contractorPayouts.push({
      membershipId,
      grossSales,
      payout: grossSales.times(new Decimal(1).minus(taxRate)),
    })
  }

  const potFromRegularSales = settings.includeSalesInPot
    ? regularSales.times(new Decimal(1).minus(taxRate))
    : new Decimal(0)
  const potTotal = potFromRegularSales.plus(contractorTaxSkim).plus(pooledTips)

  const recipientMembershipIds = staff
    .filter(
      (s) =>
        s.hasQualifyingShift &&
        (s.potPayoutMode === "POT" || (s.potPayoutMode === "CONTRACTOR" && s.contractorSharesPot))
    )
    .map((s) => s.membershipId)

  const recipientCount = recipientMembershipIds.length
  const perPersonShare =
    recipientCount > 0
      ? potTotal.dividedBy(recipientCount).toDecimalPlaces(0, Decimal.ROUND_DOWN)
      : new Decimal(0)

  return {
    regularSales,
    contractorSales: contractorSalesTotal,
    contractorPayouts,
    pooledTips,
    potTotal,
    recipientMembershipIds,
    recipientCount,
    perPersonShare,
    keptTipsByMembership,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/pot-payroll.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pot-payroll.ts lib/pot-payroll.test.ts
git commit -m "feat(payroll): add pure pot-distribution calculation function"
```

---

### Task 4: Add Vitest to `apps/web`

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Add the dependency and script**

Run: `cd ~/xiv-app/apps/web && pnpm add -D vitest`

Add to `package.json` `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 2: Create `vitest.config.ts`**, matching `apps/shout-crafter`'s config shape (check `apps/shout-crafter/vitest.config.ts` for the exact existing pattern first; if it uses `defineConfig` from `vitest/config` with no special plugins, mirror that):

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
  },
})
```

- [ ] **Step 3: Verify the new script runs**

Run: `pnpm test`
Expected: picks up `lib/pot-payroll.test.ts` from Task 3, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore(web): add vitest for unit-level testing"
```

Note: this task must land before or alongside Task 3's Step 2 (running the failing test needs the runner installed) — if executing sequentially, do Task 4 first, then Task 3.

---

### Task 5: `pot-settings` API route

**Files:**
- Create: `app/api/venues/[venueId]/pot-settings/route.ts`

- [ ] **Step 1: Implement GET and PUT**, following the auth/venue-resolution pattern from `app/api/venues/[venueId]/payroll/generate-all/route.ts` and the zod-schema-at-top convention from `app/api/venues/[venueId]/roles/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const updatePotSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  includeSalesInPot: z.boolean().optional(),
  defaultTipPooled: z.boolean().optional(),
})

async function resolveVenueAndMembership(venueId: string, userId: string) {
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
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const { venueId } = await context.params
      const resolved = await resolveVenueAndMembership(venueId, session.user.id)
      if ("error" in resolved) return resolved.error

      const settings = await prisma.venuePotSettings.findUnique({
        where: { venueId: resolved.venue.id },
      })

      return NextResponse.json({
        settings: settings ?? {
          enabled: false,
          taxPercent: 0,
          includeSalesInPot: false,
          defaultTipPooled: false,
        },
      })
    } catch (error) {
      console.error("Error fetching pot settings:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
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
          { error: "Only owners and managers can change pot payroll settings" },
          { status: 403 }
        )
      }

      const body = await request.json()
      const data = updatePotSettingsSchema.parse(body)

      const settings = await prisma.venuePotSettings.upsert({
        where: { venueId: resolved.venue.id },
        create: { venueId: resolved.venue.id, ...data },
        update: data,
      })

      return NextResponse.json({ settings })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        )
      }
      console.error("Error updating pot settings:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Manual verification**

Run the dev server (`pnpm dev`) and hit the route with `curl` (or Postman) using a real session cookie:
```bash
curl -X PUT http://localhost:3000/api/venues/<venueId>/pot-settings \
  -H "Content-Type: application/json" -H "Cookie: <session-cookie>" \
  -d '{"enabled": true, "taxPercent": 10, "includeSalesInPot": true}'
```
Expected: `200` with the created/updated `settings` row; a second `GET` returns the same values.

- [ ] **Step 3: Commit**

```bash
git add app/api/venues/\[venueId\]/pot-settings/route.ts
git commit -m "feat(api): add venue pot-settings get/put route"
```

---

### Task 6: Roles API — payout mode fields

**Files:**
- Modify: `app/api/venues/[venueId]/roles/route.ts`
- Modify: `app/api/venues/[venueId]/roles/[roleId]/route.ts`

- [ ] **Step 1: Extend both zod schemas**

In `roles/route.ts` (`createRoleSchema`, lines 8-14) and `roles/[roleId]/route.ts` (its update schema, lines 8-13), add:

```typescript
  potPayoutMode: z.enum(["STANDARD", "POT", "CONTRACTOR"]).optional(),
  contractorSharesPot: z.boolean().optional(),
```

- [ ] **Step 2: Pass the fields through to `prisma.role.create` / `prisma.role.update`**

Find the `prisma.role.create({ data: { ... } })` call in `roles/route.ts` and the `prisma.role.update({ data: { ... } })` call in `roles/[roleId]/route.ts`; add `potPayoutMode: data.potPayoutMode, contractorSharesPot: data.contractorSharesPot` to each `data` object (spread from the parsed body, matching how `hourlyRate` is already passed through).

- [ ] **Step 3: Manual verification**

```bash
curl -X POST http://localhost:3000/api/venues/<venueId>/roles \
  -H "Content-Type: application/json" -H "Cookie: <session-cookie>" \
  -d '{"name": "Photographer", "potPayoutMode": "CONTRACTOR", "contractorSharesPot": true}'
```
Expected: `201`/`200` with the new role including `potPayoutMode: "CONTRACTOR"`.

- [ ] **Step 4: Commit**

```bash
git add "app/api/venues/[venueId]/roles/route.ts" "app/api/venues/[venueId]/roles/[roleId]/route.ts"
git commit -m "feat(api): add pot payout mode fields to role create/update"
```

---

### Task 7: Membership `tipPooled` self-service field

**Files:**
- Modify: `app/api/venues/[venueId]/staff/[membershipId]/route.ts`

- [ ] **Step 1: Extend `updateStaffSchema`** (lines 8-18) with:

```typescript
  tipPooled: z.boolean().nullable().optional(),
```

- [ ] **Step 2: Add a self-service permission branch**

The existing `PUT` handler checks `userMembership` (caller) against `targetMembership` and requires `OWNER`/`MANAGER` for any update. Add a branch above that check: if the caller *is* the target member (`targetMembership.userId === session.user.id`) and the parsed body's only key is `tipPooled`, allow it without the owner/manager gate. Concretely, right after `targetMembership` is fetched and before the "Managers cannot modify owners" check, insert:

```typescript
    const isSelfTipPreferenceOnly =
      targetMembership.userId === session.user.id &&
      Object.keys(body).every((k) => k === "tipPooled")

    if (!isSelfTipPreferenceOnly) {
      if (!userMembership || !["OWNER", "MANAGER"].includes(userMembership.role)) {
        return NextResponse.json(
          { error: "You don't have permission to update staff" },
          { status: 403 }
        )
      }
    }
```

(This replaces the existing unconditional owner/manager check earlier in the handler — move that check here rather than duplicating it. Read the full handler first to place this correctly relative to the existing `userMembership` lookup, which must still run to resolve `targetMembership.userId` comparison context.)

- [ ] **Step 3: Pass `tipPooled` through to `prisma.membership.update`**

Add `tipPooled: data.tipPooled` to whatever `data` object is passed to the update call in this route.

- [ ] **Step 4: Manual verification**

As the staff member themself (their own session cookie), `PUT` their own `membershipId` with `{"tipPooled": true}` — expect `200`. As a non-owner/manager third party, expect `403`.

- [ ] **Step 5: Commit**

```bash
git add "app/api/venues/[venueId]/staff/[membershipId]/route.ts"
git commit -m "feat(api): allow staff to set their own tip-pooling preference"
```

---

### Task 8: Pot payroll generation route

**Files:**
- Create: `app/api/venues/[venueId]/events/[eventId]/pot-payroll/route.ts`

This is the route that calls `computePotDistribution` from Task 3. `GET` = preview (compute, don't write). `POST` = generate (compute + write inside a transaction), blocked if a `PotDistribution` already exists for the event (unique constraint) or the event isn't `COMPLETED`.

- [ ] **Step 1: Implement the shared data-resolution helper + both handlers**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { computePotDistribution, type PotStaffMember, type PotTransactionInput } from "@/lib/pot-payroll"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

async function resolvePotInputs(venueId: string, eventId: string) {
  const [venue, event, settings] = await Promise.all([
    prisma.venue.findFirst({ where: { OR: [{ id: venueId }, { slug: venueId }] } }),
    prisma.event.findFirst({ where: { id: eventId } }),
    prisma.venuePotSettings.findFirst({ where: { venue: { OR: [{ id: venueId }, { slug: venueId }] } } }),
  ])
  if (!venue || !event || event.venueId !== venue.id) return null

  const shifts = await prisma.shift.findMany({
    where: { eventId, status: "COMPLETED" },
    include: { membership: { include: { role: true } } },
  })
  const transactionsRaw = await prisma.transaction.findMany({ where: { eventId } })

  // Build resolved staff set from shifts (one entry per membership, qualifying if any shift has actuals)
  const staffByMembership = new Map<string, PotStaffMember>()
  for (const shift of shifts) {
    if (!shift.membershipId || !shift.membership) continue
    const role = shift.membership.role
    const existing = staffByMembership.get(shift.membershipId)
    const hasActuals = Boolean(shift.actualStart && shift.actualEnd)
    if (existing) {
      existing.hasQualifyingShift = existing.hasQualifyingShift || hasActuals
      continue
    }
    staffByMembership.set(shift.membershipId, {
      membershipId: shift.membershipId,
      potPayoutMode: role?.potPayoutMode ?? "STANDARD",
      contractorSharesPot: role?.contractorSharesPot ?? false,
      tipPooled: shift.membership.tipPooled ?? settings?.defaultTipPooled ?? false,
      hasQualifyingShift: hasActuals,
    })
  }

  // Transactions may reference staff (via User id) who worked the event but whose only
  // record we have is the Transaction itself if they had no Shift row for some reason;
  // spec only requires resolving via Shift-linked staff, so unresolved staffId transactions
  // fall through computePotDistribution's "member not found -> skip" branch by design.
  const membershipByUserId = new Map(
    shifts.filter((s) => s.membership).map((s) => [s.membership!.userId, s.membershipId!])
  )
  const transactions: PotTransactionInput[] = transactionsRaw
    .filter((t) => t.type === "SALE" || t.type === "TIP")
    .map((t) => ({
      type: t.type as "SALE" | "TIP",
      amount: t.amount,
      membershipId: t.staffId ? membershipByUserId.get(t.staffId) ?? null : null,
    }))

  const staff = Array.from(staffByMembership.values())
  const result = computePotDistribution(staff, transactions, {
    taxPercent: settings?.taxPercent ?? new (await import("@prisma/client/runtime/library")).Decimal(0),
    includeSalesInPot: settings?.includeSalesInPot ?? false,
  })

  return { venue, event, result }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; eventId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      const { venueId, eventId } = await context.params

      const resolved = await resolvePotInputs(venueId, eventId)
      if (!resolved) return NextResponse.json({ error: "Event not found" }, { status: 404 })

      return NextResponse.json({ preview: resolved.result })
    } catch (error) {
      console.error("Error previewing pot payroll:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string; eventId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      const { venueId, eventId } = await context.params

      const venue = await prisma.venue.findFirst({ where: { OR: [{ id: venueId }, { slug: venueId }] } })
      if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 })

      const callerMembership = await prisma.membership.findFirst({
        where: { userId: session.user.id, venueId: venue.id, status: "active" },
      })
      if (!callerMembership || !["OWNER", "MANAGER"].includes(callerMembership.role)) {
        return NextResponse.json(
          { error: "Only owners and managers can generate pot payroll" },
          { status: 403 }
        )
      }

      const event = await prisma.event.findFirst({ where: { id: eventId, venueId: venue.id } })
      if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })
      if (event.status !== "COMPLETED") {
        return NextResponse.json(
          { error: "Pot payroll can only be generated for completed events" },
          { status: 400 }
        )
      }

      const existing = await prisma.potDistribution.findUnique({ where: { eventId } })
      if (existing) {
        return NextResponse.json(
          { error: "Pot payroll has already been generated for this event" },
          { status: 409 }
        )
      }

      const resolved = await resolvePotInputs(venueId, eventId)
      if (!resolved) return NextResponse.json({ error: "Event not found" }, { status: 404 })
      const { result } = resolved
      const settings = await prisma.venuePotSettings.findUnique({ where: { venueId: venue.id } })

      const distribution = await prisma.$transaction(async (tx) => {
        const dist = await tx.potDistribution.create({
          data: {
            venueId: venue.id,
            eventId,
            regularSales: result.regularSales,
            contractorSales: result.contractorSales,
            pooledTips: result.pooledTips,
            taxPercent: settings?.taxPercent ?? 0,
            potTotal: result.potTotal,
            recipientCount: result.recipientCount,
            perPersonShare: result.perPersonShare,
            generatedById: session.user.id,
          },
        })

        const now = new Date()
        for (const membershipId of result.recipientMembershipIds) {
          const bonus = result.keptTipsByMembership.get(membershipId) ?? null
          await tx.payrollEntry.create({
            data: {
              venueId: venue.id,
              membershipId,
              paymentType: "POT_SHARE",
              baseRate: result.perPersonShare,
              totalAmount: bonus ? result.perPersonShare.plus(bonus) : result.perPersonShare,
              bonusAmount: bonus,
              periodStart: event.startTime,
              periodEnd: event.endTime,
              potDistributionId: dist.id,
            },
          })
        }

        for (const payout of result.contractorPayouts) {
          const bonus = result.keptTipsByMembership.get(payout.membershipId) ?? null
          await tx.payrollEntry.create({
            data: {
              venueId: venue.id,
              membershipId: payout.membershipId,
              paymentType: "CONTRACTOR_PAYOUT",
              baseRate: payout.payout,
              totalAmount: bonus ? payout.payout.plus(bonus) : payout.payout,
              bonusAmount: bonus,
              periodStart: event.startTime,
              periodEnd: event.endTime,
              potDistributionId: dist.id,
            },
          })
        }

        // Kept tips for STANDARD-role staff (not a recipient, not a contractor) still need
        // their own entry so the money isn't lost; create a zero-base bonus-only entry.
        const handled = new Set([...result.recipientMembershipIds, ...result.contractorPayouts.map((c) => c.membershipId)])
        for (const [membershipId, bonus] of result.keptTipsByMembership) {
          if (handled.has(membershipId)) continue
          await tx.payrollEntry.create({
            data: {
              venueId: venue.id,
              membershipId,
              paymentType: "POT_SHARE",
              baseRate: new (await import("@prisma/client/runtime/library")).Decimal(0),
              totalAmount: bonus,
              bonusAmount: bonus,
              periodStart: event.startTime,
              periodEnd: event.endTime,
              potDistributionId: dist.id,
            },
          })
        }

        await tx.shift.updateMany({
          where: { eventId, membershipId: { in: Array.from(handled) } },
          data: { payrollEntryId: null }, // left null intentionally: one PayrollEntry now covers many shifts across the whole event, not a 1:1 like hourly payroll
        })

        return dist
      })

      return NextResponse.json({ distribution }, { status: 201 })
    } catch (error) {
      console.error("Error generating pot payroll:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 5, window: "1 m" }
)
```

A note for the implementer: the dynamic `await import("@prisma/client/runtime/library")` calls above are awkward — replace them with a static `import { Decimal } from "@prisma/client/runtime/library"` at the top of the file once you're editing this for real; they're written inline here only to keep this plan's snippet self-contained per-step. Same applies to the `resolvePotInputs` helper's `Decimal` fallback.

- [ ] **Step 2: Manual verification**

Set up a test venue with pot mode enabled, a COMPLETED event with a couple of completed shifts (POT and CONTRACTOR roles) and a few Sale/Tip transactions, then:
```bash
curl http://localhost:3000/api/venues/<venueId>/events/<eventId>/pot-payroll -H "Cookie: <session-cookie>"
curl -X POST http://localhost:3000/api/venues/<venueId>/events/<eventId>/pot-payroll -H "Cookie: <session-cookie>"
curl -X POST http://localhost:3000/api/venues/<venueId>/events/<eventId>/pot-payroll -H "Cookie: <session-cookie>"
```
Expected: `GET` returns a preview matching hand-calculated numbers; first `POST` returns `201` with the distribution and creates `PayrollEntry` rows (verify via `psql` or the payroll page); second `POST` returns `409`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/venues/[venueId]/events/[eventId]/pot-payroll/route.ts"
git commit -m "feat(api): add pot payroll generation and preview route"
```

---

### Task 9: `CreateShiftDialog` — optional event picker

**Files:**
- Modify: `components/create-shift-dialog.tsx`

- [ ] **Step 1: Add a `potModeEnabled` and `events` prop**

Extend the component's props type (near the existing `{ venueSlug, staff, roles, timezone?, tzLabel?, trigger?, prefill? }`):

```typescript
  potModeEnabled?: boolean
  events?: { id: string; name: string }[]
```

Add `eventId` to the local form state alongside the existing role selection.

- [ ] **Step 2: Render the picker conditionally**

Next to the existing role `Select` block (`create-shift-dialog.tsx:199-224`), add, gated the same way the `roles.length === 0` conditional is (`create-shift-dialog.tsx:241-245`):

```tsx
{potModeEnabled && events && events.length > 0 && (
  <div className="space-y-2">
    <Label htmlFor="event">Event (optional, for pot payroll)</Label>
    <Select value={eventId ?? "none"} onValueChange={(v) => setEventId(v === "none" ? null : v)}>
      <SelectTrigger id="event">
        <SelectValue placeholder="No event" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No event</SelectItem>
        {events.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

- [ ] **Step 3: Include `eventId` in the shift creation POST body**

In the submit loop (`create-shift-dialog.tsx:104-125`), add `eventId` to each shift's JSON body.

- [ ] **Step 4: Commit**

```bash
git add components/create-shift-dialog.tsx
git commit -m "feat(shifts): add optional event link when pot payroll mode is on"
```

---

### Task 10: Shifts route — accept `eventId`

**Files:**
- Modify: `app/api/venues/[venueId]/shifts/route.ts`

- [ ] **Step 1: Add `eventId` to the POST body schema and `prisma.shift.create` call**

Find the zod schema and `prisma.shift.create({ data: {...} })` call in this route's `POST` handler; add `eventId: z.string().nullable().optional()` to the schema and `eventId: data.eventId` to the create call, matching how `roleId` is already threaded through.

- [ ] **Step 2: Commit**

```bash
git add "app/api/venues/[venueId]/shifts/route.ts"
git commit -m "feat(api): accept optional eventId on shift creation"
```

---

### Task 11: Shifts page — wire `potModeEnabled` and events into `CreateShiftDialog`

**Files:**
- Modify: `app/dashboard/[slug]/shifts/page.tsx`

- [ ] **Step 1: Fetch venue pot settings and upcoming events**

Add a fetch to `/api/venues/${venue.id}/pot-settings` and (if not already fetched on this page) `/api/venues/${venue.id}/events` alongside the page's existing data loading, storing `potModeEnabled` and `events` in state.

- [ ] **Step 2: Pass the new props to all three `CreateShiftDialog` usages** (lines 344, 499, 550)

```tsx
<CreateShiftDialog
  /* ...existing props... */
  potModeEnabled={potModeEnabled}
  events={events}
/>
```

- [ ] **Step 3: Commit**

```bash
git add "app/dashboard/[slug]/shifts/page.tsx"
git commit -m "feat(shifts): surface event picker on shift creation when pot mode is on"
```

---

### Task 12: Venue Settings — "Pot Payroll" card

**Files:**
- Modify: `app/dashboard/[slug]/settings/page.tsx`

- [ ] **Step 1: Add state and load/save wiring**

Add `useState` fields (`potEnabled`, `potTaxPercent`, `potIncludeSalesInPot`, `potDefaultTipPooled`) loaded via a new `fetch(/api/venues/${venue.id}/pot-settings)` call alongside the existing `settingsRes` fetch, and saved via a `PUT` to the same route — as a separate call from `handleSave` (since this hits its own relational table, not the shared settings JSON blob), following the same "no react-hook-form, plain state, one banner" style as the rest of the page.

- [ ] **Step 2: Render the card**, matching the existing `<section className="panel">` shape used by the Discord Webhooks section (`settings/page.tsx:1023-1090`):

```tsx
<section className="panel">
  <div className="ph">
    <h3>Pot Payroll</h3>
    <p className="text-sm text-muted-foreground">
      Nightly revenue/tip pooling instead of (or alongside) hourly pay.
    </p>
  </div>
  <div className="pbody space-y-4">
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={potEnabled}
        onChange={(e) => setPotEnabled(e.target.checked)}
      />
      Enable pot payroll for this venue
    </label>
    {potEnabled && (
      <>
        <div className="space-y-2">
          <Label htmlFor="pot-tax">Tax percent</Label>
          <Input
            id="pot-tax"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={potTaxPercent}
            onChange={(e) => setPotTaxPercent(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={potIncludeSalesInPot}
            onChange={(e) => setPotIncludeSalesInPot(e.target.checked)}
          />
          Include regular sales in the pot (off = tips-only pot)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={potDefaultTipPooled}
            onChange={(e) => setPotDefaultTipPooled(e.target.checked)}
          />
          Default new staff to pooling their tips
        </label>
        <Button onClick={savePotSettings} disabled={isSavingPotSettings}>
          Save Pot Payroll Settings
        </Button>
      </>
    )}
  </div>
</section>
```

- [ ] **Step 3: Manual verification** — toggle the settings in the browser, reload, confirm they persist (backed by Task 5's route).

- [ ] **Step 4: Commit**

```bash
git add "app/dashboard/[slug]/settings/page.tsx"
git commit -m "feat(settings): add pot payroll settings card"
```

---

### Task 13: Roles management UI — payout mode select

**Files:**
- Modify: `app/dashboard/[slug]/staff/roles/page.tsx`

- [ ] **Step 1: Extend `formData` state** (lines 83-88) with `potPayoutMode: "STANDARD" as "STANDARD" | "POT" | "CONTRACTOR"` and `contractorSharesPot: false`.

- [ ] **Step 2: Add the select + conditional checkbox**, next to the existing hourly-rate `Input` (`staff/roles/page.tsx:413-427`):

```tsx
<div className="space-y-2">
  <Label htmlFor="create-payout-mode">Pot Payroll Mode</Label>
  <Select
    value={formData.potPayoutMode}
    onValueChange={(v) => setFormData({ ...formData, potPayoutMode: v as typeof formData.potPayoutMode })}
  >
    <SelectTrigger id="create-payout-mode">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="STANDARD">Standard (unaffected by pot payroll)</SelectItem>
      <SelectItem value="POT">Pot (shares equally in the pot split)</SelectItem>
      <SelectItem value="CONTRACTOR">Contractor (own priced services)</SelectItem>
    </SelectContent>
  </Select>
</div>
{formData.potPayoutMode === "CONTRACTOR" && (
  <label className="flex items-center gap-2">
    <input
      type="checkbox"
      checked={formData.contractorSharesPot}
      onChange={(e) => setFormData({ ...formData, contractorSharesPot: e.target.checked })}
    />
    Also shares in the pot split
  </label>
)}
```

Add the equivalent block to the edit-role dialog's form (mirroring however the create/edit dialogs already share `formData`).

- [ ] **Step 3: Include the fields in both create and update submit payloads**

- [ ] **Step 4: Commit**

```bash
git add "app/dashboard/[slug]/staff/roles/page.tsx"
git commit -m "feat(roles): add pot payout mode selection to role form"
```

---

### Task 14: Staff member detail page — "pool my tips" toggle

**Files:**
- Modify: `app/dashboard/[slug]/staff/[membershipId]/page.tsx`

- [ ] **Step 1: Add `tipPooled` to the `StaffMember` interface and load it** from the existing membership fetch.

- [ ] **Step 2: Render a toggle inside a `Card`**, following the existing `Card`/`CardHeader`/`CardContent` shape already used on this page, gated on the venue having pot mode enabled (fetch `/api/venues/${venueId}/pot-settings` alongside the existing data load):

```tsx
{potModeEnabled && (
  <Card>
    <CardHeader>
      <CardTitle>Tip Pooling</CardTitle>
      <CardDescription>Pool tips into the venue's pot, or keep them individually.</CardDescription>
    </CardHeader>
    <CardContent>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={tipPooled ?? false}
          onChange={(e) => saveTipPooled(e.target.checked)}
        />
        Pool my tips
      </label>
    </CardContent>
  </Card>
)}
```

`saveTipPooled` calls `PUT /api/venues/${venueId}/staff/${membershipId}` with `{ tipPooled }` — the self-service path added in Task 7.

- [ ] **Step 3: Commit**

```bash
git add "app/dashboard/[slug]/staff/[membershipId]/page.tsx"
git commit -m "feat(staff): add tip-pooling preference toggle"
```

---

### Task 15: Event detail page — "Generate Pot Payroll" action

**Files:**
- Modify: `app/dashboard/[slug]/events/[eventId]/page.tsx`

- [ ] **Step 1: Fetch venue pot settings** alongside the page's existing event data load; store `potModeEnabled`.

- [ ] **Step 2: Add a card in the `event.status === "COMPLETED"` block** (`page.tsx:241-243`), using the same `Card` components already imported on this page:

```tsx
{event.status === "COMPLETED" && potModeEnabled && (
  <Card>
    <CardHeader>
      <CardTitle>Pot Payroll</CardTitle>
      <CardDescription>Generate the nightly pot split for this event.</CardDescription>
    </CardHeader>
    <CardContent>
      {potDistribution ? (
        <p className="text-sm text-muted-foreground">
          Generated <ServerTime date={potDistribution.generatedAt} formatStr="datelong" />
          {" — "}{potDistribution.recipientCount} recipients, {potDistribution.perPersonShare} gil each.
        </p>
      ) : (
        <Button onClick={handleGeneratePotPayroll} disabled={isGeneratingPot}>
          Generate Pot Payroll
        </Button>
      )}
    </CardContent>
  </Card>
)}
```

`handleGeneratePotPayroll` POSTs to `/api/venues/${venue.id}/events/${eventId}/pot-payroll` (Task 8) and stores the response in `potDistribution` state; fetch existing `potDistribution` on page load via a `GET` to the same endpoint's preview... actually the preview endpoint doesn't return an existing record — add a check via `prisma.potDistribution.findUnique` server-side or a lightweight existence check; simplest: attempt to include `potDistribution` in the initial event fetch response (extend the event `GET` route to include the relation) rather than a second client round-trip. Decide which when implementing; either is fine architecturally, the existing-event-GET-include approach is less code.

- [ ] **Step 3: Commit**

```bash
git add "app/dashboard/[slug]/events/[eventId]/page.tsx"
git commit -m "feat(events): add generate pot payroll action to completed events"
```

---

### Task 16: Payroll page — render pot/contractor entries

**Files:**
- Modify: `app/dashboard/[slug]/payroll/page.tsx`

- [ ] **Step 1: Extend the `PayrollEntry` client interface** (lines 44-80) with `paymentType` already present — confirm it now includes `"POT_SHARE" | "CONTRACTOR_PAYOUT"` in its type union, and add `potDistribution?: { eventId: string; regularSales: string; contractorSales: string; pooledTips: string; potTotal: string; recipientCount: number; perPersonShare: string } | null`.

- [ ] **Step 2: Add an expandable row for pot/contractor entries**

In the row-render logic (starting `payroll/page.tsx:1082`), add local `useState<Set<string>>` for expanded row ids, and gate an extra `<tr>` under any row where `entry.paymentType === "POT_SHARE" || entry.paymentType === "CONTRACTOR_PAYOUT"`:

```tsx
{(entry.paymentType === "POT_SHARE" || entry.paymentType === "CONTRACTOR_PAYOUT") && entry.potDistribution && (
  <button
    className="text-xs text-muted-foreground underline"
    onClick={() => toggleExpanded(entry.id)}
  >
    {expandedIds.has(entry.id) ? "Hide" : "Show"} breakdown
  </button>
)}
```
```tsx
{expandedIds.has(entry.id) && entry.potDistribution && (
  <tr>
    <td colSpan={6} className="bg-muted/30 text-sm p-3">
      Regular sales: {entry.potDistribution.regularSales} · Contractor sales:{" "}
      {entry.potDistribution.contractorSales} · Pooled tips: {entry.potDistribution.pooledTips} · Pot
      total: {entry.potDistribution.potTotal} · Recipients: {entry.potDistribution.recipientCount} ·
      Per person: {entry.potDistribution.perPersonShare}
    </td>
  </tr>
)}
```

- [ ] **Step 3: Include `potDistribution` in the page's payroll-entries fetch** — add `include: { potDistribution: true }` (or the equivalent already-used include pattern) to whichever API route backs this page's data load.

- [ ] **Step 4: Commit**

```bash
git add "app/dashboard/[slug]/payroll/page.tsx"
git commit -m "feat(payroll): render pot-share and contractor payout breakdowns"
```

---

## Self-review

**Spec coverage:**
- `VenuePotSettings` table — Task 1 Step 8, Task 2, Task 5, Task 12. ✓
- `Role.potPayoutMode`/`contractorSharesPot` — Task 1 Step 3, Task 2, Task 6, Task 13. ✓
- `Shift.eventId` — Task 1 Step 5, Task 2, Task 9, Task 10, Task 11. ✓
- `Membership.tipPooled` — Task 1 Step 4, Task 2, Task 7, Task 14. ✓
- `PotDistribution` + `PayrollEntry.potDistributionId`/new `PaymentType` values — Task 1 Steps 2/6, Task 2, Task 8, Task 16. ✓
- Calculation logic (gather/split/compute/recipients/split/write) — Task 3 (pure function), Task 8 (DB wiring + write). ✓
- No-show exclusion, till-level tip exclusion, zero-recipient write, unique-per-event block, tax clamp — covered in Task 3 tests + Task 8's `event.status`/`existing` checks + Task 5's `.min(0).max(100)` zod validation. ✓
- UI surfaces (Venue Settings, Roles, Staff self-service, Events, Shift creation, Payroll page) — Tasks 9, 11, 12, 13, 14, 15, 16. ✓
- Testing section ("mirroring existing `payroll-rates` test style") — addressed directly in Implementer Notes #3 and Task 4; the plan adds the missing test infra rather than silently assuming it exists.
- Out-of-scope items (void/regenerate, per-shift tip override, auto-migration) — deliberately excluded from every task above; none of the tasks add them.

**Placeholder scan:** no TBD/"handle appropriately"/"similar to Task N" phrasing found except two explicitly-flagged spots (Task 8's inline dynamic `Decimal` import, Task 15's fetch-strategy choice) — both are real implementation decisions with a stated concrete resolution, not empty placeholders, and are called out for a fresh-eyes cleanup pass during implementation rather than left ambiguous.

**Type consistency:** `PotStaffMember`, `PotTransactionInput`, `PotSettingsInput`, `PotDistributionResult` (Task 3) are the same shapes referenced by name in Task 8's route. `PotPayoutMode` values (`STANDARD`/`POT`/`CONTRACTOR`) match across schema (Task 1), API zod enums (Task 6), and UI selects (Task 13). `PaymentType` values (`POT_SHARE`/`CONTRACTOR_PAYOUT`) match across schema (Task 1/2), route (Task 8), and payroll page (Task 16).

---

## Open items to confirm before/at implementation time (not scope changes — implementation-detail judgment calls)

1. Task 8's dynamic `Decimal` imports should become a static top-of-file import when actually writing the code — flagged inline, trivial fix.
2. Task 15's "does an existing `PotDistribution` already exist for this event" check — pick either extending the event GET route's `include`, or a dedicated existence check, when implementing; both work.
