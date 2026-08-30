# Positions Migration Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-off, idempotent, dry-run-capable script that copies a single dashboard venue's `Role` rows (and their member assignments) into xvm-api's `Position` module, so we can verify the swap is real before touching any other venue or flipping any reads.

**Architecture:** Add Position + Membership-list client functions to the existing `lib/api/xvm-api.ts` (same pattern already used for Rooms/Hours), add small pure conversion helpers (hex color ↔ int, dollars ↔ minor units) with unit tests, then a standalone `scripts/migrate-positions.ts` runnable via `npx tsx`. The script only *reads* from Prisma and only *writes* to xvm-api over HTTP — Prisma's `Role` table is never modified, matching Allegro's "keep Prisma happy in the interim" guidance. Defaults to `--dry-run`; requires `--apply` to actually write.

**Tech Stack:** TypeScript, `tsx` (existing script runner), `@prisma/client` (raw client, not the app's shared singleton — matches `scripts/list-users.ts`'s pattern), Vitest for the conversion-helper unit tests, xvm-api's `/venues/{venueId}/positions` and `/venues/{venueId}/memberships` endpoints.

**Scope:** One venue at a time, passed as a CLI arg (dashboard's Prisma venue id). This run targets the confirmed test venue (`cmt1npwzw0002m8y5ylzb66jk`, slug `ddfdsfdfds`, xvm-api venue `ven_xx499NE0rPoa`) where Ehno is already Owner on both sides with a valid stored token. Not a bulk all-venues import — that's explicitly out of scope until the broader membership-linkage question (asked separately) is answered.

---

### Task 1: Position field conversion helpers

**Files:**
- Create: `apps/web/lib/api/position-convert.ts`
- Test: `apps/web/lib/api/position-convert.test.ts`

Prisma's `Role.color` is a hex string (`"#6366f1"`); xvm-api's `PositionModel.color` is an int (`0`–`0xFFFFFF`, Discord's own color format). Prisma's `Role.hourlyRate` is a `Decimal` in whole currency units; xvm-api's `hourly_rate_minor` is an int in minor units (cents). Both conversions are small and worth a real test rather than trusting them un-verified in the middle of a migration script.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/lib/api/position-convert.test.ts
import { describe, it, expect } from "vitest"
import { hexColorToInt, intColorToHex, dollarsToMinorUnits, minorUnitsToDollars } from "./position-convert"

describe("hexColorToInt", () => {
  it("converts a 6-digit hex string to its integer value", () => {
    expect(hexColorToInt("#6366f1")).toBe(0x6366f1)
  })

  it("handles hex without a leading #", () => {
    expect(hexColorToInt("6366f1")).toBe(0x6366f1)
  })

  it("returns null for null input", () => {
    expect(hexColorToInt(null)).toBeNull()
  })

  it("throws on an out-of-range or malformed hex string", () => {
    expect(() => hexColorToInt("#gggggg")).toThrow()
    expect(() => hexColorToInt("#1234567")).toThrow()
  })
})

describe("intColorToHex", () => {
  it("converts an integer back to a 6-digit hex string", () => {
    expect(intColorToHex(0x6366f1)).toBe("#6366f1")
  })

  it("pads short values with leading zeros", () => {
    expect(intColorToHex(255)).toBe("#0000ff")
  })

  it("returns null for null input", () => {
    expect(intColorToHex(null)).toBeNull()
  })
})

describe("dollarsToMinorUnits / minorUnitsToDollars round-trip", () => {
  it("converts a decimal dollar amount to integer cents and back", () => {
    expect(dollarsToMinorUnits(12.5)).toBe(1250)
    expect(minorUnitsToDollars(1250)).toBe(12.5)
  })

  it("returns null for null input on both directions", () => {
    expect(dollarsToMinorUnits(null)).toBeNull()
    expect(minorUnitsToDollars(null)).toBeNull()
  })

  it("rounds to the nearest cent instead of truncating", () => {
    expect(dollarsToMinorUnits(12.505)).toBe(1251)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && pnpm test position-convert`
Expected: FAIL with "Cannot find module './position-convert'" (or similar — the file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```typescript
// apps/web/lib/api/position-convert.ts

// xvm-api's PositionModel.color is a Discord-style int (0 to 0xFFFFFF); Prisma's
// Role.color is the "#rrggbb" string every UI color picker in this app already uses.
export function hexColorToInt(hex: string | null): number | null {
  if (hex === null) return null
  const stripped = hex.startsWith("#") ? hex.slice(1) : hex
  if (!/^[0-9a-fA-F]{6}$/.test(stripped)) {
    throw new Error(`Invalid hex color: ${hex}`)
  }
  return parseInt(stripped, 16)
}

export function intColorToHex(value: number | null): string | null {
  if (value === null) return null
  return `#${value.toString(16).padStart(6, "0")}`
}

// xvm-api's hourly_rate_minor is an int in minor currency units (cents); Prisma's
// Role.hourlyRate is a Decimal in whole units. Round rather than truncate so a
// fractional cent from float math doesn't silently shave a cent off someone's rate.
export function dollarsToMinorUnits(dollars: number | null): number | null {
  if (dollars === null) return null
  return Math.round(dollars * 100)
}

export function minorUnitsToDollars(minor: number | null): number | null {
  if (minor === null) return null
  return minor / 100
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && pnpm test position-convert`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api/position-convert.ts apps/web/lib/api/position-convert.test.ts
git commit -m "feat: add Position color/currency conversion helpers"
```

---

### Task 2: Position + membership-lookup client functions on xvm-api.ts

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts` (append new section, following the existing `// ── Venue Hours API ──` pattern)

The file already has `xvmFetch`, `XvmApiError`, and the Room/Hours functions to copy the shape from. Add Position types + CRUD + assign/unassign, plus a `listMemberships` function (needed so the script can resolve "which xvm-api `membership_id` does this Prisma user correspond to").

- [ ] **Step 1: Add the types and functions**

Append to the end of `apps/web/lib/api/xvm-api.ts`:

```typescript
// ── Positions API ──────────────────────────────────────────────

export interface PositionCreate {
  name: string
  color?: number | null
  responsibilities?: string | null
  hourly_rate_minor?: number | null
  discord_role_id?: number | null
}

export interface PositionUpdate {
  name?: string | null
  color?: number | null
  responsibilities?: string | null
  hourly_rate_minor?: number | null
  discord_role_id?: number | null
}

export interface PositionRow {
  id: number
  name: string
  color: number | null
  responsibilities: string | null
  hourly_rate_minor: number | null
  pot_payout_mode: string
  contractor_shares_pot: boolean
  discord_role_id: number | null
  member_ids: number[]
}

export async function listPositions(personToken: string, venueId: string): Promise<PositionRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PositionRow[]>(`/venues/${venueId}/positions`, {}, personToken)
}

export async function createPosition(
  personToken: string,
  venueId: string,
  data: PositionCreate
): Promise<PositionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PositionRow>(
    `/venues/${venueId}/positions`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updatePosition(
  personToken: string,
  venueId: string,
  positionId: number,
  data: PositionUpdate
): Promise<PositionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PositionRow>(
    `/venues/${venueId}/positions/${positionId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function assignPositionMember(
  personToken: string,
  venueId: string,
  positionId: number,
  membershipId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/positions/${positionId}/members`,
    { method: "POST", body: JSON.stringify({ membership_id: membershipId }) },
    personToken
  )
}

// ── Memberships API ────────────────────────────────────────────

export interface MembershipPerson {
  id: number
  display_name: string
}

export interface MembershipRow {
  id: number
  person: MembershipPerson
  nickname: string | null
  tier: string
  effective_tier: string
  is_employed: boolean
}

export async function listMemberships(personToken: string, venueId: string): Promise<MembershipRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow[]>(`/venues/${venueId}/memberships`, {}, personToken)
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts
git commit -m "feat: add Positions and Memberships client functions to xvm-api.ts"
```

---

### Task 3: The migration script

**Files:**
- Create: `apps/web/scripts/migrate-positions.ts`

Reads one venue's `Role` rows (+ who holds them, via both `Membership.roleId` and `MembershipRoleAssignment`) from Prisma, and idempotently creates/updates the matching `Position` on xvm-api, then assigns members whose dashboard account already has a linked xvm-api person (via `getValidXvmApiPersonId`, matched against xvm-api's own `listMemberships`). Anyone without a resolvable xvm-api person is logged and skipped, not treated as an error — that's the open membership-linkage question, not this script's job to solve.

Defaults to `--dry-run` (prints what it would do). Pass `--apply` to actually write.

- [ ] **Step 1: Write the script**

```typescript
// apps/web/scripts/migrate-positions.ts
/**
 * One-off, idempotent migration of a single venue's Prisma Role rows (+ member
 * assignments) into xvm-api's Position module. Read-only against Prisma, only
 * writes to xvm-api over HTTP.
 *
 * Usage:
 *   npx tsx scripts/migrate-positions.ts <venueId>              # dry run (default)
 *   npx tsx scripts/migrate-positions.ts <venueId> --apply       # actually write
 */
import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  listPositions,
  createPosition,
  assignPositionMember,
  listMemberships,
} from "../lib/api/xvm-api"
import { getValidXvmApiPersonId, getValidXvmApiToken } from "../lib/api/xvm-api-store"
import { hexColorToInt, dollarsToMinorUnits } from "../lib/api/position-convert"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const [venueId, ...flags] = process.argv.slice(2)
  const apply = flags.includes("--apply")

  if (!venueId) {
    console.error("Usage: npx tsx scripts/migrate-positions.ts <venueId> [--apply]")
    process.exit(1)
  }

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — Position migration for venue ${venueId}\n`)

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, xvmApiVenueId: true },
  })
  if (!venue) {
    console.error(`No such venue: ${venueId}`)
    process.exit(1)
  }
  if (!venue.xvmApiVenueId) {
    console.error(`Venue "${venue.name}" isn't linked to xvm-api yet (no xvmApiVenueId).`)
    process.exit(1)
  }

  const roles = await prisma.role.findMany({
    where: { venueId },
    include: {
      memberships: { select: { id: true, userId: true } },
      additionalFor: { include: { membership: { select: { id: true, userId: true } } } },
    },
  })
  if (roles.length === 0) {
    console.log(`Venue "${venue.name}" has no roles to migrate.`)
    return
  }

  // Any owner/manager on this venue with a valid stored token can act — we just
  // need one. Prefer the venue's actual owner.
  const ownerMembership = await prisma.membership.findFirst({
    where: { venueId, role: "OWNER", status: "active" },
    select: { userId: true },
  })
  if (!ownerMembership) {
    console.error(`No active owner found for venue "${venue.name}" — can't authenticate to xvm-api.`)
    process.exit(1)
  }

  const token = await getValidXvmApiToken(ownerMembership.userId)
  if (!token) {
    console.error(
      `Venue "${venue.name}"'s owner has no valid stored xvm-api token. They need to log in to the dashboard first.`
    )
    process.exit(1)
  }

  const existingPositions = await listPositions(token, venue.xvmApiVenueId)
  const existingMemberships = await listMemberships(token, venue.xvmApiVenueId)

  for (const role of roles) {
    const existing = existingPositions.find((p) => p.name.toLowerCase() === role.name.toLowerCase())

    let positionId: number
    if (existing) {
      console.log(`  [skip-create] Position "${role.name}" already exists (id ${existing.id})`)
      positionId = existing.id
    } else {
      const payload = {
        name: role.name,
        color: hexColorToInt(role.color),
        responsibilities: role.responsibilities,
        hourly_rate_minor: dollarsToMinorUnits(role.hourlyRate ? Number(role.hourlyRate) : null),
      }
      console.log(`  [create] Position "${role.name}"`, apply ? "" : "(dry run, not sent)", payload)
      if (apply) {
        const created = await createPosition(token, venue.xvmApiVenueId, payload)
        positionId = created.id
      } else {
        continue // can't assign members to a position that doesn't exist yet in dry-run
      }
    }

    // Members: Membership.roleId (primary) + MembershipRoleAssignment (additional).
    const memberUserIds = new Set<string>([
      ...role.memberships.map((m) => m.userId),
      ...role.additionalFor.map((a) => a.membership.userId),
    ])

    for (const userId of memberUserIds) {
      const personId = await getValidXvmApiPersonId(userId)
      if (personId === null) {
        console.log(`    [skip-member] user ${userId} has no linked xvm-api account yet — not assigned`)
        continue
      }
      const xvmMembership = existingMemberships.find((m) => m.person.id === personId)
      if (!xvmMembership) {
        console.log(`    [skip-member] user ${userId} (person ${personId}) has no xvm-api membership at this venue`)
        continue
      }
      if (existing?.member_ids.includes(xvmMembership.id)) {
        console.log(`    [skip-assign] membership ${xvmMembership.id} already holds "${role.name}"`)
        continue
      }
      console.log(`    [assign] membership ${xvmMembership.id} -> "${role.name}"`, apply ? "" : "(dry run, not sent)")
      if (apply) {
        await assignPositionMember(token, venue.xvmApiVenueId, positionId, xvmMembership.id)
      }
    }
  }

  console.log(`\nDone.${apply ? "" : " Re-run with --apply to actually write."}\n`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/migrate-positions.ts
git commit -m "feat: add Positions migration script (dry-run by default)"
```

---

### Task 4: Live dry-run and apply against the test venue

**Files:** none (verification only)

- [ ] **Step 1: Confirm local dev DB and xvm-api-dev are reachable**

Run: `docker ps --format '{{.Names}}\t{{.Status}}' | grep xiv-app`
Expected: `xiv-app-postgres-local` and `xiv-app-redis-local` both `Up`

- [ ] **Step 2: Run the dry run**

Run: `cd apps/web && DATABASE_URL="postgresql://postgres:postgres@localhost:5432/venue_manager" XVM_API_BASE_URL="http://192.168.1.122:8001" npx tsx scripts/migrate-positions.ts cmt1npwzw0002m8y5ylzb66jk`

Expected output: `DRY RUN` header, `[create] Position "Manager"` with the payload logged (color `6357233` / `0x6366f1`, responsibilities `null`, hourly_rate_minor `null`), no `[assign]` lines yet since the position doesn't exist to assign against in dry-run, ends with "Re-run with --apply to actually write."

(Adjust the `DATABASE_URL` password/port to match your local `.env` if it differs — check `apps/web/.env.local`.)

- [ ] **Step 3: Run for real**

Run: same command with `--apply` appended.

Expected output: `APPLYING` header, `[create]` (no dry-run suffix), then `[assign] membership 1 -> "Manager"` (Ehno's own membership, since he's Owner and already has a linked xvm-api person).

- [ ] **Step 4: Verify against xvm-api-dev directly**

Run: `ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d xvm_api_dev -c \"SELECT p.id, p.name, p.color, mp.membership_id FROM positions p LEFT JOIN membership_positions mp ON mp.position_id = p.id WHERE p.venue_id = 'ven_xx499NE0rPoa';\""`

Expected: one row, `name = 'Manager'`, `color = 6513905` (or whatever `0x6366f1` decimal is), `membership_id = 1`.

- [ ] **Step 5: Re-run `--apply` a second time to confirm idempotency**

Run: same `--apply` command again.

Expected: `[skip-create]` and `[skip-assign]` for everything — no duplicate position, no error, matching the case-insensitive name-uniqueness safety Allegro described.

- [ ] **Step 6: Commit nothing further — this task is verification only**

If Step 5 doesn't come back clean (duplicate created, or an error), stop and report back rather than re-running further — that means the idempotency assumption was wrong somewhere and needs a look before this touches any other venue.
