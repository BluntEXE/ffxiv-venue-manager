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

## Phase 1 — Web: date/time formatting consolidation
**Risk: low.** Read-only display pages mostly; 2 files (staff-table, shifts-calendar) touch scheduling — treat those as medium.

Replace hand-rolled `toLocaleDateString`/`toLocaleTimeString`/`Intl.DateTimeFormat` calls (28 files) with `lib/server-time.ts`. Fix `events/new/page.tsx`'s direct `Intl.DateTimeFormat` call. Swap `analytics/page.tsx:304`'s inline gil-compact logic for the existing `formatGilCompact` helper while in the area.

**Verify:** visual diff per page (dates render identically), no logic change.

## Phase 2 — Plugin: shared HTTP request wrapper
**Risk: low.** Pure refactor behind the existing `XIVAppApiClient` seam, no hooks/game-state involved.

Add a single `SendAsync<T>` (or similar) helper to `XIVAppApiClient` that owns the `GetAsync → IsSuccessStatusCode → ReadFromJsonAsync → catch(HttpRequestException)/catch(TaskCanceledException)/catch(Exception)` shape. Migrate `XIVAppVenueApi.cs` (11 try/catch → ~1), `XIVAppShiftApi.cs`, `XIVAppPatronApi.cs` (4 each) onto it.

**Verify:** existing behavior unchanged — each migrated call site should produce identical success/error handling; smoke-test one call per API class against the live server.

## Phase 3 — Web: shared client fetch/error wrapper (low-stakes surfaces only)
**Risk: low, if scoped correctly.** Start on `feedback-dialog`, `banner-upload`, `logo-upload`, `venue-follow-button` — explicitly **not** patron/VIP/ban-list/room-status.

Build `apiFetch()`/mutation hook to replace raw `fetch` + `try/catch` + `alert()`. Wire an actual toast library (none currently used — 0 hits for sonner/use-toast) as part of this, since `alert()` is the current fallback everywhere.

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
- Web: shared `DataTable` primitive for staff-table/patron-profiles-table/ban-list-manager/rooms-board — defer until those feature areas are confirmed stable (in-game verify resolved).
- Web: zod validation registry widened to remaining 133/135 API routes — do incrementally, admin/low-traffic routes first, once Phase 3's pattern is proven.
- Mobile app — out of scope, may be superseded by Aetherphone integration.

---

## Next step
Phase 1 is the safest, most mechanical starting point (no behavior change, easy visual verification, doesn't touch fragile areas). Recommend writing the full detailed `writing-plans`-format plan for Phase 1 next.
