# Codebase Cleanup Roadmap

> This is a **roadmap of plans**, not a single executable plan. Per `superpowers:writing-plans` scope-check guidance, each phase below covers an independent subsystem and gets its own detailed plan (written via `superpowers:writing-plans`, executed via `superpowers:subagent-driven-development` or `superpowers:executing-plans`) when it's next up.

**Goal:** Reduce duplication across `~/xiv-app` (web) and `~/VenueManager` (plugin), replace inline WHAT-comments with living docs/specs while preserving WHY-rationale, without touching the fragile recently-shipped feature areas until they've settled.

**Scope:** apps/web + VenueManager plugin. Mobile excluded (deferred — team may pivot to Aetherphone integration instead of mobile app polish).

**Source scans:** web app scan (2026-08-11), plugin scan (2026-08-11) — see conversation for full findings.

---

## Ground rules for every phase

1. **Fragile-feature freeze.** Do not touch patron tracking, VIP tracking, ban list, room status board, or bar inventory mapping (web tables) — nor `LifestreamIpc.cs` / `TerritoryUtils.cs` / house-entry polling (plugin) — until their "in-game verify" / "-testing" status is resolved. Cross-check current status against memory before starting any phase that brushes these.
2. **One phase = one PR/branch.** No bundling. Verify (tests/manual) before moving to the next phase.
3. **Comments:** don't blanket-strip. Extract WHY-rationale to docs first (Phase 5), then thin comments in the same diff. WHAT-comments (redundant) can go immediately wherever encountered, no separate phase needed.
4. **Docs destination:** `docs/specs/<feature>.md` per feature area, created/updated as each phase touches that area. Commit messages still carry the immediate "why" for the change itself (existing convention, unchanged).

---

## Phase 1 — Web: date/time formatting consolidation — **DONE, deployed 2026-08-12**
**Risk: low.** Read-only display pages mostly; 2 files (staff-table, shifts-calendar) touch scheduling — treat those as medium.

Replace hand-rolled `toLocaleDateString`/`toLocaleTimeString`/`Intl.DateTimeFormat` calls (28 files) with `lib/server-time.ts`. Fix `events/new/page.tsx`'s direct `Intl.DateTimeFormat` call. Swap `analytics/page.tsx:304`'s inline gil-compact logic for the existing `formatGilCompact` helper while in the area.

**Verify:** visual diff per page (dates render identically), no logic change.

Shipped as the detailed [server-time-consolidation plan](2026-08-11-server-time-consolidation.md) — scope expanded mid-flight (viewer-local time split, `formatLocalTime`/`<LocalTime>`) per direct stakeholder direction, plus caught/fixed two real scheduling bugs (overnight shifts, event-creation timezone) along the way. Commits `369bb93` and earlier pushed to `origin/main` and deployed via `deploy-xiv-web.sh --green` 2026-08-12 — 13/13 smoke checks passed, tests 10/10.

## Phase 2 — Plugin: shared HTTP request wrapper — **DONE, verified in-game (2026-08-11)**
**Risk: low.** Pure refactor behind the existing `XIVAppApiClient` seam, no hooks/game-state involved.

Add a single `SendAsync<T>` (or similar) helper to `XIVAppApiClient` that owns the `GetAsync → IsSuccessStatusCode → ReadFromJsonAsync → catch(HttpRequestException)/catch(TaskCanceledException)/catch(Exception)` shape. Migrate `XIVAppVenueApi.cs` (11 try/catch → ~1), `XIVAppShiftApi.cs`, `XIVAppPatronApi.cs` (4 each) onto it.

**Verify:** existing behavior unchanged — each migrated call site should produce identical success/error handling; smoke-test one call per API class against the live server.

Shipped as `~/VenueManager` commits `ae91426`..`09caa87`, released as **v3.10.7-testing** (2026-08-11), live-verified in-game by the user.

## Phase 3 — Web: shared client fetch/error wrapper (low-stakes surfaces only) — **DONE, deployed 2026-08-12**
Detailed plan: [2026-08-12-shared-fetch-toast-wrapper.md](2026-08-12-shared-fetch-toast-wrapper.md).

**Risk: low, if scoped correctly.** Start on `feedback-dialog`, `banner-upload`, `logo-upload`, `venue-follow-button` — explicitly **not** patron/VIP/ban-list/room-status.

Build `apiFetch()`/mutation hook to replace raw `fetch` + `try/catch` + `alert()`. Wire an actual toast library (none currently used — 0 hits for sonner/use-toast) as part of this, since `alert()` is the current fallback everywhere.

Shipped via `superpowers:subagent-driven-development` (7 tasks, each with spec-compliance + code-quality review gates) in worktree `worktree-shared-fetch-toast-wrapper`, merged to `main` and deployed 2026-08-12. Added `sonner` + themed `<Toaster>`, `lib/api-fetch.ts` (`apiFetch`/`ApiError`, prefers server's `message` field over `error`, 8 unit tests), migrated all 4 target components — fixed a real silent-failure bug in `venue-follow-button.tsx` (follow/unfollow errors were previously swallowed with zero user feedback) and added in-flight guards to `banner-upload`/`logo-upload`'s `remove()` (found during review, missing in the original code too). Standardized error-copy register to "Failed to X. Please try again." across all 4 components. Live-verified post-deploy: feedback dialog, follow/unfollow, and the upload UI all mount and behave correctly with zero console errors.

**Separate finding during Phase 3 QA, not a regression:** `/discover` throws a real React hydration error (#418) on every page load — reproduced twice, does not occur on `/privacy` or dashboard/settings pages, and the globally-mounted `<Toaster>` doesn't explain it (would fire everywhere if it did). Pre-existing, likely from the Phase 1 date-formatting work. Needs its own investigation — not yet triaged.

**Verify:** manual QA on the 4 target surfaces — success + error + network-failure paths.

## Phase 4 — Plugin: shared tab base + web: packages/ hoisting
**Risk: medium.** Touches every tab's entry point (plugin) — no hooks/game-state, verify visually. Web packages/ move is low risk (mechanical) but do after Phase 1/3 land so there's less to move twice.

- Plugin: introduce `ITab`/base-tab abstraction for the 8 tab classes (`VenuesTab`, `SettingsTab`, `GuestsTab`, `GuestLogTab`, `SalesTab`, `ShiftsTab`, `RoomsTab`, `InventoryTab`) currently drawn ad hoc by `MainWindow`.
- Web: hoist `lib/format.ts`, `lib/server-time.ts`, `lib/validation.ts` into `packages/` now that mobile is deferred — do only if/when a second consumer actually needs them; otherwise defer indefinitely (YAGNI — don't hoist for a consumer that doesn't exist yet).

**Verify:** every tab still opens/closes/draws correctly (plugin); web build + existing tests pass after the move.

## Phase 5 — Docs: extract WHY-rationale, thin comments
**Risk: low, mechanical, but needs care not to lose rationale.**

- Plugin: `Plugin.cs` (309 comment lines, ~10 multi-line rationale blocks — debounce timing, DTR cache coordination, mutex `WaitAsync(0)` reasoning) → extract into `docs/ARCHITECTURE.md`. Same for `SettingsTab.cs` (85 lines, UX/gating rationale).
- Web: as each phase above touches a file, move any WHY-comments found into the matching `docs/specs/<feature>.md`, strip WHAT-comments on sight.
- This phase is largely folded into Phases 1-4's diffs rather than a standalone sweep — the "big two" plugin files are the only piece large enough to warrant dedicated time.

**Verify:** grep for `//`/`///` post-cleanup to confirm no orphaned rationale was deleted outright (moved, not lost).

## Deferred (catalogued, not scheduled)
- ~~Web: shared `DataTable` primitive for staff-table/patron-profiles-table/ban-list-manager/rooms-board — defer until those feature areas are confirmed stable (in-game verify resolved).~~ **Done, deployed 2026-08-12** — [2026-08-12-shared-data-table.md](2026-08-12-shared-data-table.md). Built via subagent-driven-development (6 tasks, spec+quality review gates each). One real code-review catch fixed along the way: staff-table.tsx's migration initially left dead Tailwind classes silently overridden by globals.css's unlayered `.dtable` rules — caught and fixed before merge. Live-verified at desktop and 375px widths across all 4 tables.
- Web: zod validation registry widened to remaining 133/135 API routes — do incrementally, admin/low-traffic routes first, once Phase 3's pattern is proven.
- Mobile app — out of scope, may be superseded by Aetherphone integration.
- ~~**Product decision raised 2026-08-12, not yet built:** shift times currently render in Server Time (ST)...~~ **Done, deployed 2026-08-12** — [2026-08-12-shift-local-time.md](2026-08-12-shift-local-time.md). Decided: shifts week grid and calendar tab now render in viewer-local time (mount-guarded, matching the `<LocalTime>` hydration-safe pattern); plugin-facing claim/cancel/reminder notification text stays in ST (shared roster content, no single "owner" viewer). Built via subagent-driven-development (5 tasks). Caught and fixed two real hydration-mismatch risks during review: the calendar tab's `todayKey` reading a live clock pre-mount (same bug class as the day's #418 incident — fixed by threading a server-computed `todayKeyST` prop through, matching the week view's existing pattern), and a pre-existing 12h/24h format mismatch in the day-dialog's duplicate-shift prefill. Also traced and closed out a recurring production #418 hydration error on this same page during the session — root cause was a stale client bundle held open across today's unusually high number of blue-green deploys, not a code bug; confirmed via clean reproduction in a fresh private tab. Merged to `main` (`0fc8c86`), deployed via `deploy-xiv-web.sh --green`, 13/13 smoke checks passed.
- ~~**Bug, found 2026-08-11 while creating test shift data:** overnight shifts couldn't be scheduled at all.~~ **Fixed 2026-08-12**, commit `a52d696` (worktree `shift-event-timezone-fixes`, merged to `main`, not yet deployed). `create-shift-dialog.tsx` now rolls the end date to the next day when the end time is earlier than the start.
- ~~**Bug, found 2026-08-11 while creating a test event:** event creation silently used the operator's browser timezone with no indication, while shift creation forced literal Server-Time digits with no indication either — two different unlabeled input models.~~ **Fixed 2026-08-12**, same commit. Resolved by standardizing on "operator enters in their own local time, app converts to UTC for storage" for both forms (matching how `DateTimePicker` already behaved, and how the dashboard now displays times back to viewers in their own local time) — not by forcing literal Server-Time input as originally proposed below. Server Time (ST) stays the model only for things with no single "owner" of the input: opening hours, Discord/broadcast text. Both forms now explicitly labeled "your local time." Guide pages (`guide/owner`, `guide/staff`) updated to match.

---

## Next step
Phase 1 is the safest, most mechanical starting point (no behavior change, easy visual verification, doesn't touch fragile areas). Recommend writing the full detailed `writing-plans`-format plan for Phase 1 next.
