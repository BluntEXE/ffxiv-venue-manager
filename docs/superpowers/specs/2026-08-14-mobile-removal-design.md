# Mobile App Removal — Design

## Purpose

The `apps/mobile` Expo/React Native app is being retired (superseded decision, not up for debate — see `docs/superpowers/plans/2026-08-11-codebase-cleanup-roadmap.md`). This spec covers fully removing it — app, backend API surface, and DB schema — without breaking anything else in the XIV Venue Manager ecosystem, and without touching production during the current live event.

This is sub-project 1 of a larger two-part effort: mobile removal, then a codebase-wide duplication/shared-helper sweep across `xiv-app` and the `VenueManager` plugin repo. Sub-project 2 is intentionally out of scope here.

## Audit findings (read-only investigation, completed 2026-08-14)

- **`apps/mobile`** — zero shared-package coupling. No imports from `@xiv-venue-manager/*` or `packages/*`. All deps are third-party (Expo, Tamagui, React Native). Pure deletion, no ripple into shared code.
- **Mobile API routes** — 25 routes under `apps/web/app/api/mobile/**` (not the 20 originally assumed; audit found 5 more: `discover/open-now`, `discover/tonight`, `ping`, `venues/[venueId]`, plus the original 20). All are self-contained aside from shared-lib imports (`lib/prisma`, `lib/middleware/with-rate-limit`, `lib/shift-audit`, `lib/venue-status`, `lib/discord-webhook`, `lib/validation`, `lib/api/transactions`) — all of those are heavily used by non-mobile code too and must NOT be touched.
- **Mobile-exclusive lib files** (confirmed zero references outside `app/api/mobile/**`): `apps/web/lib/mobile-auth-guard.ts`, `apps/web/lib/mobile-operator-auth.ts`, `apps/web/lib/auth/mobile-auth.ts`.
- **Prisma schema:**
  - Safe to drop (100% mobile-exclusive): `RefreshToken`, `NotificationPreference`.
  - Safe to drop, but requires code surgery: `DeviceToken` — written only by mobile, but read by the non-mobile cron `app/api/cron/dispatch-notifications/route.ts` and `app/api/cron/poll-push-receipts/route.ts`. Decision (made 2026-08-14): drop the table AND strip the now-dead push-notification-send branch from both cron routes, rather than leaving a no-op query behind.
  - Must NOT drop (shared/core, used well beyond mobile): `VenueFollow`, `PendingNotification`.
- **Other apps** (`discord-bot`, `eorzea-bot`, `shout-crafter`, `packages/*`) — zero consumers of `/api/mobile/**` or mobile-only tables. Clean boundary.
- **CI/build** — nothing in CI builds or references mobile functionally. One cosmetic stale comment in `.github/workflows/security.yml` (~line 70) mentioning "mobile build tooling" — update for accuracy, no functional change.
- **Docs** — `docs/superpowers/plans/2026-08-11-codebase-cleanup-roadmap.md` already documents the deprecation decision and correctly flags `/api/mobile/*` as removal candidates. No other current (non-superseded) doc treats mobile as active/planned.

## Approach: staged removal

Chosen over a single-pass removal because the DB drop is the one irreversible step, and deploying the code removal first gives a real signal (errors or silence) about whether anything was missed — before anything gets dropped. Also required by production safety: **a live event is in progress**, so no deploy or DB change happens until it ends.

### Stage 1 — Code removal (local branch, zero prod risk)

- Delete `apps/mobile/` entirely.
- Delete all 25 routes under `apps/web/app/api/mobile/**`.
- Delete the 3 mobile-exclusive lib files.
- Update `apps/web/prisma/schema.prisma`: remove `RefreshToken`, `NotificationPreference`, `DeviceToken` models (schema edit only — no migration run yet, that's Stage 4).
- Edit `app/api/cron/dispatch-notifications/route.ts` and `app/api/cron/poll-push-receipts/route.ts` to remove the push-notification-send branch that depended on `DeviceToken`.
- Fix the stale comment in `.github/workflows/security.yml`.
- Update the roadmap doc to mark mobile removal as done.
- Full regression pass: `npx vitest run && npx tsc --noEmit && pnpm build`.
- Commit, push to a branch (not deployed yet).

### Stage 2 — Deploy + soak (holds until live event ends)

- Merge/push to main.
- Deploy via `~/bin/deploy-xiv-web.sh --green` (zero-downtime blue-green).
- Soak window on GlitchTip: since the audit found zero external consumers of the mobile API surface, any error referencing `/api/mobile/*` or the deleted lib files during this window means the audit missed something, and should be investigated before proceeding to Stage 3.

### Stage 3 — DB drop (Tuesday maintenance window, 09:00–11:00 UTC)

- Manual `pg_dump` backup first (standing rule, non-negotiable for schema/DDL work).
- Run the Prisma `db push` (per this project's established no-migrations-table workflow) to actually drop `RefreshToken`, `NotificationPreference`, `DeviceToken` from the live schema.
- Verify via direct `psql` query that the tables are gone and no other table references them (FK check).

## Out of scope

- The codebase-wide duplication/shared-helper sweep (sub-project 2) — separate spec, separate plan, happens after this ships.
- Any change to `VenueFollow` or `PendingNotification` — confirmed shared/core, untouched by this work.
- Any change to non-mobile parts of the cron routes beyond removing the dead push-send branch.
