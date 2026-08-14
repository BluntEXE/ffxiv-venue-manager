# Codebase Sweep — Stage 1 Findings Report

Generated 2026-08-15 from `knip`, `jscpd`, and an agent-driven structural pass on the VenueManager plugin. See `docs/superpowers/specs/2026-08-15-codebase-sweep-design.md` for the design this report feeds into (Stage 2: triage + fix).

**Scope note:** `packages/types` is not covered by the current `knip.json` config — it was out of scope for this pass. Flag it for Stage 2 awareness; it hasn't been checked for dead exports.

**Methodology note (knip):** the first knip run flagged 68% false positives in `apps/eorzea-bot` — command/event handlers loaded at runtime via `readdirSync()` + dynamic `import()`, invisible to knip's static analysis. This was fixed by adding explicit entry patterns to `knip.json`, and the numbers below are from the corrected re-run.

**Methodology note (jscpd):** jscpd reports clone *pairs*, not distinct fix items — one shared fragment reused across N files produces up to C(N,2) pairwise entries. The duplicate-code section below is organized by actual shared fragment (verified by reading the source files directly), not by raw pair count.

## Dead code / unused exports / unused files (knip)

### Unused files (16)
| File | Note |
|---|---|
| `apps/shout-crafter/src/App.css` | Genuine deletion candidate — unreferenced CSS. |
| `apps/shout-crafter/src/lib/storage.ts` | Verify no dynamic import before deleting. |
| `apps/web/apply-indexes.js` | One-off script; check if still needed for ops runbooks before deleting. |
| `apps/web/clean-pending-owner.js` | One-off ops script — likely safe to delete if superseded, verify against recent DB-fix history. |
| `apps/web/components/dashboard-analytics.tsx` | Could be a planned-but-unwired component; verify against roadmap before deleting. |
| `apps/web/components/manage-staff-role-dialog.tsx` | Same — check for a superseding dialog component before deleting. |
| `apps/web/components/ui/scroll-area.tsx` | shadcn primitive; unused dep (`@radix-ui/react-scroll-area`, see below) confirms it's truly unwired. |
| `apps/web/components/ui/sheet.tsx` | shadcn primitive, likely genuinely unused. |
| `apps/web/components/ui/tabs.tsx` | shadcn primitive; unused dep (`@radix-ui/react-tabs`, see below) confirms it's truly unwired. |
| `apps/web/encode-password.js` | One-off ops script. |
| `apps/web/scripts/generate-favicons.ts` | Check if run manually/rarely (favicon regen) before deleting — CLI scripts are exactly the kind of thing static analysis flags as "unused" when they're actually invoked ad hoc via `tsx scripts/...`. |
| `apps/web/scripts/list-users.ts` | Likely an ad-hoc ops script, same caveat as above. |
| `apps/web/scripts/make-admin.ts` | Same caveat — verify not documented as a manual-run tool before deleting. |
| `apps/web/test-db-connection.js` | Debug script, likely safe to delete. |
| `docker/homepage/config/custom.js` | Check whether the homepage dashboard container references this via volume mount / config, not just import — knip won't see non-JS config wiring. |
| `scripts/backfill-venue-types.ts` | One-off migration script — verify it already ran in prod before deleting (see prior backfill scripts in the codebase for precedent on keeping them as historical record). |

**Judgment note:** the `scripts/*` and root `*.js` one-off files are the most likely false-positive category here — they're often invoked manually (`node script.js`, `npx tsx script.ts`) rather than imported, so "unused" by static analysis doesn't mean "safe to delete" without checking deploy/runbook docs first. The `components/ui/*` and `dashboard-analytics.tsx` / `manage-staff-role-dialog.tsx` files are more likely genuine dead code.

### Unused exports (55) and unused exported types (23)

Full list is in `knip-output.txt` (re-run at `/tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/knip-output.txt`) — reproduced here grouped by area since the raw list is long and Stage 2 will want it scannable:

**apps/web/components/ui/* (shadcn primitives, 17 of the 55 unused exports + 2 of the 23 unused types):** `AlertDialogPortal`, `AlertDialogOverlay` (alert-dialog.tsx), `AlertTitle` (alert.tsx), `badgeVariants` (badge.tsx), `CalendarDayButton` (calendar.tsx), `CardFooter`, `CardAction` (card.tsx), `DialogClose`, `DialogOverlay`, `DialogPortal` (dialog.tsx), `DropdownMenuPortal`, `DropdownMenuGroup`, `DropdownMenuLabel`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuShortcut`, `DropdownMenuSub`, `DropdownMenuSubTrigger`, `DropdownMenuSubContent` (dropdown-menu.tsx), `LoadingSpinner` (loading-spinner.tsx), `PopoverAnchor` (popover.tsx), `SelectGroup`, `SelectLabel`, `SelectScrollDownButton`, `SelectScrollUpButton`, `SelectSeparator` (select.tsx), `TableFooter`, `TableCaption` (table.tsx), plus types `DataTableColumn` (data-table.tsx), `StatReadoutProps`/`IconVariant` (stat-readout.tsx). **Judgment:** near-certain false positives — these are shadcn boilerplate exports kept for API completeness (part of a generated component kit), not evidence of dead functionality. Not a Stage 2 deletion target; standard shadcn practice is to keep the full primitive surface even if only some pieces are used today.

**apps/web/lib/financial-calculations.ts (6 unused exports + 1 type):** `calculateRevenue`, `calculatePayrollExpenses`, `calculateNetProfit`, `calculateProfitMargin`, `calculatePayrollPercentage`, `getFinancialSummary`, type `DateRange`. **Judgment:** worth a closer look in Stage 2 — this is a full financial-calculation module with nothing importing it. Either genuinely dead (removed feature) or a planned-but-unwired financial dashboard; check git history/recent commits before deleting.

**apps/web/lib/api/plugin-auth.ts (4 unused exports):** `generateApiKey`, `revokeApiKey`, `getUserApiKeys`, `getVenueRoles`. **Judgment:** these read like public API-key management functions — check whether they're called from a page/route knip doesn't trace (e.g. via a barrel export or dynamic path) before assuming dead; if genuinely unused, this is a bigger candidate (key rotation/revocation UI that may be missing).

**apps/web/lib/discord-webhook.ts / discord-bot.ts (3 unused exports + 2 types):** `deleteDiscordMessage`, `DiscordColors` (discord-webhook.ts), `deleteBotMessage` (discord-bot.ts), types `DiscordButtonComponent`, `DiscordActionRow` (discord-bot.ts), type `WebhookGroup` (discord-webhook.ts). **Judgment:** plausible dead code (message-delete helpers with no caller) — low risk to remove after a grep confirms no dynamic usage.

**apps/web/lib/redis-cache.ts (4 unused exports):** `getCached`, `setCache`, `invalidateCacheKeys`, `redis` (the client itself). **Judgment:** flag for Stage 2 — an unused `redis` client export is either dead scaffolding or (more likely) something importing it indirectly that knip's resolution missed; worth double-checking given "Cache scaling follow-ups" is a known open thread.

**apps/web/lib/ffxivvenues.ts (6 unused types):** `FfxivTime`, `FfxivUtcSchedule`, `FfxivScheduleEntry`, `FfxivOpening`, `FfxivScheduleOverride`, `FfxivNotice`. **Judgment:** these look like an integration's full response-shape typing where only some fields/types are actually consumed downstream — likely genuine unused surface from an external API client, low-risk to leave as documentation of the API shape or trim if Stage 2 wants stricter typing hygiene.

**apps/web/lib/shift-bot.ts (1 export):** `buildShiftEmbed`. **Judgment:** check call sites carefully — this file is also flagged for internal duplication below (see Duplicate code section), so Stage 2 touching it for the dedup refactor should verify this export's status at the same time.

**apps/web/lib/storage.ts (1 export):** `publicUrl`. Low-risk, verify no dynamic caller.

**apps/web/lib/notify.ts (1 type):** `NotificationType`.

**apps/web/lib/payroll-rates.ts (1 type):** `RateResolvedShift`.

**apps/web/lib/pot-payroll.ts (2 types):** `PotRole`, `PotContractorPayout`. Note: "Pot payroll mode" is a known project with implementation deferred per project notes — these may be scaffolding for that unfinished feature rather than dead code. **Do not delete without checking pot-payroll-mode status first.**

**apps/web/lib/venue-location.ts (1 type):** `FfxivDistrict`. Note: this file also has an internal duplication finding below.

**apps/web/components/breadcrumb.tsx (1 type):** `BreadcrumbItem`.

**apps/discord-bot/src/db.ts (1 export):** `db`.

**apps/eorzea-bot/src/utils/membership.ts (2 exports + 1 type):** `MANAGED_ROLES`, `getHighestMembership`, type `MembershipRole`. **Judgment:** eorzea-bot was the false-positive-prone workspace in the first knip run — even with corrected entry patterns, double-check these aren't consumed by a runtime-loaded command/event handler before deleting.

**apps/eorzea-bot/src/utils/xp.ts (2 exports):** `MESSAGE_XP`, `LOYALTY_TIERS`. Same caveat as above.

**apps/shout-crafter/src/lib/worlds.ts (2 exports):** `WORLDS`, `findDatacenter`.

**apps/shout-crafter/src/lib/xivvm-auth.ts (2 types):** `XivVMUser`, `XivVMVenue`.

**apps/shout-crafter/src/types.ts (1 type):** `SavedShout`.

## Unused dependencies (knip)

**Unused dependencies (3), all `apps/web`:**
- `@radix-ui/react-scroll-area` — apps/web/package.json:30 (matches the unused `components/ui/scroll-area.tsx` file above; consistent, safe removal candidate)
- `@radix-ui/react-tabs` — apps/web/package.json:34 (matches the unused `components/ui/tabs.tsx` file above; consistent, safe removal candidate)
- `jose` — apps/web/package.json:42

**Unused devDependencies (3), all `apps/web`:**
- `dotenv` — apps/web/package.json:66
- `sharp` — apps/web/package.json:69
- `tsx` — apps/web/package.json:71 — **caution:** several of the "unused files" above (`apps/web/scripts/*.ts`) are exactly the kind of file that would be run via `tsx scripts/foo.ts`. If those scripts are still in active manual use, `tsx` is a false-positive "unused" devDependency, not a real one. Verify script usage before removing this dep.

**Unlisted binary (1):**
- `ts-node` — referenced in `apps/discord-bot/package.json` but not declared as a dependency anywhere knip can see. Needs either an explicit devDependency entry or confirmation it's satisfied transitively/globally.

## Duplicate code blocks (jscpd)

jscpd's raw numbers: 336 clone pairs across 369 files, 5,079 duplicated lines (9.73%), 31,703 duplicated tokens (10.09%) — split as 130 TSX clone pairs (4.99% duplication) and 206 TypeScript clone pairs (15.99% duplication). As noted above, these are pairwise matches, not 336 distinct issues. Below are the real clusters identified by reading the underlying source, each verified directly against the files (not just the jscpd pair list).

### 1. Plugin-route auth/rate-limit boilerplate — `apps/web/app/api/plugin/**/route.ts` (HIGH value)
**Files (verified count: 20 route files)**, all importing `enforcePluginRateLimit, enforcePluginIpRateLimit` and repeating the same shape:
```
const __ipLimited = await enforcePluginIpRateLimit(request)
if (__ipLimited) return __ipLimited
const apiKey = request.headers.get('x-api-key')
if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
... validateApiKey(...) ...
```
jscpd flagged this pattern repeatedly across pairs at `events/active`, `patrons/vip`, `roles`, `rooms`, `services`, `venues`, `inventory-settings`, `inventory/link-item`, `inventory/restock`, `roles/[venueId]`, `patron-visits`, `patrons/ban`, `rooms/status`, `shifts/claim`, `shifts/clock-in`, `shifts/clock-out`, `shifts`, `transactions`, `characters` (see raw pairs in `jscpd-console-output.txt` lines ~1015–2052).
**Judgment:** genuine, safe extraction target — this is the single largest duplication cluster in the report by file count. A shared `withPluginAuth(handler)` wrapper (IP rate-limit → API-key check → per-key rate-limit → call handler) would collapse ~10-15 duplicated lines × 20 files into one place. Low risk since the logic is already byte-for-byte identical across call sites.

### 2. 429 response body hand-rolled again outside `plugin-rate-limit.ts` — `apps/web/app/api/auth/[...nextauth]/route.ts` (MEDIUM value)
**Files:** `apps/web/lib/api/plugin-rate-limit.ts:27-38` and `:67-79` (the 429 JSON body + `X-RateLimit-*`/`Retry-After` headers, itself duplicated once *within* the file — see #3 below) vs. `apps/web/app/api/auth/[...nextauth]/route.ts:31-42`, which hand-rolls the identical 429 response shape (same header set, same `Retry-After` calculation) instead of importing the existing helper.
**Judgment:** genuine duplication and a real bug-risk (two independently-maintained copies of security-relevant rate-limit response formatting will drift). `plugin-rate-limit.ts` isn't directly reusable as-is (nextauth route needs a different budget/key), but the 429-response-building logic (`buildRateLimitResponse(rl, budget)`) should be factored out of `plugin-rate-limit.ts` into a shared helper (e.g. `lib/rate-limit.ts`) and reused by both call sites. Also note `getIp()` is duplicated verbatim in both `plugin-rate-limit.ts` and `[...nextauth]/route.ts` — same fix, same helper move.

### 3. 429 response body duplicated within `plugin-rate-limit.ts` itself (MEDIUM value)
**File:** `apps/web/lib/api/plugin-rate-limit.ts:26-38` (`enforcePluginIpRateLimit`) and `:67-79` (`enforcePluginRateLimit`) — same 429 JSON/header-building block, differing only in which budget was exceeded. Confirmed directly (jscpd also flagged this pair at report lines ~10549-10550).
**Judgment:** same root cause as #2 — extracting a `buildRateLimitResponse(rl)` helper fixes both #2 and #3 in one pass.

### 4. Shift embed → membership → settings → refresh pattern — `apps/web/lib/shift-bot.ts` (HIGH value)
**File:** `apps/web/lib/shift-bot.ts` — the sequence "fetch embed by ID → guard not-found/cancelled → look up user by Discord ID → look up active membership → look up shift → extract settings → call `refreshEmbed`" repeats across handler functions in this file (e.g. lines ~234-303 per jscpd's flagged pairs, matching the decline/maybe-list style handlers). Confirmed via direct read: the `user`/`membership`/`shift` lookup block at lines 240-250 is near-identical to lines 295-303.
**Judgment:** genuine shared-helper candidate — extract a `resolveShiftMembership(embed, discordUserId)` (or similar) helper that does the embed-fetch → membership-lookup step once, called from each handler (`handleShiftDecline`, `handleShiftMaybe`, and siblings). Matches the parent design review's description of a pattern repeated 3-4x across this file.

### 5. District/ward/plot string-builder duplicated in one file — `apps/web/lib/venue-location.ts` (MEDIUM value)
**File:** `apps/web/lib/venue-location.ts:26-31` and `:42-46` — identical 5-line array-build-and-join:
```ts
[
  v.district ?? null,
  v.ward != null ? `W${v.ward}` : null,
  v.plot != null ? `P${v.plot}` : v.apartment != null ? `Apt${v.apartment}` : null,
].filter(Boolean).join(" ")
```
differing only in `if (loc) parts.push(loc)` vs. `... || null` at the call site. Confirmed directly in source and in jscpd output.
**Judgment:** trivial, safe extraction — pull into a private `buildLocationString(v)` helper used by both call sites in the same file. Smallest fix in this report, but easy and removes drift risk (this string format also has a duplicated type export, `FfxivDistrict`, flagged in the knip section above — worth doing both in the same touch).

### 6. `staffLabel` duplicated verbatim across two components (MEDIUM value)
**Files:** `apps/web/components/shift-day-dialog.tsx:37-44` and `apps/web/components/shifts-week-view.tsx:89-96` — identical `function staffLabel(shift: CalendarShift): string { ... }`. Confirmed in jscpd output (report lines ~10435-10456).
**Judgment:** genuine duplication, straightforward fix — move `staffLabel` into a shared module (e.g. `lib/shift-formatting.ts` or a shared `components/shift-utils.ts`) and import in both. Low risk, small function, single source of truth for how staff names are displayed on shift cards.

### 7. Internal duplication within `apps/web/components/shifts-week-view.tsx` (LOW-MEDIUM value)
**File:** `apps/web/components/shifts-week-view.tsx:248-257` / `:297-306`, and `:258-270` / `:307-319` — two more internal near-duplicate blocks beyond the `staffLabel` case, per jscpd pairs. Not independently investigated line-by-line beyond the `staffLabel` case above; flagged for Stage 2 to look at alongside #6 since it's the same file.

### 8. TSX/JSX structural clones — shadcn `<Select>` idiom reused across unrelated features (LOW value — needs manual review, not auto-extraction)
**Example files:** `apps/web/app/dashboard/[slug]/events/new/page.tsx`, `.../events/[eventId]/edit/page.tsx`, `.../staff/roles/page.tsx`, `.../tasks/page.tsx`, `apps/web/components/patron-logs-manager.tsx`, `apps/web/components/discover-client.tsx` — all show up in jscpd's TSX clone list around `<SelectTrigger>`/`<SelectValue>`/staff-picker-shaped JSX blocks.
**Judgment:** this is the single largest source of the 130 TSX clone pairs, but it's shared-UI-library idiom (every shadcn `<Select>` usage looks structurally similar), not semantic duplication — these are different features (events, staff roles, tasks, patron logs, venue discovery) that happen to use the same picker component shape. **Do not merge these into one shared component based on jscpd's structural match alone** — that would couple unrelated features. If Stage 2 wants to reduce this, the right move is a smaller shared `<StaffPicker>` or `<EntityCombobox>` primitive only where the *domain* meaning is actually the same (e.g. multiple "pick a staff member" instances), decided case-by-case after reading each call site, not a blanket refactor.

## VenueManager plugin structural duplication (manual pass)

Full detail in `plugin-duplication-findings.md`; all 5 top claims independently re-confirmed against source during this compile pass (no corrections needed). Summarized:

| # | Finding | Files | Value | Fix |
|---|---|---|---|---|
| 1 | "XIV-App not ready" guard clause, ~13 lines identical | `UI/Tabs/RoomsTab.cs:42-54`, `ShiftsTab.cs:49-61`, `SalesTab.cs:73-85` | HIGH | Extract `ThemeManager.RequireXivAppReady(plugin)` helper |
| 2 | Auto-refresh + manual-refresh-button block | `UI/Tabs/RoomsTab.cs:56-71`, `ShiftsTab.cs:63-80` | MEDIUM | `PollGate` helper struct |
| 3 | `LogSaleSilentAsync`/`LogTipSilentAsync` near-verbatim ~48-line methods | `Plugin.cs:455-499`, `:502-547` | HIGH | Fold into one `LogSaleOrTipSilentAsync(amount, customer, isTip)` |
| 4 | "prefix + not-configured + no-venue" guard, ~12 lines, 5x verbatim | `Plugin.cs`: `LogSaleSilentAsync:457-468`, `LogTipSilentAsync:504-515`, `BanPatronSilentAsync:552-563`, `ShiftClockInSilentAsync:588-599`, `ShiftClockOutSilentAsync:640-651` | HIGH | `bool TryGetChatPrefix(out string prefix)` helper — single best extraction target in the plugin, ~60 duplicated lines |
| 5 | `ShiftClockInSilentAsync`/`ShiftClockOutSilentAsync` shared guard+semaphore+try/finally scaffolding | `Plugin.cs:586-635`, `:638-690` | MEDIUM | Shared private helper for the semaphore-guarded wrapper only (domain logic differs, don't force a full merge) |
| 6 | `LogPatronVisitAsync`/`LogServiceAsync` hand-roll HTTP error handling that a sibling helper already provides | `XIVAppPatronApi.cs:16-45`, `:47-75` vs. shared `PostForResultAsync` in `XIVAppApiClient.cs:93-118` | HIGH | Convert both to use `PostForResultAsync<TRequest, bool>(...)`, removes ~35 duplicated lines |
| 7 | `GetVenuesAsync` hand-rolls what other methods get via shared `GetAsync<>` helper | `XIVAppVenueApi.cs:18-46` | LOW-MEDIUM | Lower priority — this call site intentionally wants throw-on-failure semantics; flag for awareness only |
| 8 | `LinkItemAsync`/`RestockAsync` same guard+call+refetch shape | `InventoryTab.cs:129-144`, `:146-161` | LOW | Optional extraction, only 2 call sites |
| 9 | `getSortedVenues` column-sort switch, 4 near-identical Ascending/Descending pairs | `VenuesTab.cs:38-66` | LOW | Could collapse to a `Func<Venue,IComparable>` key-selector helper; low risk either way, not urgent |

Dead code: none found with confidence in this manual pass (not exhaustive — no call-graph tool used, flagged as a gap not a clean bill of health).

## Oversized files

| File | Lines | Codebase | Note |
|---|---|---|---|
| `Plugin.cs` | 1,486 | VenueManager plugin | God-object: slash commands, DTR bar, chat alerts, shift polling, doorbell sound, event presence all in one class. Genuine splitting candidate (e.g. slash-command handling, chat-alert building, DTR/shift-polling as separate partial-class files or classes) — flagged for Stage 2 scoping, not attempted in this pass. |
| `UI/Tabs/SettingsTab.cs` | 820 | VenueManager plugin | Large but already well-sectioned with comment dividers and small private `Draw*` methods; less urgent than `Plugin.cs`. |
| `UI/Tabs/ShiftsTab.cs` | 435 | VenueManager plugin | Medium size, not urgent. |
| `UI/Tabs/VenuesTab.cs` | 322 | VenueManager plugin | Medium size, not urgent. |
| `UI/Tabs/SalesTab.cs` | 295 | VenueManager plugin | Medium size, not urgent. |
| `XIVAppApiModels.cs` | 370 | VenueManager plugin | Pure DTOs — size is expected and not a splitting concern. |

No equivalent line-count pass was run against `apps/web`/`apps/*` in this stage — knip and jscpd don't surface file size directly, and no manual `wc -l` sweep of the TypeScript codebase was done. Note as a gap: Stage 2 (or a Stage 1 follow-up) should run a quick `wc -l` pass over `apps/web/app` and `apps/web/components` if oversized-file triage there is wanted — `apps/web/lib/shift-bot.ts` (flagged for duplication above) and `apps/web/components/shifts-week-view.tsx` (also flagged) are reasonable starting guesses given how much internal duplication both contain, but this wasn't verified against a line count in this pass.

## Other observations

- **Rate-limit response duplication is security-relevant, not just style.** The 429-response-building logic (headers, `Retry-After` math) is now maintained in three places (`plugin-rate-limit.ts` twice internally, `[...nextauth]/route.ts` once) — a future change to the rate-limit response contract (e.g. adding a header) risks silently missing one of the three copies. Worth prioritizing over purely cosmetic duplication.
- **`ts-node` unlisted binary in `apps/discord-bot`** (see Unused dependencies section) is worth checking together with the `tsx` unused-devDependency flag in `apps/web` — two different workspaces both have loose ends around their TS-script runners.
- **Known pre-existing item, reconfirmed relevant:** the `metro-*` pnpm overrides left over from the removed mobile app were not specifically re-checked in this pass (out of scope for knip/jscpd/plugin tooling), but per prior project notes (mobile app removal marked superseded) these are still worth a Stage 2 cleanup line item if not already removed.
- **`pot-payroll` and `dashboard-analytics`/`manage-staff-role-dialog` false-positive risk:** several "unused" findings above (financial-calculations.ts, pot-payroll.ts types, dashboard-analytics.tsx, manage-staff-role-dialog.tsx) sit close to known in-progress or deferred features per project history (Pot payroll mode spec committed but implementation deferred). Stage 2 should check feature status before deleting any of these rather than treating "knip says unused" as sufficient justification alone.
- **eorzea-bot false-positive risk persists at a smaller scale even after the knip.json fix** — the `membership.ts`/`xp.ts` unused exports in `apps/eorzea-bot` are in the same directory family that caused the original 68% false-positive rate. The entry-pattern fix addressed the runtime `readdirSync()`-loaded command/event files specifically; these exports are in *utility* files imported by those handlers, which should now be traced correctly, but a manual grep-confirm before deletion is still cheap insurance given this workspace's track record in this same sweep.

## Summary counts

- **Dead code (knip):** 16 unused files, 55 unused exports, 23 unused exported types, 3 unused dependencies, 3 unused devDependencies, 1 unlisted binary. `packages/types` not covered by this config — out of scope for this pass.
- **Duplicate code (jscpd, clustered):** 336 raw pairwise clones (9.73% duplication) resolve to **8 real clusters** worth Stage 2 attention (5 HIGH/MEDIUM in `apps/web` TypeScript, 1 flagged-but-do-not-blanket-merge cluster in TSX/JSX), plus 20 files sharing the single largest cluster (plugin-route auth boilerplate).
- **Plugin structural duplication (manual pass):** 9 clusters (4 HIGH, 2 MEDIUM, 3 LOW), 0 dead-code findings (non-exhaustive).
- **Oversized files:** 1 clear splitting candidate (`Plugin.cs`, 1,486 lines, god-object) — flagged for Stage 2 scoping, not fixed here. No equivalent TypeScript-side line-count pass was run; flagged as a gap.
