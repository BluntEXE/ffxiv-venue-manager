# Tasks→xvm-api Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the dashboard's Tasks feature off Prisma onto xvm-api's Tasks module, following the same full-cutover pattern already shipped for Rooms/Hours/Positions(Roles), plus the invite/accept plumbing and membership backfill script that Tasks (uniquely, among cutovers so far) actually needs to be useful beyond the venue owner.

**Architecture:** Three sequential groups. **Group A** adds `inviteMember`/`acceptInvite` to the xvm-api client and wires auto-accept into the login callback — this is prerequisite plumbing with no user-visible surface of its own. **Group B** is a one-off idempotent script (matching `scripts/migrate-positions.ts`) that backfills xvm-api Memberships for a venue's existing Prisma roster, using Group A's functions. **Group C** rewrites the Tasks routes to read/write exclusively through xvm-api, following the Roles→Positions cutover's gate/error-handling template, plus the category name↔id and priority enum↔int mapping helpers, plus the frontend call-site changes the status-model split requires.

Groups are sequenced A → B → C because B calls `acceptInvite` from A, and because C's task-assignment/start/complete paths only work end-to-end for a person who already has an xvm-api Membership — same requirement every prior cutover (Rooms/Hours/Roles) already imposed. C's routes can be written, merged, and used by a venue's owner (who already has a Membership via `createVenue()`) without waiting on A/B, exactly like Roles shipped — A and B are what extend that from "owner-only" to "the whole venue roster," which is required before Tasks is genuinely usable, since task assignment/claiming is the feature's core interaction.

**Tech Stack:** Next.js 15 route handlers (`apps/web/app/api/...`), Zod validation, Prisma (read-only in this cutover, for the backfill script and pre-cutover comparison only), xvm-api (FastAPI) as the new source of truth, Vitest for unit tests.

---

## Before you start

Work in the existing worktree, already reset onto `origin/dev` with `pnpm install` done:

```bash
cd /home/ehno/xiv-app/.claude/worktrees/dashboard-xvm-api-tasks-cutover/apps/web
pnpm typecheck   # expect: clean, no errors
pnpm test        # expect: all passing (baseline was 83 passed / 3 skipped as of 2026-08-30)
```

If either fails, stop and reconcile with `origin/dev` before starting — don't build on a broken baseline.

---

## Group A: Invite/accept API client + auto-accept-on-login

### Task A1: `inviteMember` and `acceptInvite` client functions

**Files:**
- Modify: `lib/api/xvm-api.ts`
- Test: `lib/api/xvm-api.test.ts` (new file — no test currently exists for this module; this task establishes the pattern)

xvm-api's endpoints (`/home/ehno/xvm-api/src/api/routers/memberships.py`):
- `POST /venues/{venue_id}/invites` (`create_invite`) — caller's own token, must hold Staff-assign authority (Manager+) at that venue. Body: `InviteCreate {provider: "discord", external_id?, display_name, tier}`. Returns `InviteIssued` (201): `{id, person: {id, display_name}, tier, expires_at, invited_by_person_id, token}`. Errors: 400 "You cannot invite yourself", 409 "already a member".
- `POST /invites/accept` (`accept_invite`) — the *invitee's own* token, not venue-scoped. Body: `InviteAccept {token}`. Returns `MembershipRow` (200): `{id, person: {id, display_name}, nickname, tier, effective_tier, is_employed}`. Errors: 400 "Unknown invite token", 403 "invite was issued to a different account", 409 "expired" or "already a member".

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/api/xvm-api.test.ts
import { describe, it, expect, vi, afterEach } from "vitest"
import { inviteMember, acceptInvite, XvmApiError } from "./xvm-api"

function mockFetchOnce(response: { ok: boolean; status: number; body?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      text: async () => (response.body === undefined ? "" : JSON.stringify(response.body)),
      json: async () => response.body,
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("inviteMember", () => {
  it("POSTs to /venues/{venueId}/invites with the invite payload and returns the issued invite", async () => {
    const issued = {
      id: 1,
      person: { id: 42, display_name: "Bob" },
      tier: "staff",
      expires_at: "2026-09-07T00:00:00Z",
      invited_by_person_id: 1,
      token: "abc123",
    }
    mockFetchOnce({ ok: true, status: 201, body: issued })
    const result = await inviteMember("owner-token", "venue-1", {
      provider: "discord",
      external_id: "123456789",
      display_name: "Bob",
      tier: "staff",
    })
    expect(result).toEqual(issued)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/invites")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({
      provider: "discord",
      external_id: "123456789",
      display_name: "Bob",
      tier: "staff",
    })
  })

  it("throws XvmApiError with status 409 when the person is already a member", async () => {
    mockFetchOnce({ ok: false, status: 409, body: { detail: "This person is already a member of this venue." } })
    await expect(
      inviteMember("owner-token", "venue-1", { provider: "discord", display_name: "Bob", tier: "staff" })
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe("acceptInvite", () => {
  it("POSTs to /invites/accept with the token and returns the created membership", async () => {
    const membership = {
      id: 7,
      person: { id: 42, display_name: "Bob" },
      nickname: null,
      tier: "staff",
      effective_tier: "staff",
      is_employed: true,
    }
    mockFetchOnce({ ok: true, status: 200, body: membership })
    const result = await acceptInvite("bobs-token", "abc123")
    expect(result).toEqual(membership)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/invites/accept")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({ token: "abc123" })
  })

  it("throws XvmApiError with status 403 when the invite belongs to a different account", async () => {
    mockFetchOnce({ ok: false, status: 403, body: { detail: "This invite was issued to a different person." } })
    await expect(acceptInvite("bobs-token", "abc123")).rejects.toBeInstanceOf(XvmApiError)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/api/xvm-api.test.ts`
Expected: FAIL — `inviteMember`/`acceptInvite` are not exported from `./xvm-api`

- [ ] **Step 3: Implement the client functions**

Add to `lib/api/xvm-api.ts`, in a new `// ── Memberships / Invites API ─────` section after the Venue Hours API section (after `getOpenNow`, the current end of file):

```typescript
// ── Memberships / Invites API ───────────────────────────────────

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

export interface InviteCreate {
  provider: "discord"
  external_id?: string | null
  display_name: string
  tier?: "owner" | "manager" | "staff"
}

export interface InviteIssued {
  id: number
  person: MembershipPerson
  tier: string
  expires_at: string
  invited_by_person_id: number | null
  token: string
}

export async function inviteMember(personToken: string, venueId: string, data: InviteCreate): Promise<InviteIssued> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<InviteIssued>(`/venues/${venueId}/invites`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function acceptInvite(personToken: string, token: string): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>("/invites/accept", { method: "POST", body: JSON.stringify({ token }) }, personToken)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/api/xvm-api.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add lib/api/xvm-api.ts lib/api/xvm-api.test.ts
git commit -m "feat: add inviteMember/acceptInvite to the xvm-api client"
```

---

### Task A2: Flag the missing "list my pending invites" endpoint (cross-repo, xvm-api side)

This is not a dashboard code change — it's a real gap found while scoping auto-accept-on-login, and it blocks Task A3.

xvm-api has no venue-agnostic way for a person to list invites issued to them. `GET /venues/{venue_id}/invites` (`list_invites` in `/home/ehno/xvm-api/src/api/routers/memberships.py`) requires `require_may_assign(MembershipTier.Staff)` — i.e., the caller must already be a Manager+ **at that specific venue**, which is exactly backwards for "what invites am I waiting on" (the invitee, by definition, isn't a member of that venue yet). `GET /me` (`/home/ehno/xvm-api/src/api/routers/auth.py`) returns only actual memberships, not pending invites. There is no `GET /me/invites` or equivalent anywhere in `src/api/routers/`.

- [ ] **Step 1: File the cross-repo request**

```bash
gh issue create --repo xiv-venue-manager/xvm-api --title "Need a venue-agnostic 'my pending invites' endpoint for auto-accept-on-login" --body "$(cat <<'EOF'
Scoped while building the dashboard's Tasks→xvm-api cutover (see xvm-dashboard's docs/superpowers/plans/2026-08-31-tasks-xvm-api-cutover.md, Group A).

The dashboard wants to auto-accept a pending invite on login, using the invitee's own person token. There's currently no way to look this up: `GET /venues/{venue_id}/invites` requires Manager+ authority at that venue (backwards for an invitee who isn't a member yet), and `GET /me` only returns actual memberships, not pending invites.

Requested: a `GET /me/invites` endpoint (or equivalent), authenticated as a person token, returning pending invites issued to that person's linked accounts (matched via `VenueInviteModel.person_id`), unscoped by venue. Shape can mirror `InviteRow` (id, person, tier, expires_at, invited_by_person_id) plus venue_id so the caller knows which venue each invite is for.

Not urgent/blocking — the dashboard's Group A auto-accept task (A3) is written against this assumed shape and can land once this exists.
EOF
)"
```

- [ ] **Step 2: Record the dependency in the plan**

No code change. Task A3 below is written assuming this endpoint exists as `GET /me/invites` returning `{id, venue_id, person, tier, expires_at, invited_by_person_id}[]`. If Frogge/Allegro ships a different shape, adjust A3's `listMyInvites` client function and its call site accordingly before implementing.

---

### Task A3: `listMyInvites` client function + auto-accept-on-login

**Depends on:** Task A2's endpoint existing on xvm-api. If it hasn't landed yet, implement this task's code but leave it uncalled from `lib/auth.ts` (skip the Step 5 wiring) and note the block in the commit message — don't fabricate a workaround.

**Files:**
- Modify: `lib/api/xvm-api.ts`
- Modify: `lib/auth.ts`
- Test: `lib/api/xvm-api.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `lib/api/xvm-api.test.ts`:

```typescript
describe("listMyInvites", () => {
  it("GETs /me/invites and returns pending invites for the caller", async () => {
    const invites = [
      { id: 1, venue_id: "venue-1", person: { id: 42, display_name: "Bob" }, tier: "staff", expires_at: "2026-09-07T00:00:00Z", invited_by_person_id: 1 },
    ]
    mockFetchOnce({ ok: true, status: 200, body: invites })
    const result = await listMyInvites("bobs-token")
    expect(result).toEqual(invites)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/me/invites")
  })
})
```

Add `listMyInvites` to the existing import line at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/api/xvm-api.test.ts`
Expected: FAIL — `listMyInvites` not exported

- [ ] **Step 3: Implement the client function**

Add to `lib/api/xvm-api.ts`, next to `inviteMember`/`acceptInvite`:

```typescript
export interface MyInviteRow {
  id: number
  venue_id: string
  person: MembershipPerson
  tier: string
  expires_at: string
  invited_by_person_id: number | null
}

export async function listMyInvites(personToken: string): Promise<MyInviteRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MyInviteRow[]>("/me/invites", {}, personToken)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/api/xvm-api.test.ts`
Expected: PASS, 6 tests total in this file

- [ ] **Step 5: Wire auto-accept into the login callback**

In `lib/auth.ts`, both places that mint or refresh the xvm-api token already have a valid `token` available afterward — the first-sign-in branch (after `upsertXvmApiCredential`) and the refresh branch (after `upsertXvmApiCredential` inside the `if (!existing)` block). Add a shared, non-fatal auto-accept step after each. Extract it as a helper to avoid duplicating the try/catch in both branches:

```typescript
// Add to imports at the top of lib/auth.ts:
import { listMyInvites, acceptInvite } from "@/lib/api/xvm-api"

// Add this function above authOptions:
async function autoAcceptPendingInvites(personToken: string): Promise<void> {
  const invites = await listMyInvites(personToken)
  for (const invite of invites) {
    try {
      await acceptInvite(personToken, invite.token)
    } catch (err) {
      // Non-fatal: expired/already-a-member races are expected and harmless -
      // the invite will simply stay pending or was already resolved elsewhere.
      console.error(`xvm-api auto-accept failed for invite ${invite.id}:`, err)
    }
  }
}
```

Wait — `MyInviteRow` doesn't carry a `token` field (invites returned by `list_invites`/`InviteRow` never expose the raw token after issuance, only `InviteIssued` does, at creation time). Re-check `/home/ehno/xvm-api/src/api/schemas/memberships.py`: `InviteRow` has no `token`; only `InviteIssued(InviteRow)` adds it, returned once from `create_invite`. So `GET /me/invites` (however Frogge implements it) can only return `InviteRow`-shaped rows — no token to accept with.

This means `POST /invites/accept` needs a second path: accepting by invite id (as the now-authenticated invitee) rather than by token, since the token was never given to the invitee out-of-band in the auto-accept flow (nobody emailed it to them — the backfill script from Group B holds it in memory only). Flag this as a second cross-repo ask in Task A2's issue rather than guessing at a workaround: xvm-api's `accept_invite` needs an id-based variant (`POST /invites/{invite_id}/accept`, authenticated as the invitee, no token required) for the auto-accept-on-login case specifically. Update the Task A2 issue body to include this before filing it (fold both asks into one issue, not two).

Given that, Task A3's implementation is blocked on xvm-api exposing an id-based accept, not just the list endpoint. Write the client function and helper against that assumed shape:

```typescript
// Replace the acceptInvite-by-token call in autoAcceptPendingInvites with:
export async function acceptInviteById(personToken: string, inviteId: number): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(`/invites/${inviteId}/accept`, { method: "POST" }, personToken)
}
```

```typescript
async function autoAcceptPendingInvites(personToken: string): Promise<void> {
  const invites = await listMyInvites(personToken)
  for (const invite of invites) {
    try {
      await acceptInviteById(personToken, invite.id)
    } catch (err) {
      console.error(`xvm-api auto-accept failed for invite ${invite.id}:`, err)
    }
  }
}
```

Call it in both branches of the `jwt` callback, immediately after each `upsertXvmApiCredential` call, wrapped the same non-fatal way the surrounding code already is:

```typescript
// After `await upsertXvmApiCredential(user.id, issued)` in the isFirstDiscordSignIn branch,
// and after `await upsertXvmApiCredential(token.id as string, issued)` in the refresh branch:
try {
  await autoAcceptPendingInvites(issued.secret)
} catch (err) {
  console.error("xvm-api auto-accept-on-login failed:", err)
}
```

- [ ] **Step 6: Update Task A2's issue** to request `GET /me/invites` (id-based rows, no token) and `POST /invites/{invite_id}/accept` (accept by id as the authenticated invitee) as one combined ask, before A3's wiring can be tested end-to-end.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm typecheck
git add lib/api/xvm-api.ts lib/api/xvm-api.test.ts lib/auth.ts
git commit -m "feat: add listMyInvites/acceptInviteById, wire auto-accept-on-login

Blocked on xvm-api exposing GET /me/invites and POST /invites/{id}/accept
(see cross-repo issue) - code is written against that shape but the login
path will silently no-op (empty invite list, or 404 on accept) until it lands."
```

---

## Group B: Membership backfill script

### Task B1: `scripts/backfill-memberships.ts`

**Files:**
- Create: `scripts/backfill-memberships.ts`
- No test file — matches `scripts/migrate-positions.ts`'s precedent: scripts in this repo are verified by typecheck + a real dry-run against local dev data, not unit tests.

**Depends on:** Task A1 (`inviteMember`, `acceptInvite` must exist).

Mirrors `scripts/migrate-positions.ts` exactly in structure: same inlined `getValidXvmApiToken`/`getValidXvmApiPersonId` (backed by the script's own local Prisma client, not the app's shared singleton), same CLI shape, same dry-run-by-default, same idempotent-and-loud-about-skips philosophy.

- [ ] **Step 1: Write the script**

```typescript
/**
 * One-off, idempotent backfill of xvm-api Memberships for a venue's existing
 * Prisma roster. Read-only against Prisma, only writes to xvm-api over HTTP.
 *
 * Usage:
 *   npx tsx scripts/backfill-memberships.ts <venueId>              # dry run (default)
 *   npx tsx scripts/backfill-memberships.ts <venueId> --apply       # actually write
 */
import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { inviteMember, acceptInvite, getMe, XvmApiError } from "../lib/api/xvm-api"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// Inlined from lib/api/xvm-api-store.ts, backed by this script's own local
// `prisma` client instead of the app's shared singleton - see migrate-positions.ts
// for why (avoids a second, never-disconnected Postgres pool).
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000 // 1 day

async function getValidXvmApiToken(userId: string): Promise<string | null> {
  const row = await prisma.xvmApiCredential.findUnique({ where: { userId } })
  if (!row) return null
  if (row.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) return null
  return row.token
}

const TIER_BY_ROLE: Record<string, "owner" | "manager" | "staff"> = {
  OWNER: "owner",
  MANAGER: "manager",
  STAFF: "staff",
}

async function main() {
  const [venueId, ...flags] = process.argv.slice(2)
  const apply = flags.includes("--apply")

  if (!venueId) {
    console.error("Usage: npx tsx scripts/backfill-memberships.ts <venueId> [--apply]")
    process.exit(1)
  }

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — Membership backfill for venue ${venueId}\n`)

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

  const memberships = await prisma.membership.findMany({
    where: { venueId, status: { in: ["active", "pending"] } },
    include: { user: { select: { id: true, discordId: true, name: true } } },
  })
  if (memberships.length === 0) {
    console.log(`Venue "${venue.name}" has no memberships to backfill.`)
    return
  }

  const ownerMembership = memberships.find((m) => m.role === "OWNER" && m.status === "active")
  if (!ownerMembership?.userId) {
    console.error(`No active owner found for venue "${venue.name}" — can't authenticate to xvm-api.`)
    process.exit(1)
  }
  const ownerToken = await getValidXvmApiToken(ownerMembership.userId)
  if (!ownerToken) {
    console.error(
      `Venue "${venue.name}"'s owner has no valid stored xvm-api token. They need to log in to the dashboard first.`
    )
    process.exit(1)
  }

  for (const membership of memberships) {
    const label = membership.user?.name ?? membership.invitedName ?? `membership ${membership.id}`

    if (membership.role === "OWNER") {
      console.log(`  [skip-owner] "${label}" is the venue owner, already has an xvm-api Membership from createVenue()`)
      continue
    }

    const discordId = membership.user?.discordId ?? null
    if (!discordId) {
      console.log(`  [skip] "${label}" has no linked Discord account, cannot invite`)
      continue
    }

    const tier = TIER_BY_ROLE[membership.role]
    console.log(`  [invite] "${label}" (discord ${discordId}) as ${tier}`, apply ? "" : "(dry run, not sent)")
    if (!apply) continue

    let issued
    try {
      issued = await inviteMember(ownerToken, venue.xvmApiVenueId, {
        provider: "discord",
        external_id: discordId,
        display_name: label,
        tier,
      })
    } catch (err) {
      if (err instanceof XvmApiError && err.status === 409) {
        console.log(`    [skip-invite] "${label}" is already a member of this venue on xvm-api`)
        continue
      }
      throw err
    }

    if (!membership.userId) {
      console.log(`    [pending] "${label}" invited, no dashboard User row (never accepted a dashboard invite) - can't self-accept`)
      continue
    }

    const memberToken = await getValidXvmApiToken(membership.userId)
    if (!memberToken) {
      console.log(`    [skip-accept] "${label}" has no stored xvm-api token yet (never logged in) - invite issued, will complete on next login via auto-accept`)
      continue
    }

    try {
      await acceptInvite(memberToken, issued.token)
      console.log(`    [accept] "${label}" completed immediately`)
    } catch (err) {
      console.log(`    [skip-accept] "${label}" accept failed (${err instanceof XvmApiError ? err.status : "error"}), will retry via auto-accept on next login`)
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

Note: `getMe` is imported but unused in this version — `migrate-positions.ts` needed it for `getValidXvmApiPersonId` (to resolve a person id for position-member matching). This script never needs the *members'* person id, only their token, so drop the `getMe` import. Fix before committing.

- [ ] **Step 2: Typecheck**

Run: `cd /home/ehno/xiv-app/.claude/worktrees/dashboard-xvm-api-tasks-cutover/apps/web && pnpm typecheck`
Expected: clean (after removing the unused `getMe` import)

- [ ] **Step 3: Dry-run against a real local-dev venue**

Run: `npx tsx scripts/backfill-memberships.ts <a real dev venueId> ` (no `--apply`)
Expected: prints one line per membership (`[skip-owner]`, `[skip]`, or `[invite] ... (dry run, not sent)`), no errors, no writes.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-memberships.ts
git commit -m "feat: add xvm-api Membership backfill script for existing venue rosters"
```

---

## Group C: Tasks routes cutover

### Task C1: Category and priority conversion helpers

**Files:**
- Create: `lib/api/task-convert.ts`
- Test: `lib/api/task-convert.test.ts`

Priority: Prisma's 4-value string enum (`LOW`/`MEDIUM`/`HIGH`/`URGENT`) vs xvm-api's `int 0-3` (`MAX_TASK_PRIORITY = 3`, `TaskCreate.priority` defaults to `1`). Category: Prisma's free-text `category: String?` vs xvm-api's `category_id: int | null` (FK to `TaskCategoryModel`, case-insensitive unique name per venue, per `create_category`'s 409 "already exists" — same name-uniqueness idempotency pattern Roles used).

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/api/task-convert.test.ts
import { describe, it, expect } from "vitest"
import { priorityToInt, intToPriority } from "./task-convert"

describe("priorityToInt / intToPriority round-trip", () => {
  it.each([
    ["LOW", 0],
    ["MEDIUM", 1],
    ["HIGH", 2],
    ["URGENT", 3],
  ] as const)("%s <-> %d", (label, int) => {
    expect(priorityToInt(label)).toBe(int)
    expect(intToPriority(int)).toBe(label)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/api/task-convert.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement the priority helpers**

```typescript
// lib/api/task-convert.ts
// xvm-api's Task.priority is an int 0-3 (0=low..3=urgent, MAX_TASK_PRIORITY=3);
// Prisma's TaskPriority is the 4-value string enum every UI dropdown in this app
// already uses.
export type TaskPriorityLabel = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

const PRIORITY_TO_INT: Record<TaskPriorityLabel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
}
const INT_TO_PRIORITY: TaskPriorityLabel[] = ["LOW", "MEDIUM", "HIGH", "URGENT"]

export function priorityToInt(label: TaskPriorityLabel): number {
  return PRIORITY_TO_INT[label]
}

export function intToPriority(value: number): TaskPriorityLabel {
  const label = INT_TO_PRIORITY[value]
  if (!label) throw new Error(`Invalid task priority int: ${value}`)
  return label
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/api/task-convert.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Add the category find-or-create helper**

This one isn't a pure function (it calls xvm-api), so it's tested differently — same `vi.stubGlobal("fetch", ...)` style as `xvm-api.test.ts`, not `describe.each` on pure inputs. Add to `lib/api/xvm-api.ts` first (the underlying client calls), then the find-or-create wrapper in `task-convert.ts`:

In `lib/api/xvm-api.ts`, add under a new `// ── Tasks API ──` section:

```typescript
export interface CategoryRow {
  id: number
  name: string
  sort_order: number
}

export async function listTaskCategories(personToken: string, venueId: string): Promise<CategoryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<CategoryRow[]>(`/venues/${venueId}/tasks/categories`, {}, personToken)
}

export async function createTaskCategory(personToken: string, venueId: string, name: string): Promise<CategoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<CategoryRow>(
    `/venues/${venueId}/tasks/categories`,
    { method: "POST", body: JSON.stringify({ name, sort_order: 0 }) },
    personToken
  )
}
```

In `lib/api/task-convert.ts`, add:

```typescript
import { listTaskCategories, createTaskCategory, XvmApiError } from "./xvm-api"

// Find-or-create by case-insensitive name, same idempotency pattern
// migrate-positions.ts uses for Role/Position name matching. A 409 from
// createTaskCategory means another request created it first between our
// list and create calls - refetch and use the now-existing one rather than
// treating it as a real error.
export async function resolveCategoryId(personToken: string, venueId: string, name: string): Promise<number> {
  const existing = await listTaskCategories(personToken, venueId)
  const match = existing.find((c) => c.name.toLowerCase() === name.toLowerCase())
  if (match) return match.id

  try {
    const created = await createTaskCategory(personToken, venueId, name)
    return created.id
  } catch (err) {
    if (err instanceof XvmApiError && err.status === 409) {
      const refetched = await listTaskCategories(personToken, venueId)
      const nowMatch = refetched.find((c) => c.name.toLowerCase() === name.toLowerCase())
      if (nowMatch) return nowMatch.id
    }
    throw err
  }
}
```

- [ ] **Step 6: Write and run the test for `resolveCategoryId`**

```typescript
// Append to lib/api/task-convert.test.ts
import { describe, it, expect, vi, afterEach } from "vitest"
import { priorityToInt, intToPriority, resolveCategoryId } from "./task-convert"

function mockFetchSequence(responses: Array<{ ok: boolean; status: number; body?: unknown }>) {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce({ ok: r.ok, status: r.status, text: async () => (r.body === undefined ? "" : JSON.stringify(r.body)), json: async () => r.body })
  }
  vi.stubGlobal("fetch", fn)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("resolveCategoryId", () => {
  it("returns the existing category's id on a case-insensitive name match", async () => {
    mockFetchSequence([{ ok: true, status: 200, body: [{ id: 5, name: "Setup", sort_order: 0 }] }])
    const id = await resolveCategoryId("token", "venue-1", "setup")
    expect(id).toBe(5)
  })

  it("creates a new category when no match exists", async () => {
    mockFetchSequence([
      { ok: true, status: 200, body: [] },
      { ok: true, status: 201, body: { id: 9, name: "Promo", sort_order: 0 } },
    ])
    const id = await resolveCategoryId("token", "venue-1", "Promo")
    expect(id).toBe(9)
  })

  it("refetches and uses the winner on a 409 race", async () => {
    mockFetchSequence([
      { ok: true, status: 200, body: [] },
      { ok: false, status: 409, body: { detail: "A category with this name already exists." } },
      { ok: true, status: 200, body: [{ id: 3, name: "Cleanup", sort_order: 0 }] },
    ])
    const id = await resolveCategoryId("token", "venue-1", "Cleanup")
    expect(id).toBe(3)
  })
})
```

Run: `pnpm vitest run lib/api/task-convert.test.ts`
Expected: PASS, 7 tests total

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm typecheck
git add lib/api/xvm-api.ts lib/api/task-convert.ts lib/api/task-convert.test.ts
git commit -m "feat: add task priority and category conversion helpers"
```

---

### Task C2: Tasks API client functions

**Files:**
- Modify: `lib/api/xvm-api.ts`
- Test: `lib/api/xvm-api.test.ts`

xvm-api endpoints (`/home/ehno/xvm-api/src/api/routers/tasks.py`, all under `/venues/{venue_id}/tasks`):
- `GET ""` — `list_tasks(include_completed, include_cancelled, category_id)`, any member, visibility-filtered.
- `POST ""` — `create_task(TaskCreate)`, Manager tier.
- `PATCH "/{id}"` — `update_task(TaskUpdate)`, Manager tier, open tasks only.
- `POST "/{id}/assign"` — `assign_task(TaskAssign {membership_id|position_id, both null unassigns})`, Manager tier.
- `POST "/{id}/start"` — any member (visibility/ownership gated server-side).
- `POST "/{id}/complete"` — any member (visibility/ownership gated server-side).
- `POST "/{id}/cancel"` — `cancel_task(TaskCancel {reason})`, Manager tier.

- [ ] **Step 1: Write the failing tests**

```typescript
// Append to lib/api/xvm-api.test.ts
describe("Tasks API", () => {
  const sampleTask = {
    id: 1,
    title: "Restock bar",
    description: null,
    priority: 2,
    due_at: null,
    category_id: null,
    assigned_membership_id: null,
    assigned_position_id: null,
    started_at: null,
    completed_at: null,
    completed_by_person_id: null,
    cancelled_at: null,
    cancel_reason: null,
    created_by_person_id: 1,
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
  }

  it("listTasks GETs the venue's tasks with query params", async () => {
    mockFetchOnce({ ok: true, status: 200, body: [sampleTask] })
    const result = await listTasks("token", "venue-1", { includeCancelled: true })
    expect(result).toEqual([sampleTask])
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("include_cancelled=true")
  })

  it("createTask POSTs to /venues/{venueId}/tasks", async () => {
    mockFetchOnce({ ok: true, status: 201, body: sampleTask })
    const result = await createTask("token", "venue-1", { title: "Restock bar", priority: 2 })
    expect(result).toEqual(sampleTask)
  })

  it("updateTask PATCHes /{id}", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    const result = await updateTask("token", "venue-1", 1, { title: "Restock bar urgently" })
    expect(result).toEqual(sampleTask)
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/venues/venue-1/tasks/1")
    expect(options.method).toBe("PATCH")
  })

  it("assignTask POSTs to /{id}/assign", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await assignTask("token", "venue-1", 1, { position_id: 5 })
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/assign")
  })

  it("startTask POSTs to /{id}/start", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await startTask("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/start")
  })

  it("completeTask POSTs to /{id}/complete", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await completeTask("token", "venue-1", 1)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/complete")
  })

  it("cancelTask POSTs to /{id}/cancel with an optional reason", async () => {
    mockFetchOnce({ ok: true, status: 200, body: sampleTask })
    await cancelTask("token", "venue-1", 1, "No longer needed")
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/tasks/1/cancel")
    expect(JSON.parse(options.body)).toEqual({ reason: "No longer needed" })
  })
})
```

Add `listTasks, createTask, updateTask, assignTask, startTask, completeTask, cancelTask, type TaskRow` to the test file's import line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/api/xvm-api.test.ts`
Expected: FAIL — none of these functions exist yet

- [ ] **Step 3: Implement the client functions**

Add to `lib/api/xvm-api.ts`, in the `// ── Tasks API ──` section started in Task C1:

```typescript
export interface TaskRow {
  id: number
  title: string
  description: string | null
  priority: number
  due_at: string | null
  category_id: number | null
  assigned_membership_id: number | null
  assigned_position_id: number | null
  started_at: string | null
  completed_at: string | null
  completed_by_person_id: number | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_by_person_id: number | null
  created_at: string
  updated_at: string
}

export interface TaskCreateData {
  title: string
  description?: string | null
  priority?: number
  due_at?: string | null
  category_id?: number | null
  assigned_membership_id?: number | null
  assigned_position_id?: number | null
}

export interface TaskUpdateData {
  title?: string
  description?: string | null
  priority?: number
  due_at?: string | null
  category_id?: number | null
}

export interface TaskAssignData {
  membership_id?: number | null
  position_id?: number | null
}

export async function listTasks(
  personToken: string,
  venueId: string,
  options: { includeCompleted?: boolean; includeCancelled?: boolean; categoryId?: number } = {}
): Promise<TaskRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams()
  if (options.includeCompleted) params.set("include_completed", "true")
  if (options.includeCancelled) params.set("include_cancelled", "true")
  if (options.categoryId !== undefined) params.set("category_id", String(options.categoryId))
  const query = params.toString() ? `?${params}` : ""
  return xvmFetch<TaskRow[]>(`/venues/${venueId}/tasks${query}`, {}, personToken)
}

export async function createTask(personToken: string, venueId: string, data: TaskCreateData): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateTask(personToken: string, venueId: string, taskId: number, data: TaskUpdateData): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

export async function assignTask(personToken: string, venueId: string, taskId: number, data: TaskAssignData): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}/assign`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function startTask(personToken: string, venueId: string, taskId: number): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}/start`, { method: "POST" }, personToken)
}

export async function completeTask(personToken: string, venueId: string, taskId: number): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}/complete`, { method: "POST" }, personToken)
}

export async function cancelTask(personToken: string, venueId: string, taskId: number, reason?: string | null): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(
    `/venues/${venueId}/tasks/${taskId}/cancel`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
    personToken
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/api/xvm-api.test.ts`
Expected: PASS, 13 tests total in this file

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add lib/api/xvm-api.ts lib/api/xvm-api.test.ts
git commit -m "feat: add Tasks API client functions (list/create/update/assign/start/complete/cancel)"
```

---

### Task C3: Rewrite `tasks/route.ts` (list + create)

**Files:**
- Modify: `app/api/venues/[venueId]/tasks/route.ts`

Follows the exact gate/error-handling shape from `app/api/venues/[venueId]/roles/route.ts` in the merged Roles cutover (`worktree-dashboard-xvm-api-tasks-swap`). No dashboard-side Manager-tier check on POST — same as Roles, authorization delegates entirely to xvm-api's own `require_tier(Manager)` on `create_task`, surfaced as a 403 `XvmApiError` if the caller isn't a manager.

Response shape kept close to today's (`id`, `title`, `description`, `status`, `priority`, `category`, `dueDate`, `assignee`, `assignedRole`) so the frontend needs type changes but not full rewrites — same precedent as Roles' `toRoleShape`. `status` is now a derived label computed from the three xvm-api timestamps, since Prisma's flat enum doesn't exist server-side anymore.

- [ ] **Step 1: Write the new route**

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import {
  listTasks,
  createTask,
  listPositions,
  XvmApiError,
  xvmErrorMessage,
  type TaskRow,
  type PositionRow,
} from "@/lib/api/xvm-api"
import { priorityToInt, intToPriority, resolveCategoryId } from "@/lib/api/task-convert"
import { validators } from "@/lib/validation"

const createTaskSchema = z.object({
  title: validators.taskTitle,
  description: validators.taskDescription,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  category: z.string().optional(),
  assignedRoleId: z.number().optional(), // Position id (xvm-api Positions, formerly Prisma Role)
  dueDate: z.string().optional(),
})

// Derived status label - xvm-api has no stored status enum, only timestamps.
// Order matters: a cancelled/completed task is never "in progress" even if
// it happens to have a started_at from before it closed.
function deriveStatus(task: TaskRow): "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" {
  if (task.cancelled_at) return "CANCELLED"
  if (task.completed_at) return "COMPLETED"
  if (task.started_at) return "IN_PROGRESS"
  return "PENDING"
}

function toTaskShape(task: TaskRow, positionsById: Map<number, PositionRow>) {
  const position = task.assigned_position_id ? positionsById.get(task.assigned_position_id) : null
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: deriveStatus(task),
    priority: intToPriority(task.priority),
    category: null as string | null, // resolved by the caller once categories are fetched - see GET handler
    categoryId: task.category_id,
    dueDate: task.due_at,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    assignee: null, // direct membership-based assignment isn't wired in the UI (see plan notes) - always null for now
    assignedRole: position ? { id: position.id, name: position.name, color: position.color } : null,
  }
}

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params
    const { searchParams } = new URL(request.url)
    // Cancelled tasks are hidden by default, matching xvm-api's own list_tasks
    // default - see the delete-maps-to-cancel decision. Completed tasks stay
    // visible by default since today's board always showed them.
    const includeCancelled = searchParams.get("includeCancelled") === "true"

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const [tasks, positions, categories] = await Promise.all([
        listTasks(token, gate.xvmApiVenueId!, { includeCompleted: true, includeCancelled }),
        listPositions(token, gate.xvmApiVenueId!),
        // categories fetched via task-convert's underlying client fn, not resolveCategoryId
        // (no need to create anything on a read path)
        import("@/lib/api/xvm-api").then((m) => m.listTaskCategories(token, gate.xvmApiVenueId!)),
      ])
      const positionsById = new Map(positions.map((p) => [p.id, p]))
      const categoriesById = new Map(categories.map((c) => [c.id, c.name]))
      const shaped = tasks.map((t) => {
        const shape = toTaskShape(t, positionsById)
        return { ...shape, category: t.category_id !== null ? categoriesById.get(t.category_id) ?? null : null }
      })
      return NextResponse.json(shaped)
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[tasks] GET error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof createTaskSchema>
    try {
      data = createTaskSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      let categoryId: number | null = null
      if (data.category) {
        categoryId = await resolveCategoryId(token, gate.xvmApiVenueId!, data.category)
      }

      const task = await createTask(token, gate.xvmApiVenueId!, {
        title: data.title,
        description: data.description ?? null,
        priority: priorityToInt(data.priority),
        due_at: data.dueDate ?? null,
        category_id: categoryId,
        assigned_position_id: data.assignedRoleId ?? null,
      })

      const positions = data.assignedRoleId ? await listPositions(token, gate.xvmApiVenueId!) : []
      const positionsById = new Map(positions.map((p) => [p.id, p]))
      const shape = toTaskShape(task, positionsById)
      return NextResponse.json({ ...shape, category: data.category ?? null }, { status: 201 })
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[tasks] POST error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 10, window: "1 m" }
)
```

Note on the dropped features versus today's route, both deliberate:
- **Task visibility settings** (`venueSettings.taskVisibility` filtering staff to "assigned"/"assigned_unassigned"/"all") is dropped. xvm-api's `list_tasks` already does venue-level visibility filtering server-side via `TaskVisibility` on the venue itself (`_task_context` in `tasks.py`) - this is the same visibility concept, now enforced upstream instead of duplicated in the dashboard route. Don't re-implement it here.
- **Discord webhook on task creation** is intentionally deferred to Task C5, not included in this task's route rewrite - keeps this diff focused on the read/write cutover itself.
- **`assignee` (direct person assignment)** is hardcoded to `null` - confirmed via grep that no current UI form ever sets `assignedTo`, only `assignedRoleId` (Position-based). Wiring direct-person assignment isn't a regression since it never worked from the UI; it's out of scope for this cutover.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 3: Manual dry run against local dev**

Start `pnpm dev`, log in as the connected test venue's owner, hit `GET /api/venues/{venueId}/tasks` and `POST` a new task via the existing UI form. Confirm the response shape matches what `app/dashboard/[slug]/tasks/page.tsx` expects (this will still error client-side until Task C6 updates the frontend types - that's expected at this point, just confirm the network response itself looks right in devtools).

- [ ] **Step 4: Commit**

```bash
git add app/api/venues/\[venueId\]/tasks/route.ts
git commit -m "feat: cut tasks list/create routes over to xvm-api"
```

---

### Task C4: Rewrite `tasks/[taskId]/route.ts` (get, update, delete→cancel)

**Files:**
- Modify: `app/api/venues/[venueId]/tasks/[taskId]/route.ts`

Implements the three already-made decisions:
- **Manager-only edits/reassignment** ([[project_xvm_api_tasks_cutover_scoping]] gap #4): no dashboard-side role check on `PUT` - delegate entirely to xvm-api's `PATCH`/`assign` Manager-tier gate, same as Roles.
- **Delete→cancel** ([[project_xvm_api_tasks_delete_decision]]): `DELETE` calls xvm-api's `/cancel`, not a hard delete.
- **Self-assign-on-start**: status transitions move through `/start`, `/complete`, `/cancel` instead of a flat `status` field - `PUT` becomes descriptive-fields-only (title/description/priority/category/dueDate/assignedRoleId) plus one new `POST .../transition` action endpoint for status changes (added here rather than three separate dashboard routes, since the frontend only ever needs to fire one of the three at a time and a single endpoint keeps the route file count down - see Task C6 for why one endpoint beats three from the frontend's perspective).

- [ ] **Step 1: Write the new route**

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import {
  listTasks,
  updateTask,
  assignTask,
  startTask,
  completeTask,
  cancelTask,
  listPositions,
  listTaskCategories,
  XvmApiError,
  xvmErrorMessage,
  type TaskRow,
  type PositionRow,
} from "@/lib/api/xvm-api"
import { priorityToInt, intToPriority, resolveCategoryId } from "@/lib/api/task-convert"
import { validators } from "@/lib/validation"

const updateTaskSchema = z.object({
  title: validators.taskTitle.optional(),
  description: validators.taskDescription,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  category: z.string().nullable().optional(),
  assignedRoleId: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
})

// Both null unassigns, matching xvm-api's TaskAssign contract.
const transitionSchema = z.object({
  action: z.enum(["start", "complete", "cancel"]),
  reason: z.string().optional(), // only meaningful for "cancel"
})

function deriveStatus(task: TaskRow): "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" {
  if (task.cancelled_at) return "CANCELLED"
  if (task.completed_at) return "COMPLETED"
  if (task.started_at) return "IN_PROGRESS"
  return "PENDING"
}

function toTaskShape(task: TaskRow, positionsById: Map<number, PositionRow>, categoryName: string | null) {
  const position = task.assigned_position_id ? positionsById.get(task.assigned_position_id) : null
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: deriveStatus(task),
    priority: intToPriority(task.priority),
    category: categoryName,
    dueDate: task.due_at,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    assignee: null,
    assignedRole: position ? { id: position.id, name: position.name, color: position.color } : null,
  }
}

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

async function shapeAfterFetch(token: string, xvmApiVenueId: string, task: TaskRow) {
  const [positions, categories] = await Promise.all([
    listPositions(token, xvmApiVenueId),
    listTaskCategories(token, xvmApiVenueId),
  ])
  const positionsById = new Map(positions.map((p) => [p.id, p]))
  const categoryName = task.category_id !== null ? categories.find((c) => c.id === task.category_id)?.name ?? null : null
  return toTaskShape(task, positionsById, categoryName)
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, taskId } = await context.params
    const id = Number(taskId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      // No get-one endpoint is needed here - list+find matches the Roles
      // cutover's precedent (roles/[roleId]/route.ts does the same, since
      // xvm-api's Positions module also lacks a get-one; Tasks does have
      // GET /{task_id} on xvm-api, but reusing list+find keeps this route
      // consistent with the sibling cutover rather than mixing both styles).
      const tasks = await listTasks(token, gate.xvmApiVenueId!, { includeCompleted: true, includeCancelled: true })
      const task = tasks.find((t) => t.id === id)
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 })
      }
      return NextResponse.json(await shapeAfterFetch(token, gate.xvmApiVenueId!, task))
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[tasks] GET one error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, taskId } = await context.params
    const id = Number(taskId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updateTaskSchema>
    try {
      data = updateTaskSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      let categoryId: number | null | undefined
      if (data.category !== undefined) {
        categoryId = data.category ? await resolveCategoryId(token, gate.xvmApiVenueId!, data.category) : null
      }

      // xvm-api splits descriptive edits (PATCH) from reassignment (/assign) -
      // sequence both if assignedRoleId was included, since the dashboard
      // still exposes them as one form submission (see Task C6).
      let task = await updateTask(token, gate.xvmApiVenueId!, id, {
        title: data.title,
        description: data.description,
        priority: data.priority ? priorityToInt(data.priority) : undefined,
        due_at: data.dueDate,
        category_id: categoryId,
      })

      if (data.assignedRoleId !== undefined) {
        task = await assignTask(token, gate.xvmApiVenueId!, id, {
          position_id: data.assignedRoleId,
          membership_id: null,
        })
      }

      return NextResponse.json(await shapeAfterFetch(token, gate.xvmApiVenueId!, task))
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[tasks] PUT error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 20, window: "1 m" }
)

// Replaces the old flat status-field write. One endpoint for all three
// transitions rather than three route files, since the frontend only ever
// fires one at a time (see Task C6) - matches this route file's existing
// one-file-per-resource shape better than adding start/complete/cancel as
// sibling [taskId] subpaths would.
export const POST = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, taskId } = await context.params
    const id = Number(taskId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof transitionSchema>
    try {
      data = transitionSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const task =
        data.action === "start"
          ? await startTask(token, gate.xvmApiVenueId!, id)
          : data.action === "complete"
            ? await completeTask(token, gate.xvmApiVenueId!, id)
            : await cancelTask(token, gate.xvmApiVenueId!, id, data.reason ?? null)

      return NextResponse.json(await shapeAfterFetch(token, gate.xvmApiVenueId!, task))
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[tasks] transition error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 20, window: "1 m" }
)

// Delete->cancel decision (project_xvm_api_tasks_delete_decision): xvm-api has
// no hard delete, only an audited soft-cancel. No reason field is collected
// from this call site today - the dashboard has no UI for entering one yet
// (out of scope here, a future "why was this cancelled" UI is a follow-up).
export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; taskId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, taskId } = await context.params
    const id = Number(taskId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await cancelTask(token, gate.xvmApiVenueId!, id, null)
      return NextResponse.json({ success: true })
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[tasks] DELETE error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 5, window: "1 m" }
)
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add app/api/venues/\[venueId\]/tasks/\[taskId\]/route.ts
git commit -m "feat: cut task get/update/transition/cancel routes over to xvm-api"
```

---

### Task C5: Discord webhook side effects on the new handlers

**Files:**
- Modify: `app/api/venues/[venueId]/tasks/route.ts` (POST)
- Modify: `app/api/venues/[venueId]/tasks/[taskId]/route.ts` (POST transition, `complete` case)

Restores the two webhook calls dropped in Tasks C3/C4, fired after the xvm-api call succeeds instead of after a Prisma write - same trigger points as today, just moved.

- [ ] **Step 1: Add the created-task webhook to `tasks/route.ts`'s POST handler**

Add the imports:

```typescript
import {
  sendDiscordWebhook,
  formatTaskCreatedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"
```

After the successful `createTask` call, before returning the response, insert (adapting field names - `formatTaskCreatedEmbed` expects `priority` as the string label and `assignee: {name}|null`, which is always `null` here per Task C3's note):

```typescript
const venue = await prisma.venue.findUnique({
  where: { id: venueId },
  select: { discordWebhookUrl: true, settings: true },
})
if (venue) {
  const venueSettings = venue.settings as Record<string, unknown> | null
  const webhookConfig: VenueWebhookConfig = {
    discordWebhooks: venueSettings?.discordWebhooks as VenueWebhookConfig["discordWebhooks"],
    webhooks: venueSettings?.webhooks as VenueWebhookConfig["webhooks"],
    discordWebhookUrl: venue.discordWebhookUrl,
  }
  const webhookUrl = getWebhookUrlForType(webhookConfig, "taskCreated")
  if (webhookUrl) {
    const embed = formatTaskCreatedEmbed({
      title: task.title,
      description: task.description,
      priority: data.priority,
      dueDate: task.due_at ? new Date(task.due_at) : null,
      assignee: null,
    })
    sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch((error) =>
      console.error("[Task Created] webhook error:", error)
    )
  }
}
```

- [ ] **Step 2: Add the completed-task webhook to the transition POST handler**

Add the same imports (`formatTaskCompletedEmbed` instead of `formatTaskCreatedEmbed`) to `tasks/[taskId]/route.ts`. In the `POST` handler, after the transition succeeds and only when `data.action === "complete"`:

```typescript
if (data.action === "complete") {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { discordWebhookUrl: true, settings: true },
  })
  if (venue) {
    const venueSettings = venue.settings as Record<string, unknown> | null
    const webhookConfig: VenueWebhookConfig = {
      discordWebhooks: venueSettings?.discordWebhooks as VenueWebhookConfig["discordWebhooks"],
      webhooks: venueSettings?.webhooks as VenueWebhookConfig["webhooks"],
      discordWebhookUrl: venue.discordWebhookUrl,
    }
    const webhookUrl = getWebhookUrlForType(webhookConfig, "taskCompleted")
    if (webhookUrl) {
      const embed = formatTaskCompletedEmbed({
        title: task.title,
        priority: intToPriority(task.priority),
        completer: null, // completed_by_person_id has no display-name lookup wired here - out of scope, see plan notes
      })
      sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch((error) =>
        console.error("[Task Completed] webhook error:", error)
      )
    }
  }
}
```

Note: `completer` is hardcoded `null` because resolving `completed_by_person_id` to a display name would require a `/me`-style person lookup this plan doesn't otherwise need - the webhook will just omit the "Completed By" field (see `formatTaskCompletedEmbed`'s `if (task.completer)` guard). Flag this as a minor known gap, not worth blocking on for this cutover.

Known pre-existing issue this task's routes inherit, not fixed here: xvm-dashboard issue #29 (a network blip on `getValidXvmApiToken`/`XvmApiError` handling incorrectly invalidates the stored credential, same as every other cutover route). Out of scope for this plan.

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck
git add app/api/venues/\[venueId\]/tasks/route.ts app/api/venues/\[venueId\]/tasks/\[taskId\]/route.ts
git commit -m "feat: restore Discord webhook side effects on xvm-api-backed task routes"
```

---

### Task C6: Frontend call-site updates

**Files:**
- Modify: `app/dashboard/[slug]/tasks/page.tsx`

Three real changes required, found by grepping this file's fetch calls against the new API:

1. **`Task.id` type**: `id: string` → `id: number` (task ids are now xvm-api ints, same type change Roles needed for `Role.id`).
2. **Status-change call site** (currently `PUT .../tasks/${taskId}` with `{status: newStatus}`, around line 205-208): xvm-api has no arbitrary status field - only forward-only `start`/`complete`/`cancel` actions, and completed/cancelled tasks can never be reopened (no un-complete, no un-cancel - confirmed via `_require_open`'s guard and the DB's `not_both_completed_and_cancelled` constraint). Replace the flat status PUT with a call to the new transition endpoint, and remove any UI affordance that let a user revert a COMPLETED task back to an earlier status (if one exists in the status-change dropdown/buttons around this call site - check before deleting, don't remove something else by accident).

```typescript
// Before (around line 201-215):
const venueResponse = await fetch(`/api/venues?slug=${slug}`)
// ...
const response = await fetch(`/api/venues/${venue.id}/tasks/${taskId}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: newStatus }),
})

// After:
const venueResponse = await fetch(`/api/venues?slug=${slug}`)
// ...
const action = newStatus === "IN_PROGRESS" ? "start" : newStatus === "COMPLETED" ? "complete" : "cancel"
const response = await fetch(`/api/venues/${venue.id}/tasks/${taskId}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action }),
})
```

If `newStatus` can be `"PENDING"` at this call site today (reopening a task to the pool), that transition has no xvm-api equivalent - surface an error to the user instead of silently no-op'ing:

```typescript
if (newStatus === "PENDING") {
  setError("Reopening a completed or cancelled task isn't supported - create a new task instead.")
  return
}
```

3. **Edit-task call site** (around line 285-299, the full-edit `PUT`): no shape change needed - the route already accepts `{title, description, priority, category, assignedRoleId, dueDate}` and internally sequences the `PATCH` + `/assign` calls (Task C4). Only the response's field types change (`id: number`, `assignedRole.id: number` if not already updated by PR #28's own frontend follow-up - check `Role` interface at the top of this file and update if it still says `id: string`).

- [ ] **Step 1: Make the three changes above**

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 3: Live-test against local dev**

Per this repo's planning-bar convention (`CLAUDE.md`): start `pnpm dev`, log in as the connected venue's owner, and click through the full loop - create a task with a role assignment and category, start it, complete it, cancel a different task, confirm the cancelled one drops out of the default list view and reappears with `?includeCancelled=true`. Confirm the Discord webhook fires (check the configured channel, or `sendDiscordWebhook`'s console error path if no webhook URL is configured in local dev).

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/\[slug\]/tasks/page.tsx
git commit -m "feat: update tasks page for xvm-api response shape and status transitions"
```

---

## Self-Review

**Spec coverage:**
- Group A: `inviteMember`/`acceptInvite` (A1) ✓. Auto-accept-on-login (A3) ✓, with the missing-endpoint gap surfaced as A2 rather than glossed over.
- Group B: backfill script matching `migrate-positions.ts`'s conventions ✓, idempotent (409-catch on already-a-member) ✓, handles all three membership states (self-acceptable, pending-until-login, no-Discord-ID) ✓.
- Group C: routes cut over (C3/C4) ✓, delete→cancel ✓, self-assign-on-start via transition endpoint ✓, Manager-only edit/reassign delegated to xvm-api ✓, category/priority mapping (C1) ✓, webhooks restored (C5) ✓, frontend call sites (C6) ✓. Frogge migration and issue #29 explicitly called out as out of scope, not silently dropped.

**Placeholder scan:** no "TBD"/"handle appropriately"/"similar to above" found - every step has complete, real code. One genuine open dependency is flagged as such (A2/A3's cross-repo endpoint) rather than faked.

**Type consistency:** `TaskRow`, `TaskCreateData`, `TaskUpdateData`, `TaskAssignData`, `PositionRow`, `CategoryRow` are defined once in `xvm-api.ts` (C1/C2) and reused identically in C3/C4's route files. `deriveStatus`/`toTaskShape` are duplicated between `route.ts` and `[taskId]/route.ts` rather than shared - this mirrors the existing Roles cutover's own duplication of `toRoleShape` between its two route files, so it's consistent with established precedent, not a new inconsistency. `priorityToInt`/`intToPriority` signatures match between C1's definition and every call site in C3/C4/C5.

**Found during review, fixed inline:** Task B1's first draft imported `getMe` unnecessarily (copied from `migrate-positions.ts` without checking whether this script needs a person-id lookup - it doesn't) - removed and noted in the step. Task A3's first draft assumed `acceptInvite`-by-token would work for auto-accept before checking that `InviteRow` (unlike `InviteIssued`) never exposes a token - caught mid-task and resolved by adding `acceptInviteById` and folding a second ask into the same A2 cross-repo issue rather than filing two.
