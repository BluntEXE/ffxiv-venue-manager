# Development Journey

A chronological record of how XIV Venue Manager was designed, built, and hardened — from initial concept to production system.

For the engineering depth behind specific decisions, see the [case study](../../CASE_STUDY.md) and [engineering docs](./engineering/).

---

## Phase 1: Problem and concept (November 2025)

The problem was concrete: FFXIV venue operators were tracking patron attendance, staff shifts, sales, and payroll in Google Sheets and Discord. Every venue re-invented the same broken system.

The insight: Dalamud exposes plugin APIs for the game client. A plugin could observe game events (zone changes, party arrivals, chat) and push them somewhere structured. Pair that with a web dashboard and the spreadsheet workflow becomes real software.

Initial scope defined: two-part system. Plugin handles in-game capture. Web app handles everything else. Plugin is the primary action surface; website is analytics and fallback.

---

## Phase 2: Web app foundation (December 2025)

Built the core data model and API from scratch:

- PostgreSQL schema: venues, memberships, events, services, transactions
- Discord OAuth via NextAuth for browser auth
- Per-user API keys for plugin auth (later hashed — see security audit)
- Role-based permission model: Owner, Manager, Staff with granular visibility settings
- Staff invite system via unique links (no email required)
- Task management, service catalog, transaction logging

Stack decisions locked in: Next.js App Router, TypeScript strict, Prisma, self-hosted Postgres + Redis via Docker Compose.

---

## Phase 3: Plugin development (January 2026)

Built the C# Dalamud plugin (~5k LOC):

- Zone-change detection for patron arrival/departure
- Party event hooks for tracking who enters the venue
- Chat command system: `/venue`, `/vm`, `sale!`, `target!`
- Staff shift clock-in/out
- Plugin↔web HTTP contract deliberately kept small and stable (12 routes, treated as a versioned API surface)
- API key auth from the plugin side; no OAuth dance possible from inside a game client

---

## Phase 4: Real-time and analytics (February–March 2026)

- Server-Sent Events (SSE) for the live patron feed — unidirectional, no WebSocket overhead, survives reverse proxies
- In-process `venueEventBus` per venue; documented future migration to Redis pub/sub if multi-replica needed
- Analytics dashboards: patron flow, revenue trends, staff hours
- Payroll generation from shift + transaction data
- Partake.gg event sync integration
- Daily sales summary, event status automation, and event reminder cron jobs via Alpine container

---

## Phase 5: Security audit (April 2026)

Six months in, ran a full line-by-line security audit. **18 findings: 4 Critical, 6 High, 7 Medium, 5 Low.**

Key fixes:

- **API keys hashed at rest** — migration handled without logging out active plugin users (backfill + soak window + column drop)
- **Secrets out of docker-compose.yml and Dockerfile** — moved to `env_file: .env`, never baked into image layers
- **Rate limiting on all routes** — ioredis-backed, replaced dead Upstash REST integration that had been silently failing
- **Plugin RL ordering bug discovered post-audit** — rate limit was running *after* key validation, leaving keyspace open to brute-force. Fixed: IP throttle now runs first, before any DB work
- **IDOR on feedback endpoint fixed**, **40 membership queries gained active status filter**, **cron auth made timing-safe**
- **SSH password auth disabled**, ed25519 keys only

Intentionally deferred with documented triggers: CSP nonces, DB password rotation.

Full audit status in [security.md](./engineering/security.md).

---

## Phase 6: Mobile companion app (May 2026)

Added a React Native / Expo mobile app targeting Android (iOS deferred — cost):

- Monorepo restructure: `apps/web`, `apps/mobile`, `packages/*` via pnpm workspaces + Turborepo
- Discord OAuth adapted for mobile: 15-min JWT + 30-day refresh token in `expo-secure-store`
- Tamagui for UI, Expo Router for navigation
- EAS Build for Android APK — blocked and unblocked across several dependency issues (pnpm lock file missing, metro major version conflict, splash config, JSX parse error)
- Push notification pipeline: cron-poll pattern matching existing `/api/cron/*` convention
- Settings, follow/unfollow venues, contextual auth prompt for guests

---

## Phase 7: Security hardening continued (May 2026)

- **Nonce-based CSP** — `unsafe-inline` and `unsafe-eval` removed from `script-src`. Per-request nonce generated in `proxy.ts`, stamped automatically on all Next.js `<script>` tags. CSP moved from `next.config.ts` (static) to `proxy.ts` (per-request).
- **Adminer** added to Docker Compose stack — previously a standalone container with no restart policy; now managed alongside the rest of the stack on port 8080.
- **Deprecated headers cleaned up** — `interest-cohort` removed from Permissions-Policy.

---

## Where it stands (May 2026)

| Metric | Value |
|---|---|
| Total LOC | ~24,400 (19,419 TS/TSX + 4,981 C#) |
| API routes | 55 |
| Database tables | 19 |
| Containers | 7 (web, postgres, redis, cron, adminer, static-ehno, reverse proxy) |
| Security findings | 17/18 closed; 1 deferred (DB password, internal network only) |
| Development span | December 2025 – present |

One open security item: DB password rotation (M6 — weak password, internal Docker network only, not externally exposed).
