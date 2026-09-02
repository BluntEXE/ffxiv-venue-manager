# Staff/Membership xvm-api Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the Staff domain's roster, invite-creation, nickname/tier/multi-role editing, and staff removal over from Prisma to xvm-api, following the exact same playbook proven on Rooms/Hours/Roles/Tasks/Shifts.

**Architecture:** Rewrite the three API routes (`staff/route.ts`, `staff/invite/route.ts`, `staff/[membershipId]/route.ts`) against xvm-api's `routers/memberships.py`, then update the two consuming components (`StaffTable`, `PendingInvites`) and the three pages that render them. **The invite-accept flow stays parked** — `/invite/[token]/page.tsx` and its two API routes (`api/invites/[token]/route.ts`, `api/invites/[token]/accept/route.ts`) are untouched by this plan, matching the earlier decision to hold that piece until xvm-api#54's character/identity work lands. Invite *creation* and *rescinding* move; invite *acceptance* does not.

**Tech Stack:** Next.js 15 App Router, xvm-api FastAPI backend (`routers/memberships.py`), existing `lib/api/xvm-api.ts` client (no membership-write functions exist yet — this plan adds them), Zod.

---

## Context for the engineer

**Read [[docs/superpowers/plans/2026-09-01-shifts-page-xvm-api-cutover.md]] first if you haven't executed it** — this plan assumes the same id-type (Prisma `string` cuid → xvm-api `number`), tier-vocabulary (`OWNER/MANAGER/STAFF` → `owner/manager/staff`), and character-name-degradation patterns it already established and doesn't re-explain them in full.

**Three real field-shape gaps found scoping this — none of them block the rest, but don't try to force-fit them:**

1. **`tipPooled`** (self-service tip-pooling preference, editable on the member-detail page) has no equivalent anywhere in xvm-api's `MembershipModel` — same root cause as the already-tracked Financial gap (no payroll/pot router exists yet). Drop this control from the member-detail page rather than silently no-op it; leave a one-line note where it was removed.

2. **`temporaryRole`/`temporaryRoleExpiresAt`/`permanentRole`** ("deputise someone for a night") already has zero UI call sites in the current codebase (confirmed by grep — it was deliberately dropped when this cutover was first scoped, before xvm-api's matching model was found). xvm-api's `MembershipTierGrantModel` is the right concept but has no router yet — tracked as [xvm-api#55](https://github.com/xiv-venue-manager/xvm-api/issues/55). Nothing to do here except leave the dead Zod fields out of the new route's schema.

3. **Pending-invite name/email editing** (`PendingInvites`' "Edit Invite Details" dialog) has no xvm-api equivalent — xvm-api's `VenueInviteModel` has no email field at all (not a Frogge/xvm-api concept), and there's no endpoint to rename a not-yet-accepted invite's person after creation. **Drop the edit dialog entirely** from `PendingInvites` — don't degrade it to name-only, since renaming a shell person post-invite isn't exposed either. Keep the invite's own `display_name` (set once, at creation) as the only identifying label.

**Model shape mismatch, worth understanding before Task 3:** Prisma's `Membership` is one row that's *either* an active member *or* a pending invite (`status: "pending"`), so the old `staff/[membershipId]/route.ts` PUT doubles as both "edit a staff member" and "edit a pending invite's name/email." xvm-api splits these into two separate tables (`MembershipModel` vs `VenueInviteModel`) with separate endpoints. This plan's rewritten `staff/[membershipId]/route.ts` only ever addresses real memberships (invite editing is dropped per gap #3 above; invite *deletion* goes through the separate `rescind_invite` endpoint, wired in Task 2).

**Multi-role assignment — resolved and shipped, don't re-derive.** The member-detail page's role editor is a real set-editor (`selectedAdditionalRoleIds` checkbox array, one `handleSave` submits the whole set on a Save button click — confirmed by reading the actual page, not assumed). Allegro shipped [xvm-api#56](https://github.com/xiv-venue-manager/xvm-api/pull/56) (merged 2026-09-01): `PUT /venues/{id}/memberships/{membership_id}/positions` takes `{position_ids: [...]}`, reconciles under the membership's row lock in one transaction (atomic, idempotent, all-or-nothing on a bad set — verified server-side with a concurrent-save race test). `MembershipRow` now also carries `position_ids` directly on the roster read (one grouped query, no separate `GET .../positions` + invert-by-`member_ids` dance needed). **Task 4 and Task 9 use this endpoint directly — no diff/fallback path needed, it's live.**

Add `position_ids: number[]` to the existing `MembershipRow` interface in `apps/web/lib/api/xvm-api.ts` as part of Task 1 (currently missing it — the interface predates this endpoint).

**Hard delete → terminate.** xvm-api has no destructive delete for memberships, only audited `terminate`/`rehire` (same shape as the Tasks delete→cancel precedent, and the same shape Shifts already applied to shift deletion). The old DELETE route's Prisma-only side effect of revoking venue-scoped `ApiKey` rows **stays on Prisma** — dashboard-native infrastructure, not Membership domain data, same category as `requireXvmVenueId`'s one sanctioned Prisma call.

**Task-unassignment on termination is a confirmed real gap, not just unchecked.** Allegro confirmed: nulling a task's assignee does unassign it (existing endpoint), but there's no cascade — terminating a membership does not automatically clear that person's pending tasks. Task 4's terminate route needs to do this itself: list the departing member's pending tasks (via xvm-api's Tasks endpoints, already cut over — not Prisma) and null out each one's assignee before/after calling `terminateMembership`. Not a blocker, just extra steps in the same route, not a silent drop.

**Last-owner protection is confirmed guarded server-side — no client-side check needed.** Allegro confirmed both `terminate` and `set_tier` already guard against removing a venue's only owner. Drop the old Prisma route's explicit `owners.length <= 1` transaction check entirely rather than porting it — xvm-api owns this now, forward whatever error it returns.

**`external_id`/character-name display**: same situation as Shifts — ships with xvm-api's `display_name` (Discord name) only, not FFXIV character names, until xvm-api#54 lands. Structure name resolution as one swappable function, same as `shift-format.ts`'s `staffNameOf`.

## File Structure

- Modify: `apps/web/lib/api/xvm-api.ts` — add membership write functions (`setNickname`, `setTier`, `terminateMembership`, `rehireMembership`, `createInvite`, `listInvites`, `rescindInvite`, plus the existing `listMemberships` stays) (Task 1)
- Modify: `apps/web/app/api/venues/[venueId]/staff/route.ts` — GET roster (Task 2)
- Modify: `apps/web/app/api/venues/[venueId]/staff/invite/route.ts` — POST create invite (Task 2)
- Modify: `apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts` — PUT (nickname/tier/roles), DELETE→terminate (Task 4)
- Modify: `apps/web/components/staff-table.tsx` — id types, tier vocab (Task 5)
- Modify: `apps/web/components/pending-invites.tsx` — id types, drop the edit dialog, wire delete to `rescind_invite` (Task 6)
- Modify: `apps/web/app/dashboard/[slug]/staff/page.tsx` — swap Prisma roster/invite queries for xvm-api (Task 7)
- Modify: `apps/web/app/dashboard/[slug]/staff/invite/page.tsx` — read fresh at execution time; apply the same id-type/tier-vocab swap pattern established in Tasks 2-6, submitting to the rewritten invite route (Task 8)
- Modify: `apps/web/app/dashboard/[slug]/staff/[membershipId]/page.tsx` — read fresh at execution time; apply the same pattern, **and remove the tipPooled control** per gap #1 above (Task 9)

---

### Task 1: xvm-api client — membership write functions

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts`

- [ ] **Step 1: Add the functions after the existing `listMemberships`**

```typescript
export interface InviteRow {
  id: number
  person: MembershipPerson
  tier: string
  expires_at: string
  invited_by_person_id: number | null
}

export interface InviteIssued extends InviteRow {
  token: string
}

export async function setNickname(
  personToken: string,
  venueId: string,
  membershipId: number,
  nickname: string | null
): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(
    `/venues/${venueId}/memberships/${membershipId}/nickname`,
    { method: "PATCH", body: JSON.stringify({ nickname }) },
    personToken
  )
}

export async function setTier(
  personToken: string,
  venueId: string,
  membershipId: number,
  tier: "owner" | "manager" | "staff"
): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(
    `/venues/${venueId}/memberships/${membershipId}/tier`,
    { method: "PUT", body: JSON.stringify({ tier }) },
    personToken
  )
}

export async function terminateMembership(
  personToken: string,
  venueId: string,
  membershipId: number,
  reason?: string | null
): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(
    `/venues/${venueId}/memberships/${membershipId}/terminate`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
    personToken
  )
}

export async function rehireMembership(
  personToken: string,
  venueId: string,
  membershipId: number
): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(
    `/venues/${venueId}/memberships/${membershipId}/rehire`,
    { method: "POST" },
    personToken
  )
}

export async function createInvite(
  personToken: string,
  venueId: string,
  data: { display_name: string; tier: "owner" | "manager" | "staff"; external_id?: string | null }
): Promise<InviteIssued> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<InviteIssued>(
    `/venues/${venueId}/invites`,
    { method: "POST", body: JSON.stringify({ provider: "discord", ...data }) },
    personToken
  )
}

export async function listInvites(personToken: string, venueId: string): Promise<InviteRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<InviteRow[]>(`/venues/${venueId}/invites`, {}, personToken)
}

export async function rescindInvite(personToken: string, venueId: string, inviteId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/invites/${inviteId}`, { method: "DELETE" }, personToken)
}

// setMembershipPositions wraps the atomic PUT (xvm-api PR #56, merged 2026-09-01):
// venues/{id}/memberships/{id}/positions, {position_ids: [...]} -> MembershipRow.
// Reconciles server-side under the membership's row lock (add+remove in one
// transaction, idempotent re-save, all-or-nothing on a bad set). Use this for
// Task 4/9. The two per-pair functions below are for single-toggle call sites
// only (they still exist on xvm-api and are unaffected).
export async function setMembershipPositions(
  personToken: string,
  venueId: string,
  membershipId: number,
  positionIds: number[]
): Promise<MembershipRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow>(
    `/venues/${venueId}/memberships/${membershipId}/positions`,
    { method: "PUT", body: JSON.stringify({ position_ids: positionIds }) },
    personToken
  )
}

export async function addPositionMember(
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

export async function removePositionMemberFromMembership(
  personToken: string,
  venueId: string,
  positionId: number,
  membershipId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/positions/${positionId}/members/${membershipId}`,
    { method: "DELETE" },
    personToken
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && pnpm typecheck` — expect clean (nothing consumes these yet).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts
git commit -m "feat(staff): add xvm-api membership/invite write functions"
```

---

### Task 2: Rewrite `staff/route.ts` (roster) and `staff/invite/route.ts` (create invite)

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/staff/route.ts`
- Modify: `apps/web/app/api/venues/[venueId]/staff/invite/route.ts`

- [ ] **Step 1: Read both files fresh** (their exact current content — the GET/POST split, the existing 410 "deprecated" stub on `staff/route.ts`'s POST, and `staff/invite/route.ts`'s Zod schema) and confirm they still match what's described in this plan's Context section before touching them — routes can drift between scoping and execution.

- [ ] **Step 2: Rewrite `staff/route.ts`'s GET**

Follow the exact `requireXvmVenueId` + `getValidXvmApiToken` + `xvmApiErrorResponse` gate pattern from `shifts/route.ts` (already shipped, use it as the template file to copy from — including the slug-or-id venue lookup, since `PendingInvites`/`StaffTable` call this route with `member.venueId`, confirm at execution time whether that's ever a slug like Shifts' callers were). Call `listMemberships` and map each `MembershipRow` to the shape `StaffTable` expects post-Task-5 (`id: number`, `role` from `tier` uppercased, `nickname`, plus `is_employed`-derived status). Leave the POST 410 stub as-is — it was already deprecated pre-cutover, not part of this task.

- [ ] **Step 3: Rewrite `staff/invite/route.ts`'s POST**

Same gate pattern. Zod schema drops `roleId` (custom Position isn't set at invite time in xvm-api's model — position assignment happens after acceptance via `setMembershipPositions`, Task 1, not at invite creation) and `invitedEmail` (no xvm-api equivalent, matches Context gap #3). Keep `invitedName` (maps directly to `display_name`) and `role` (maps to `tier`, lowercased). Call `createInvite`, return `{ success: true, invite: { id, inviteUrl: `${baseUrl}/invite/${token}`, inviteToken: token, expiresAt, role, invitedName } }` — same response shape the current route already returns, so `staff/invite/page.tsx` (Task 8) needs no changes to how it *reads* the response, only to what it *sends*.

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/staff/route.ts" "apps/web/app/api/venues/[venueId]/staff/invite/route.ts"
git commit -m "feat(staff): cut roster read and invite creation over to xvm-api"
```

---

### Task 3: Wire task-unassignment into the terminate route (confirmed gap, not just unchecked)

**Files:** none yet — this task hands off directly into Task 4's DELETE→terminate rewrite

Allegro confirmed: termination does **not** cascade-unassign a person's pending tasks on the xvm-api side. This is a real, permanent gap in the API, not a check that turns out to be a non-issue — the dashboard has to do it itself.

- [ ] **Step 1:** Check `apps/web/lib/api/xvm-api.ts` for the existing Tasks-cutover assign function (confirm its exact name/signature — Tasks was cut over earlier this session) and confirm whether calling it with a null/empty assignee un-assigns a task, or whether that's not supported either.

- [ ] **Step 2:** In Task 4's terminate handler, before calling `terminateMembership`, list the target membership's pending tasks and null out the assignee on each one via the existing per-task function from Step 1 — this is the dashboard-side replacement for the cascade xvm-api doesn't provide. If per-task null-out genuinely isn't supported, that's the fallback case: flag it as a known limitation in the terminate route's response or the PR description, don't swallow it silently.

---

### Task 4: Rewrite `staff/[membershipId]/route.ts`

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts`

- [ ] **Step 1: Read the current file fresh** (already read once during scoping — confirm no drift).

- [ ] **Step 2: Rewrite PUT** to branch on what changed in the request body, calling the matching xvm-api function per Task 1: `nickname` → `setNickname`, `role` → `setTier`, `additionalRoleIds` → `setMembershipPositions` with the full target position-id array (atomic, no diff needed). Drop `roleId` (custom "primary" role — xvm-api's Position model doesn't have a primary/secondary distinction the way Prisma's `customRole` vs `additionalRoles` did; treat all assigned positions as equivalent, matching xvm-api's actual model rather than forcing Prisma's distinction onto it — flag this UI/UX simplification explicitly if `StaffTable`'s "primary vs additional role" chip styling depended on the distinction). Drop `status`, `invitedName`, `invitedEmail`, `temporaryRole`, `temporaryRoleExpiresAt`, `permanentRole`, `tipPooled` (gaps #1-3, dead invite-only fields, and the primary-role distinction respectively).

- [ ] **Step 3: Rewrite DELETE as terminate**, keeping:
  - The manager-can't-touch-peers/owners tier check (client-side, matching `deps.require_authority_over`'s server-side equivalent — keep the client check only as defense-in-depth, xvm-api already enforces it).
  - Last-owner protection — confirmed guarded server-side by Allegro, no client-side check needed; drop the old Prisma-era check entirely rather than porting it.
  - `ApiKey` revocation (stays Prisma — dashboard infrastructure, not Membership domain data).
  - Task-unassignment, per Task 3.
  - Call `terminateMembership` instead of `prisma.membership.delete`.

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts"
git commit -m "feat(staff): cut per-membership edit/terminate over to xvm-api"
```

---

### Task 5: Update `staff-table.tsx`

**Files:**
- Modify: `apps/web/components/staff-table.tsx`

- [ ] **Step 1:** Change `StaffMember.id: string` → `number`, `venueId` stays `string` (venue routing hasn't moved). Change `memberDisplayName` to use the same swappable-function pattern as `shift-format.ts`'s `staffNameOf` — resolves to `user.name`/`displayName` (Discord data) only, character name dropped per the established gap.

- [ ] **Step 2:** `customRole`/`additionalRoles` collapse into one flat `position_ids` list — xvm-api has no primary/secondary distinction. Simplify the role-pill rendering to one style for all assigned positions instead of the current customRole-vs-additionalRoles two-tier chip display, and note the visual simplification in the PR description rather than silently changing it.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/web && pnpm typecheck` — expect remaining errors only in the two page files (Tasks 7-9), not this component.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/staff-table.tsx
git commit -m "refactor(staff): update StaffTable for xvm-api-shaped members"
```

---

### Task 6: Update `pending-invites.tsx`

**Files:**
- Modify: `apps/web/components/pending-invites.tsx`

- [ ] **Step 1:** Change `PendingInvite.id: string` → `number`. Drop `invitedEmail` from the interface entirely (gap #3). Remove the "Edit Invite Details" dialog and its trigger button (the `Pencil` icon button, `openEditDialog`/`updateInvite`/`editingInvite`/`isEditDialogOpen`/`editForm`/`isUpdating`/`editError` state and the whole `<Dialog>` block) — no xvm-api endpoint backs it per gap #3.

- [ ] **Step 2:** Change `deleteInvite` to call the new rescind route (Task 2 doesn't add a standalone rescind route — decide here whether `DELETE /api/venues/[venueId]/staff/invite/[inviteId]` is a new route file this task adds, or whether `staff/[membershipId]/route.ts`'s DELETE should branch on invite-vs-membership by id — given xvm-api keeps these as two separate id spaces (an invite id and a membership id are both plain integers from two different tables, not distinguishable by shape alone), **the cleaner fix is a new route** `apps/web/app/api/venues/[venueId]/staff/invites/[inviteId]/route.ts` with just a DELETE calling `rescindInvite`. Add it as part of this task, update `deleteInvite`'s fetch URL to match.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/pending-invites.tsx "apps/web/app/api/venues/[venueId]/staff/invites/[inviteId]/route.ts"
git commit -m "refactor(staff): update PendingInvites for xvm-api, drop invite name/email editing"
```

---

### Task 7: Rewrite `dashboard/[slug]/staff/page.tsx`

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/staff/page.tsx`

- [ ] **Step 1:** Read the file fresh (already read once during scoping). Swap the `prisma.membership.findMany` roster query for `listMemberships`, split into active-vs-pending using xvm-api's actual invite/membership split (pending invites now come from `listInvites`, not filtered out of the same roster query — a real structural change from Prisma's unified model, not just a field rename).

- [ ] **Step 2:** Leave `activeShifts`/`weeklyShifts` (the "On shift now"/"Hours this week" KPIs) and `weeklyTips` (Financial, no xvm-api router) as Prisma queries for now — **do not expand this task's scope to also migrate those KPIs to `listShifts`**, even though Shifts already supports it. That's a real, separate, worthwhile follow-up (flag it in the PR description) but bundling it here mixes two unrelated cutovers in one diff.

- [ ] **Step 3:** Update the `StaffTable`/`PendingInvites` props to match their Task 5/6 signatures.

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/web && pnpm typecheck` — expect remaining errors only in Tasks 8-9's two page files.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/staff/page.tsx"
git commit -m "feat(staff): cut the staff roster page's data fetch over to xvm-api"
```

---

### Task 8: Update `dashboard/[slug]/staff/invite/page.tsx`

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/staff/invite/page.tsx`

- [ ] **Step 1:** Read the file fresh — not read in full during this plan's scoping pass, so there's no pre-verified diff to follow here. Apply the established pattern: whatever role/id pickers it has get the same numeric-id/lowercase-tier treatment `create-shift-dialog.tsx` got in the Shifts plan (Task 8 there). Confirm its submit target still matches Task 2's rewritten `staff/invite/route.ts` response shape (should need no changes there, per Task 2 Step 3's note).

- [ ] **Step 2: Verify it compiles and lint clean**

Run: `cd apps/web && pnpm typecheck && pnpm lint`

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/staff/invite/page.tsx"
git commit -m "refactor(staff): update the invite page for xvm-api ids/tiers"
```

---

### Task 9: Update `dashboard/[slug]/staff/[membershipId]/page.tsx`

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/staff/[membershipId]/page.tsx`

- [ ] **Step 1:** Read the file fresh — not read in full during scoping. Apply the established id/tier pattern. **Remove the `tipPooled` toggle and its surrounding UI** per gap #1 (confirmed present at the file's current line ~467 area as of scoping, but re-locate at execution time since line numbers will have drifted from Tasks 1-8's edits to other files). Remove any `temporaryRole`/`permanentRole` UI if present (confirmed absent as of scoping, but double check — the field only showed up in the API route's Zod schema, not grep-matched in this specific page file, but verify directly rather than trusting the scoping-pass grep).

- [ ] **Step 2:** Wire the checkbox+Save role editor's `handleSave` to call `setMembershipPositions` with the full checked-id array — matches Task 4's PUT rewrite, no diff needed.

- [ ] **Step 3: Verify it compiles and lint clean**

Run: `cd apps/web && pnpm typecheck && pnpm lint`

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/staff/[membershipId]/page.tsx"
git commit -m "refactor(staff): update the member-detail page for xvm-api, drop tipPooled"
```

---

### Task 10: Live verification

**Files:** none (manual/browser + curl verification, same approach proven on Shifts)

- [ ] **Step 1:** Start the dev stack per `docs/LOCAL_DEV.md`, against a connected test venue.

- [ ] **Step 2:** Walk the roster: view staff list, edit a nickname, change a tier, assign/remove a custom role, terminate a non-owner member, rehire them.

- [ ] **Step 3:** Walk invites: create an invite, confirm the link/token render correctly in `PendingInvites`, rescind it.

- [ ] **Step 4:** Attempt to remove the venue's only owner and confirm it's still blocked — Allegro confirmed this is server-side, so this step is a sanity check on that confirmation, not open investigation.

- [ ] **Step 5:** If claim/approve-style dual-identity testing is needed for the manager-can't-touch-peers tier check, reuse the Shifts plan's throwaway-credential approach (`issue_credential --kind personal_access`) rather than re-inventing it.

---

## Explicitly out of scope for this plan

- Invite *acceptance* (`/invite/[token]` page and its two API routes) — stays Prisma, parked pending xvm-api#54-adjacent identity work.
- `tipPooled` — blocked on the Financial/payroll router not existing yet.
- Temporary role elevation — blocked on xvm-api#55.
- Editing a pending invite's name/email post-creation — no xvm-api equivalent, dropped rather than degraded.
- Migrating the Staff page's "on shift now"/"hours this week" KPIs to `listShifts` — real, worthwhile, but a separate follow-up, not bundled here.
- Character-name display (FFXIV name instead of Discord name) — blocked on xvm-api#54.
