# Codebase Sweep — Stage 2 Increment 1: Dead-Code Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete confirmed-dead files, exports, and dependencies identified by the Stage 1 findings report, verified against the local dev stack (not prod).

**Architecture:** Straight deletions, grouped by workspace/file so each task is independently verifiable. A recurring pattern found during verification: several exports flagged "unused" by knip are actually still used _within their own file_ (e.g. a type used by a sibling type in the same file) — knip only sees cross-file usage. For those, the fix is removing the `export` keyword, not deleting the declaration. Genuinely zero-usage (internal and external) items get fully deleted. Every deletion in this plan was independently re-verified via grep against the current source immediately before this plan was written — see the inline verification note in each step.

**Tech Stack:** TypeScript, Next.js (apps/web), Node/pg (apps/discord-bot), Vite/React (apps/shout-crafter), vitest, pnpm workspaces.

**Environment:** All verification in this plan runs against the local dev stack already running at `http://localhost:3000` (local Postgres on 5433, local Redis on 6380 — see `docs/LOCAL_DEV.md`), never against prod. No step in this plan touches `deploy-xiv-web.sh` or the prod `docker-compose.yml`.

---

## Task 1: Delete fully-dead files (apps/web)

**Files:**

- Delete: `apps/web/components/dashboard-analytics.tsx`
- Delete: `apps/web/components/manage-staff-role-dialog.tsx`
- Delete: `apps/web/components/ui/scroll-area.tsx`
- Delete: `apps/web/components/ui/sheet.tsx`
- Delete: `apps/web/components/ui/tabs.tsx`
- Delete: `apps/web/test-db-connection.js`

**Context:** All 6 are confirmed zero-importer by the Stage 1 report and independently re-verified via `grep -rln` across `apps/web` (excluding `generated/`) immediately before this plan was written — none showed up anywhere except their own file. `test-db-connection.js` additionally references a stale "port 6543 pooler" connection string style left over from a since-removed hosting setup, confirming it's an orphaned debug script, not something recently relevant.

Do NOT delete these look-alike files even though knip also flagged them — the Stage 1 report confirms they're still in active manual use (verify with the user again only if genuinely unsure, but do not re-litigate this — it was already confirmed 2026-08-15): `apps/web/apply-indexes.js`, `apps/web/clean-pending-owner.js`, `apps/web/encode-password.js`, `apps/web/scripts/generate-favicons.ts`, `apps/web/scripts/list-users.ts`, `apps/web/scripts/make-admin.ts`, `scripts/backfill-venue-types.ts`.

- [ ] **Step 1: Re-verify zero importers immediately before deleting (defense against drift since the report was written)**

```bash
cd /home/ehno/xiv-app
grep -rln "dashboard-analytics" apps/web --include="*.tsx" --include="*.ts" | grep -v generated
grep -rln "manage-staff-role-dialog" apps/web --include="*.tsx" --include="*.ts" | grep -v generated
grep -rln "components/ui/scroll-area\|ScrollArea" apps/web --include="*.tsx" --include="*.ts" | grep -v generated
grep -rln "components/ui/sheet\b" apps/web --include="*.tsx" --include="*.ts" | grep -v generated
grep -rln "components/ui/tabs\b" apps/web --include="*.tsx" --include="*.ts" | grep -v generated
```

Expected: each command's only output line (if any) is the file's own definition file (e.g. `scroll-area.tsx` grep matches only itself). If any command shows a _different_ file, STOP — something now imports it that didn't before, do not delete that file, report this as a plan deviation.

- [ ] **Step 2: Delete the 6 files**

```bash
git rm apps/web/components/dashboard-analytics.tsx
git rm apps/web/components/manage-staff-role-dialog.tsx
git rm apps/web/components/ui/scroll-area.tsx
git rm apps/web/components/ui/sheet.tsx
git rm apps/web/components/ui/tabs.tsx
git rm apps/web/test-db-connection.js
```

- [ ] **Step 3: Typecheck and test**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 tsc errors, 54/54 tests still passing (same as before this plan — these are all unreferenced files, deleting them shouldn't change either number).

- [ ] **Step 4: Commit**

```bash
cd /home/ehno/xiv-app
git commit -m "chore: remove dead component/script files (codebase sweep stage 2 increment 1)"
```

---

## Task 2: Delete dead export/type declarations that are also unused internally (apps/web)

**Files:**

- Modify: `apps/web/lib/api/plugin-auth.ts`
- Modify: `apps/web/lib/discord-webhook.ts`
- Modify: `apps/web/lib/discord-bot.ts`
- Modify: `apps/web/lib/redis-cache.ts`
- Modify: `apps/web/lib/storage.ts`

**Context:** These are genuinely dead — zero usage anywhere, internal or external — confirmed by grep immediately before writing this plan (not just trusting the Stage 1 report's original pass).

- [ ] **Step 1: Delete `getVenueRoles` from `plugin-auth.ts` (lines 162-204, doc comment through closing brace)**

Current content at that range (verify it still matches before deleting — if it doesn't, the file has changed since this plan was written, stop and re-check):

```ts
/**
 * Get roles and their permissions for a venue
 */
export async function getVenueRoles(venueId: string, userId: string) {
  // Check user has access to this venue
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      venueId,
      status: "active",
    },
  })

  if (!membership) {
    return null
  }

  // Get all roles at this venue, with their linked services eagerly loaded
  // via the Role.services relation (Prisma implicit many-to-many).
  const rolesRaw = await prisma.role.findMany({
    where: { venueId },
    include: { services: true },
  })

  const rolesWithServices = rolesRaw.map((role) => ({
    id: role.id,
    name: role.name,
    color: role.color,
    responsibilities: role.responsibilities,
    services: role.services.map((svc) => ({
      id: svc.id,
      name: svc.name,
      description: svc.description,
      price: Number(svc.price),
      category: svc.category,
    })),
  }))

  return {
    userRole: membership.role,
    roles: rolesWithServices,
  }
}
```

Delete this whole block. `app/api/plugin/roles/route.ts` already has an in-code comment documenting that it replaced this function (the comment itself should stay — it's explaining a real design decision, not referencing dead code as if it were live).

- [ ] **Step 2: In `discord-webhook.ts`, delete `deleteDiscordMessage` (a genuinely dead function) and drop `export` from `WebhookGroup` (a type still used internally by `WEBHOOK_TYPE_TO_GROUP` in the same file — do not delete the type itself)**

Delete this block (the whole function, ~line 190-206):

```ts
/**
 * Delete an existing Discord webhook message.
 */
export async function deleteDiscordMessage(webhookUrl: string | null, messageId: string): Promise<boolean> {
  if (!webhookUrl || !isValidDiscordWebhookUrl(webhookUrl)) return false
  try {
    const res = await fetch(`${webhookUrl}/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
    })
    return res.ok
  } catch (error) {
    console.error("Error deleting Discord webhook message:", error)
    return false
  }
}
```

Change (around line 75):

```ts
export type WebhookGroup = "staff" | "events" | "revenue"
```

to:

```ts
type WebhookGroup = "staff" | "events" | "revenue"
```

- [ ] **Step 3: In `discord-bot.ts`, delete `deleteBotMessage` (genuinely dead) and drop `export` from `DiscordActionRow` (still used internally by `BotMessagePayload` in the same file)**

Delete this block (~line 54-58, verify exact line by searching for the function signature first since line numbers may have shifted from Task 1's edits elsewhere):

```ts
export async function deleteBotMessage(channelId: string, messageId: string): Promise<void> {
  await botFetch(`/channels/${channelId}/messages/${messageId}`, { method: "DELETE" })
}
```

(Read the actual current body with `sed -n '54,60p' apps/web/lib/discord-bot.ts` before deleting — the snippet above is a best-effort reconstruction from context, confirm it matches before removing.)

Change:

```ts
export interface DiscordActionRow {
  type: 1
  components: DiscordButtonComponent[]
}
```

to:

```ts
interface DiscordActionRow {
  type: 1
  components: DiscordButtonComponent[]
}
```

Do NOT touch `DiscordButtonComponent` in this same file — it's used via an inline type-only import in `apps/web/lib/shift-bot.ts:56` (`import("@/lib/discord-bot").DiscordButtonComponent`), so it must stay exported.

- [ ] **Step 4: In `redis-cache.ts`, delete `invalidateCacheKeys` (genuinely dead) and the bare `export { redis }` re-export (genuinely dead — every consumer imports `redis` from `@/lib/redis` directly, never from this file)**

Delete:

```ts
export async function invalidateCacheKeys(keys: string[]): Promise<void> {
  if (!ready() || !redis || keys.length === 0) return
  try {
    await redis.del(...keys.map(k))
  } catch (error) {
    console.error("[redis-cache] batch invalidate error:", error)
  }
}
```

Delete the last line of the file:

```ts
export { redis }
```

Do NOT touch `getCached`/`setCache` in this file — both are used internally by `getOrSet` (same file), which is imported by 3 production files (`lib/public-stats.ts` and others per the report). Do NOT touch `invalidateCache` (no "Keys" suffix, singular) — that one has 8 real external importers, confirmed separately from the plural `invalidateCacheKeys` being deleted here.

- [ ] **Step 5: In `storage.ts`, delete `publicUrl` (genuinely dead — the only other match for this name anywhere in `apps/web` is an unrelated local variable of the same name in `gallery-manager.tsx`, not a call to this function)**

Delete:

```ts
/** Convert a storage key to a public URL */
export function publicUrl(key: string): string {
  const base = process.env.MINIO_PUBLIC_URL ?? process.env.MINIO_ENDPOINT ?? "http://localhost:9000"
  return `${base}/${BUCKET}/${key}`
}
```

- [ ] **Step 6: Typecheck and test**

```bash
cd /home/ehno/xiv-app/apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 tsc errors, 54/54 tests passing. If tsc errors on a now-missing type, it means something used one of the deleted-not-just-unexported items externally after all — stop and investigate rather than force a fix.

- [ ] **Step 7: Manual check against the running local dev server**

These are all `lib/` files reachable from real API routes. With the local dev server already running at `http://localhost:3000` (per `docs/LOCAL_DEV.md`), exercise at least one route touching each modified file:

```bash
curl -s http://localhost:3000/api/plugin/roles?venueId=<your local test venue id> -H "x-api-key: <your local plugin API key>" | head -5
```

Expected: still returns a normal `{"roles": [...]}` response (or a normal 400/401 if venueId/key aren't supplied) — not a 500. This exercises `app/api/plugin/roles/route.ts`, which imports from `plugin-auth.ts` (Step 1) and doesn't call the now-deleted `getVenueRoles`.

For the discord/redis/storage changes, a full manual click-through isn't necessary — `pnpm dev`'s hot reload recompiling without error (check the dev server's terminal/log output for new compile errors after saving these files) is sufficient, since none of these deleted functions were called from anywhere to begin with.

- [ ] **Step 8: Commit**

```bash
cd /home/ehno/xiv-app
git add apps/web/lib/api/plugin-auth.ts apps/web/lib/discord-webhook.ts apps/web/lib/discord-bot.ts apps/web/lib/redis-cache.ts apps/web/lib/storage.ts
git commit -m "chore: remove dead exports, unexport internally-used types (codebase sweep stage 2 increment 1)"
```

---

## Task 3: Drop `export` from internally-used-only types (apps/web)

**Files:**

- Modify: `apps/web/lib/notify.ts`
- Modify: `apps/web/lib/payroll-rates.ts`
- Modify: `apps/web/components/breadcrumb.tsx`

**Context:** All three are used only within their own declaring file (confirmed via grep — zero external matches), same pattern as `WebhookGroup`/`DiscordActionRow` in Task 2. The fix is dropping `export`, not deleting the type.

- [ ] **Step 1: In `notify.ts`, unexport `NotificationType`**

Change:

```ts
export type NotificationType = "NEW_FOLLOWER" | "STAFF_JOINED" | "TASK_ASSIGNED" | "TASK_COMPLETED"
```

to:

```ts
type NotificationType = "NEW_FOLLOWER" | "STAFF_JOINED" | "TASK_ASSIGNED" | "TASK_COMPLETED"
```

- [ ] **Step 2: In `payroll-rates.ts`, unexport `RateResolvedShift`**

Find the interface declaration (starts `export interface RateResolvedShift {`) and remove `export ` from that line only — leave the interface body untouched (it's used internally at 2 other lines in the same file per the Stage 1 report).

- [ ] **Step 3: In `breadcrumb.tsx`, unexport `BreadcrumbItem`**

Change:

```ts
export interface BreadcrumbItem {
```

to:

```ts
interface BreadcrumbItem {
```

- [ ] **Step 4: Typecheck**

```bash
cd /home/ehno/xiv-app/apps/web && npx tsc --noEmit
```

Expected: 0 errors. If something errors on an import of `NotificationType`/`RateResolvedShift`/`BreadcrumbItem` from these files, that's real external usage that grep missed — stop, re-add `export` for that one item, and note the discrepancy rather than forcing it through.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/notify.ts apps/web/lib/payroll-rates.ts apps/web/components/breadcrumb.tsx
git commit -m "chore: unexport internally-used-only types (codebase sweep stage 2 increment 1)"
```

---

## Task 4: apps/discord-bot — unexport `db`

**Files:**

- Modify: `apps/discord-bot/src/db.ts`

**Context:** `db` (the `pg.Pool` instance) is used internally by `getHighestMembership`/`getAllDiscordIds` in the same file. No other file in `apps/discord-bot/src` imports `db` directly — only `getAllDiscordIds`, `getHighestMembership`, and the `MembershipRole` type are imported elsewhere (confirmed via grep against `index.ts` and `assign.ts`, the only two other files in this workspace).

- [ ] **Step 1: Unexport `db`**

Change:

```ts
export const db = new Pool({ connectionString: process.env.DATABASE_URL })
```

to:

```ts
const db = new Pool({ connectionString: process.env.DATABASE_URL })
```

- [ ] **Step 2: Typecheck this workspace**

```bash
cd /home/ehno/xiv-app/apps/discord-bot && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /home/ehno/xiv-app
git add apps/discord-bot/src/db.ts
git commit -m "chore: unexport internally-used-only db pool (codebase sweep stage 2 increment 1)"
```

---

## Task 5: apps/shout-crafter — delete `storage.ts` + its now-orphaned `SavedShout` type, delete `findDatacenter`, unexport `WORLDS`, unexport `XivVMUser`/`XivVMVenue`, delete `App.css`

**Files:**

- Delete: `apps/shout-crafter/src/App.css`
- Delete: `apps/shout-crafter/src/lib/storage.ts`
- Modify: `apps/shout-crafter/src/types.ts`
- Modify: `apps/shout-crafter/src/lib/worlds.ts`
- Modify: `apps/shout-crafter/src/lib/xivvm-auth.ts`

**Context — important correction from the Stage 1 report:** `lib/storage.ts` (localStorage-based save/load) is genuinely orphaned — it was superseded by `lib/xivvm-shouts.ts` (a _different_, server-backed implementation with its own separate `SavedShout` interface that the actual UI component, `SavedShouts.tsx`, imports instead). Deleting `storage.ts` is safe (zero importers, confirmed via grep). Once it's gone, the `SavedShout` interface in `types.ts` (which only `storage.ts` imported) becomes fully dead too — not just "unexported," genuinely deletable, since nothing else in `types.ts` references it. Do NOT confuse this `SavedShout` with the other one in `xivvm-shouts.ts` — that one is live and must not be touched.

- [ ] **Step 1: Delete `App.css` (0 bytes, unreferenced) and `lib/storage.ts`**

```bash
cd /home/ehno/xiv-app
grep -rln "App\.css" apps/shout-crafter/src --include="*.tsx" --include="*.ts"
```

Expected: no output (confirms nothing imports it before deleting).

```bash
git rm apps/shout-crafter/src/App.css
git rm apps/shout-crafter/src/lib/storage.ts
```

- [ ] **Step 2: Re-verify `SavedShout` in `types.ts` has no other importer now that `storage.ts` is gone, then delete it**

```bash
grep -rln "SavedShout" apps/shout-crafter/src --include="*.tsx" --include="*.ts" | grep -v "lib/xivvm-shouts.ts" | grep -v "components/SavedShouts.tsx"
```

Expected: no output (the only remaining hits should be the unrelated `xivvm-shouts.ts`/`SavedShouts.tsx` pair, which import a _different_ `SavedShout` interface — leave those alone).

In `apps/shout-crafter/src/types.ts`, delete:

```ts
export interface SavedShout {
  id: string
  label: string
  fields: ShoutFields
  templateId: TemplateId
  savedAt: number
}
```

- [ ] **Step 3: In `worlds.ts`, delete `findDatacenter` (genuinely dead, zero usage even internally) and unexport `WORLDS` (used internally by `ALL_WORLDS`/`ALL_DATACENTERS` in the same file)**

Delete:

```ts
export function findDatacenter(text: string): string | undefined {
  const lower = text.toLowerCase()
  return ALL_DATACENTERS.find((dc) => lower.includes(dc.toLowerCase()))
}
```

Change:

```ts
export const WORLDS: Record<string, string[]> = {
```

to:

```ts
const WORLDS: Record<string, string[]> = {
```

Do NOT touch `ALL_WORLDS`, `ALL_DATACENTERS`, or `findWorld` — `ALL_WORLDS` is imported and used by `ShoutBuilder.tsx`, and `ALL_DATACENTERS`/`findWorld` were not flagged as dead.

- [ ] **Step 4: In `xivvm-auth.ts`, unexport `XivVMUser` and `XivVMVenue` (both used internally by `XivVMSession` in the same file)**

Change:

```ts
export interface XivVMUser {
```

to:

```ts
interface XivVMUser {
```

Change:

```ts
export interface XivVMVenue {
```

to:

```ts
interface XivVMVenue {
```

Do NOT touch `XivVMSession` or `fetchSession` — neither was flagged, and `XivVMSession` is the type that actually gets imported elsewhere.

- [ ] **Step 5: Typecheck this workspace**

```bash
cd /home/ehno/xiv-app/apps/shout-crafter && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /home/ehno/xiv-app
git add apps/shout-crafter/src
git commit -m "chore: remove dead shout-crafter files/exports (codebase sweep stage 2 increment 1)"
```

---

## Task 6: docker/homepage — delete empty unused config file

**Files:**

- Delete: `docker/homepage/config/custom.js`

**Context:** 0 bytes, and the homepage dashboard app's own log (`docker/homepage/config/logs/homepage.log`) shows it auto-copies this file into the config folder as a default on its own startup if missing — this is optional per-user JS customization scaffolding for that app, not something any other part of this repo reads or depends on. Not referenced in the prod `docker-compose.yml` or anywhere else in the repo.

- [ ] **Step 1: Confirm nothing in the repo references it**

```bash
cd /home/ehno/xiv-app
grep -rn "custom\.js" docker/ docker-compose.yml docker-compose.local.yml 2>/dev/null | grep -v "logs/homepage.log"
```

Expected: no output.

- [ ] **Step 2: Delete**

```bash
git rm docker/homepage/config/custom.js
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove empty unused homepage custom.js (codebase sweep stage 2 increment 1)"
```

---

## Task 7: Remove confirmed-unused dependencies from apps/web/package.json

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/web/pnpm-lock.yaml` (regenerated, not hand-edited)

**Context:** `@radix-ui/react-scroll-area` and `@radix-ui/react-tabs` match the deleted `ui/scroll-area.tsx`/`ui/tabs.tsx` files from Task 1. `jose` is independently confirmed to have zero usage anywhere in `apps/web` (its last consumer was the now-removed mobile JWT auth code). Do NOT remove `dotenv` or `sharp` — both were flagged as "unused" by knip but are actually used by `apps/web/apply-indexes.js` (`dotenv`) and `apps/web/scripts/generate-favicons.ts` (`sharp`), both confirmed-keep ops scripts from Task 1's context — knip's static analysis doesn't fully trace these root-level CommonJS/ts-node-run scripts. Do NOT remove `tsx` — it's the runner for those same scripts.

- [ ] **Step 1: Re-verify each dependency's usage immediately before removing**

```bash
cd /home/ehno/xiv-app
grep -rln "components/ui/scroll-area\|ScrollArea" apps/web --include="*.tsx" --include="*.ts" | grep -v generated
grep -rln "components/ui/tabs\b" apps/web --include="*.tsx" --include="*.ts" | grep -v generated
grep -rln "from ['\"]jose['\"]\|require(['\"]jose['\"])" apps/web --include="*.ts" --include="*.tsx" | grep -v generated
```

Expected: no output for all three (Task 1 already deleted the two `ui/*.tsx` files, so those greps should now be fully empty rather than matching just the definition file as in Task 1's Step 1).

- [ ] **Step 2: Remove the three lines from `apps/web/package.json`**

Remove:

```json
    "@radix-ui/react-scroll-area": "^1.2.10",
```

Remove:

```json
    "@radix-ui/react-tabs": "^1.1.13",
```

Remove:

```json
    "jose": "4.15.9",
```

- [ ] **Step 3: Reinstall to update the lockfile**

```bash
cd /home/ehno/xiv-app && pnpm install
```

Expected: completes cleanly, `pnpm-lock.yaml` updates to drop the 3 packages (and any now-orphaned transitive deps).

- [ ] **Step 4: Typecheck and test**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, 54/54 tests passing.

- [ ] **Step 5: Restart the local dev server and confirm it still boots clean**

```bash
# kill the existing pnpm dev process, then:
cd /home/ehno/xiv-app/apps/web && pnpm dev
```

Expected: starts cleanly, no missing-module errors (this is the real proof the 3 removed packages weren't secretly needed by something outside static-analysis reach, e.g. a dynamic `require`).

- [ ] **Step 6: Commit**

```bash
cd /home/ehno/xiv-app
git add apps/web/package.json apps/web/pnpm-lock.yaml pnpm-lock.yaml
git commit -m "chore: remove unused dependencies scroll-area/tabs/jose (codebase sweep stage 2 increment 1)"
```

---

## Self-review

**Spec coverage:**

- All 9 files-to-delete from the scope → Task 1 (6 apps/web files), Task 5 (App.css, storage.ts), Task 6 (custom.js). ✅
- All 12 exports/types-to-delete from the scope → Task 2 (5 items across plugin-auth/discord-webhook/discord-bot/redis-cache/storage), Task 3 (3 unexports), Task 4 (db unexport), Task 5 (SavedShout delete, findDatacenter delete, WORLDS/XivVMUser/XivVMVenue unexport). ✅ — note several were reclassified from "delete" to "unexport" after verification found internal-file usage; this is a correction, not a scope gap, and is called out explicitly in each task's context.
- 3 dependency removals → Task 7. ✅
- Explicit keep-list (financial-calculations.ts, getCached/setCache, DiscordColors, DiscordButtonComponent, pot-payroll types, shadcn exports, ffxivvenues.ts types, shift-bot.ts buildShiftEmbed, eorzea-bot exports, tsx/sharp/dotenv deps) → none of these appear in any deletion step; each is explicitly called out as "do NOT touch" in its relevant task. ✅
- Local-stack-only verification, no prod references → confirmed, every verification step in this plan targets `localhost:3000`/local tsc/vitest; no task references `deploy-xiv-web.sh` or prod `docker-compose.yml`. ✅

**Placeholder scan:** No TBD/TODO markers. One step (Task 2 Step 3's `deleteBotMessage` body) is flagged as a "best-effort reconstruction, confirm before deleting" rather than a guaranteed-exact quote — this is a deliberate, explicit caveat (with the exact command to verify first) rather than a placeholder, since the file's line numbers could have shifted slightly by the time this task executes after Tasks 1's edits elsewhere in the same workspace.

**Type consistency:** Function/type names used consistently across tasks (`getVenueRoles`, `deleteDiscordMessage`, `WebhookGroup`, `DiscordActionRow`, `deleteBotMessage`, `invalidateCacheKeys`, `publicUrl`, `NotificationType`, `RateResolvedShift`, `BreadcrumbItem`, `db`, `SavedShout`, `findDatacenter`, `WORLDS`, `XivVMUser`, `XivVMVenue`) — each appears in exactly one task, no cross-task renames.
