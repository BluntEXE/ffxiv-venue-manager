# Codebase-Wide Duplication & Tidy-Up Sweep — Design

## Purpose

This is sub-project 2 of the two-part effort that began with mobile removal (sub-project 1, complete — see `docs/superpowers/specs/2026-08-14-mobile-removal-design.md`). The goal is not just tidiness for its own sake — it's collaboration-readiness. A second developer (Frogge, per the confirmed vertical-slicing collaboration split — see `docs/` for the split docs) needs to be able to read this code without tribal knowledge. That means: fewer near-duplicate implementations to get confused between, no dead code pointing nowhere, and the non-obvious WHY captured somewhere discoverable — architecture docs, not inline comments, same discipline as the VenueManager plugin's `docs/ARCHITECTURE.md` (Phase 5, 2026-08-14): comments stay terse WHY-anchors or pointers, the real reasoning lives in a doc.

## Scope

**Repos in scope:**

- `apps/web` (xiv-app, the largest codebase — 368 TS/TSX files)
- `apps/discord-bot` (3 files — minimal, included for completeness)
- `apps/eorzea-bot` (38 files)
- `apps/shout-crafter` (20 files)
- `~/VenueManager` (the Dalamud plugin, C#, 35 files)

**Out of scope:**

- `xiv-admin` — personal ops TUI, not part of the XIV Venue Manager product itself
- Any new features or behavior changes — this is pure structural cleanup, verified by existing test suites + typecheck + build at every step, never a functional rewrite
- Mobile removal Stage 3 (DB drop) — separate, already tracked, held for the next Tuesday maintenance window

**Tidying angles included** (beyond just "extract duplicated code into helpers"):

- Dead code / unused exports / unused files
- Unused dependencies in `package.json`s
- Duplicate code blocks worth consolidating into shared helpers
- Oversized files that have grown past a single clear responsibility (candidates for splitting)
- Inconsistent patterns not touched by the earlier zod-validation rollout — e.g. error-response shapes across API routes, logging conventions
- Dead config/env vars no longer read anywhere

## Approach: tool-first, then targeted triage

Rather than having agents read through 400+ files hoping to spot patterns by eye (slow, and misses things a human skim would too), run actual dead-code/duplication tooling first to get concrete signal, then dispatch targeted review only on what the tools flag.

- **TS/JS repos** (`apps/web`, `apps/discord-bot`, `apps/eorzea-bot`, `apps/shout-crafter`): `knip` (unused files/exports/deps) and `jscpd` (duplicate code blocks, similarity threshold ~70%+, tunable once real output is seen) as dev dependencies at the `xiv-app` monorepo root.
- **C# plugin**: no automated dupe-detector fits a codebase this size well. Instead, an agent-driven structural pass — grep for repeated method shapes, repeated ImGui draw blocks, repeated validation/parsing patterns.

## Staged execution

Findings aren't known yet, so a full task-by-task fix plan can't honestly be written until the tools have actually run. Three stages, each planned/executed after the previous one lands:

### Stage 1 — Tooling + findings report

- Add `knip` and `jscpd` as dev dependencies, configured to scan the four TS/JS apps (excluding generated/build dirs; `apps/mobile` is already gone).
- Run both, capture output.
- Run the agent-driven structural pass on the VenueManager plugin.
- Compile everything into one findings report: dead exports/files, unused deps, duplicate code blocks, oversized files, and a manual note-down of inconsistent error/logging patterns spotted along the way.
- This stage produces a report, not code changes. The report is what Stage 2 gets planned from.

### Stage 2 — Triage + fix

- Each finding gets one of: extract-to-helper, delete-dead-code, remove-unused-dep, or leave-with-noted-reason (e.g. intentionally duplicated for isolation, or a false positive from the tooling).
- Executed in increments via subagent-driven-development, same review-gated pattern as the zod-validation rollout and mobile removal (implementer → spec-compliance review → code-quality review per increment).
- No behavior changes — every increment verified by existing tests + typecheck + build, and for `apps/web` changes, the same live-verification discipline used throughout this project (disposable test venue, real authenticated checks) before considering an increment done.
- No documentation writing in this stage — the codebase structure is still shifting increment to increment, so docs would need rewriting mid-stream.

### Stage 3 — Architecture docs

- Written once, after Stage 2's structure has settled.
- `xiv-app` gets its own `docs/ARCHITECTURE.md` (doesn't currently exist), covering the subsystems a new collaborator needs oriented on: auth/session flow, the plugin-sync surface (`/api/plugin/*`), shift/payroll logic, the Discord bot integrations, the blue-green deploy model.
- The VenueManager plugin's existing `docs/ARCHITECTURE.md` (from Phase 5) is extended, not rewritten, to cover whatever Stage 2 restructured there.
- Same discipline as Phase 5: inline comments stay as short WHY-anchors or pointers into the doc; the doc carries the real reasoning.

## Verification

- Every Stage 2 increment: existing test suite + typecheck + build must pass before/after.
- No new features, no behavior changes — a diff that isn't traceable to "this is now less duplicated / less dead / more consistent" is out of scope for this sweep.
- Deploys follow the existing blue-green discipline (`deploy-xiv-web.sh --green`), same as every other change to `apps/web` this project has made.
