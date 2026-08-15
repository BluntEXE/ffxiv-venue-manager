# Local Full-Stack Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a laptop-local copy of the XIV Venue Manager stack (Postgres + Redis + Next.js web app) plus a way to point the VenueManager Dalamud plugin at it, so codebase-sweep Stage 2 can be verified locally instead of against prod via disposable test venues.

**Architecture:** A second, localhost-bound docker-compose file (`docker-compose.local.yml`) runs Postgres 16 and Redis 7 on loopback-only ports, separate from the prod compose file which binds to the server's LAN IP. `apps/web` runs via `pnpm dev` directly on the host (not containerized) against that local Postgres/Redis, using a new `.env.local` (gitignored) with locally-generated secrets. Discord OAuth reuses the existing production Discord application by adding a `localhost` redirect URI — no new Discord app needed. A disposable `TEST_VENUE`-typed venue is created through the running app's real UI/API (matching the existing prod-verification convention, e.g. "Velvet Rift"), not via a seed script, since the schema has no seed script today and one isn't needed for a single test fixture. The plugin's existing `xivAppServerUrl` config field (already user-editable in Settings tab, defaults to `https://xivvenuemanager.com`) is repointed to `http://localhost:3000` for local integration testing — no plugin code changes required.

**Tech Stack:** Docker Compose, Postgres 16, Redis 7, pnpm/Next.js/Prisma (`prisma db push`, no migrations table), NextAuth (Discord OAuth provider), ioredis (`REDIS_URL`), existing VenueManager C# plugin `Configuration.xivAppServerUrl`.

---

## Ground truth this plan relies on (verified against the actual repo before writing this)

- Prod `docker-compose.yml` binds `postgres` to `192.168.1.122:5432` and has no `redis` port mapping at all (only reachable inside the compose network) — neither is safely reusable for a local run without a separate file.
- `apps/web` has no seed script (`find . -iname "*seed*"` turned up nothing relevant). `TEST_VENUE` is a `VenueType` enum value (`prisma/schema.prisma:274`), created ad hoc through the app, not a fixture loader.
- `lib/redis.ts`: real runtime Redis is `ioredis` via `REDIS_URL`. It fails open (`redis` export is `null`) if `REDIS_URL` is unset — the app boots fine without Redis.
- `lib/rate-limit.ts`: `checkLimit()` falls back to an in-memory limiter whenever `ready()` is false (no Redis) or Redis throws. So a working local Redis is nice-to-have for realistic rate-limit testing, not a hard requirement to boot the app.
- `.env.example`'s `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`/`QSTASH_*` vars have **zero code references** anywhere in `apps/web` (`grep -rl` came back empty) — stale example-file cruft, not needed in `.env.local`.
- `lib/auth.ts` requires real `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` (Discord's NextAuth provider, no dev bypass). `cookies` domain-scoping (`.xivvenuemanager.com`) only applies when `NODE_ENV === "production"`, so local `NODE_ENV=development` sessions work fine on plain `localhost`.
- Plugin: `VenueManager/Configuration.cs:58` — `xivAppServerUrl` defaults to `"https://xivvenuemanager.com"` and is a plain persisted config string, already exposed as an editable field in `VenueManager/UI/Tabs/SettingsTab.cs` (`DefaultServerUrl` constant there is just the placeholder shown when the field is empty). Repointing it is a UI action, not a code change.

---

## Task 1: Local Postgres + Redis compose file

**Files:**
- Create: `docker-compose.local.yml`
- Modify: `.gitignore` (confirm `docker/postgres-local/` and `.env.local` are excluded)

- [ ] **Step 1: Write the compose file**

```yaml
# docker-compose.local.yml
# Laptop-local Postgres + Redis for testing against instead of prod.
# Loopback-only ports - do not reuse docker-compose.yml (that one binds
# to the server's LAN IP and is meant to run on the server).
services:
  postgres-local:
    image: postgres:16-alpine
    container_name: xiv-app-postgres-local
    ports:
      - "127.0.0.1:5433:5432"
    environment:
      - POSTGRES_PASSWORD=localdev
      - POSTGRES_DB=venue_manager
    volumes:
      - ./docker/postgres-local/data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis-local:
    image: redis:7-alpine
    container_name: xiv-app-redis-local
    command: redis-server --save "" --appendonly no
    ports:
      - "127.0.0.1:6380:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
```

Note the non-default host ports (`5433`, `6380`) — this avoids colliding with any Postgres/Redis you might already have running locally on the standard ports.

- [ ] **Step 2: Check `.gitignore` covers the local data dir and env file**

Run: `grep -E "docker/postgres-local|\.env\.local" .gitignore`

Expected: no output (not yet present). Add these two lines to `.gitignore` if missing:

```
docker/postgres-local/
.env.local
```

- [ ] **Step 3: Bring the local stack up**

Run: `docker compose -f docker-compose.local.yml up -d`
Expected: both `xiv-app-postgres-local` and `xiv-app-redis-local` report `healthy` within ~15s — check with `docker compose -f docker-compose.local.yml ps`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.local.yml .gitignore
git commit -m "chore: add local docker-compose for postgres+redis"
```

## Task 2: Local env file

**Files:**
- Create: `.env.local` (gitignored, not committed)

- [ ] **Step 1: Generate secrets**

```bash
NEXTAUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
CRON_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
echo "NEXTAUTH_SECRET=$NEXTAUTH_SECRET"
echo "CRON_SECRET=$CRON_SECRET"
```

- [ ] **Step 2: Write `.env.local`**

```env
# Local full-stack copy - see docs/superpowers/plans/2026-08-15-local-fullstack-copy.md
DATABASE_URL="postgresql://postgres:localdev@localhost:5433/venue_manager"
DIRECT_URL="postgresql://postgres:localdev@localhost:5433/venue_manager"

NEXTAUTH_SECRET="<paste generated NEXTAUTH_SECRET here>"
NEXTAUTH_URL="http://localhost:3000"

# Reuses the production Discord app - see Task 2 Step 3 for the one manual
# step needed (adding a localhost redirect URI in the Discord dev portal).
# Pull the real values from the server's .env (ask before doing this - it's
# a live credential, don't paste it into chat/logs).
DISCORD_CLIENT_ID="<same as prod>"
DISCORD_CLIENT_SECRET="<same as prod>"

CRON_SECRET="<paste generated CRON_SECRET here>"

REDIS_URL="redis://localhost:6380"

NODE_ENV="development"
```

- [ ] **Step 3: One-time manual step — add localhost redirect URI to the Discord app**

This is a manual action in the Discord Developer Portal, not something to script or automate:
1. Go to https://discord.com/developers/applications, open the XIV Venue Manager app.
2. OAuth2 → Redirects → add `http://localhost:3000/api/auth/callback/discord`.
3. Save.

Discord supports multiple redirect URIs per app, so this is additive and doesn't touch the prod redirect.

**Ask the user to confirm they've done this step before moving on** — Task 3's login verification depends on it, and it requires portal access this session doesn't have.

- [ ] **Step 4: No commit** — `.env.local` is gitignored by design (contains real Discord secrets pulled from prod). Nothing to commit this task.

## Task 3: Boot the web app and verify the full local loop

**Files:** none created/modified — verification only.

- [ ] **Step 1: Install deps and generate the Prisma client**

Run: `pnpm install`
Expected: completes without error (workspace already has a lockfile).

- [ ] **Step 2: Push the schema to the local DB**

Run: `cd apps/web && pnpm db:push`
Expected: `prisma db push` reports the schema applied (creates all tables fresh since `docker/postgres-local/data` starts empty). This is the same `db:push` workflow used against prod — [[feedback_xiv_app_db_push_workflow]], no migrations table either way.

- [ ] **Step 3: Start the dev server**

Run: `pnpm dev` (from `apps/web`, or `pnpm --filter web dev` from repo root)
Expected: `Local: http://localhost:3000` printed, no startup errors. Check the terminal for `[redis] ready` (confirms `REDIS_URL` connected to `redis-local`) — if it instead logs a connect error, stop and diagnose before continuing (Task 1's Redis container should already be healthy).

- [ ] **Step 4: Sign in via Discord OAuth**

In a browser, visit `http://localhost:3000/auth/signin`, sign in with Discord. Expected: redirected back to the dashboard, logged in as yourself. This is the real end-to-end proof that `.env.local`'s Discord credentials + the Task 2 Step 3 redirect URI + `DATABASE_URL` (NextAuth's `PrismaAdapter` needs to write `User`/`Account`/`Session` rows) all actually work together.

If this fails: check Task 2 Step 3 was done (most likely cause), then check `pnpm dev`'s terminal output for the specific NextAuth error.

- [ ] **Step 5: Create a disposable local test venue**

Through the running app's normal UI (dashboard → create venue), create a venue. Name it something obviously disposable, e.g. `Local Test Venue`. This mirrors the existing prod-verification convention ([[project_venue_sync_plot_linking_patron_tracking]] and multiple zod-validation increments used "Velvet Rift"/"TestingOut" the same way) — a real venue through real app code, not a DB-inserted fixture, so it's the same code path Stage 2's later increments will actually exercise.

Optionally mark it as `TEST_VENUE` type if that's exposed in the venue-settings UI; if not exposed there, it's fine left as a normal venue type since it's a local throwaway DB anyway (no prod-safety reason to mark it here the way there is against the shared prod database).

- [ ] **Step 6: No commit** — this task is verification-only against a running local stack, nothing in the repo changes.

## Task 4: Point the plugin at the local server

**Files:** none — plugin config only, changed at runtime via its own UI, not source.

- [ ] **Step 1: Confirm the plugin is already loadable per the existing local-build workflow**

See [[project_dalamud_local_build_linux]] for the working build+inject commands — this task assumes that setup already works and only covers pointing an already-running plugin at the local server.

- [ ] **Step 2: Change the server URL in the plugin's Settings tab**

In-game, open the plugin's Settings tab, find the server URL field (backed by `Configuration.xivAppServerUrl`, `VenueManager/Configuration.cs:58`), change it from the default `https://xivvenuemanager.com` to `http://localhost:3000`.

- [ ] **Step 3: Verify a real round trip**

Trigger any plugin action that calls the API — e.g. open a tab that does an initial data fetch. Expected: the request lands in `pnpm dev`'s terminal output as an incoming request to a `plugin/*` route, and the plugin UI reflects the (empty, since it's a fresh local DB) response rather than erroring.

If the plugin requires an API key tied to a venue (check `XIVAppApiClient.IsConfigured` — needs `_apiKey` set too, not just `BaseUrl`): generate one from the local web app's dashboard (`plugin/keys` route, under the disposable venue created in Task 3) and paste it into the plugin's settings the same way you would against prod.

- [ ] **Step 4: No commit** — runtime plugin config only.

## Task 5: Document the setup

**Files:**
- Create: `docs/LOCAL_DEV.md`

- [ ] **Step 1: Write the doc**

```markdown
# Local Full-Stack Development

For testing changes (especially auth/rate-limit work, see the
codebase-sweep Stage 2 plan) against a real local stack instead of prod.

## One-time setup
1. `docker compose -f docker-compose.local.yml up -d` — starts local
   Postgres (`localhost:5433`) and Redis (`localhost:6380`).
2. Create `.env.local` — see
   `docs/superpowers/plans/2026-08-15-local-fullstack-copy.md` Task 2 for
   the exact contents. Discord `CLIENT_ID`/`CLIENT_SECRET` reuse the prod
   app; ask before pulling those values.
3. One-time manual step: add `http://localhost:3000/api/auth/callback/discord`
   as a redirect URI on the Discord app (dev portal, OAuth2 → Redirects).

## Every session
```bash
docker compose -f docker-compose.local.yml up -d   # if not already running
pnpm install
cd apps/web && pnpm db:push                          # only needed after a schema change
pnpm dev
```

Sign in at `http://localhost:3000/auth/signin` with Discord. Create/reuse a
disposable local venue for testing — this is a throwaway local DB, not
prod, so no special naming convention is required (unlike the
`TEST_VENUE`/"Velvet Rift" discipline used against the shared prod DB).

## Plugin against local
Change the server URL in the plugin's Settings tab from
`https://xivvenuemanager.com` to `http://localhost:3000`, and use a plugin
API key generated from the local dashboard. See
[[project_dalamud_local_build_linux]] for the plugin build+inject steps
themselves.

## Resetting
`docker compose -f docker-compose.local.yml down -v` wipes the local DB and
Redis entirely (the `-v` drops the named volume's backing dir under
`docker/postgres-local/data`) — re-run `pnpm db:push` after to rebuild the
schema.
```

- [ ] **Step 2: Commit**

```bash
git add docs/LOCAL_DEV.md
git commit -m "docs: add local full-stack dev setup guide"
```

---

## Self-review

**Spec coverage:**
- Local docker-compose variant, localhost-bound → Task 1. ✅
- `.env.local` with local DB/Redis URLs → Task 2. ✅
- Schema pushed via `prisma db push` → Task 3 Step 2. ✅
- Seed/test data (disposable venue + owner account) → Task 3 Steps 4-5. ✅
- `pnpm dev` running the web app → Task 3 Step 3. ✅
- Plugin pointed at localhost → Task 4. ✅
- Verified end-to-end → Task 3 Step 4 (login), Task 4 Step 3 (plugin round trip). ✅
- Stage 2 itself out of scope → confirmed, no task here touches auth/rate-limit code, only infra to test it later. ✅

**Placeholder scan:** `.env.local`'s Discord values are intentionally left as `<same as prod>` placeholders (Step 3 explains why: a live credential that shouldn't be pasted into a plan doc or chat) — this is a deliberate exception, not a plan-writing shortcut, and Step 3 gives the exact manual retrieval step. No other placeholders present.

**Type/naming consistency:** `xivAppServerUrl` (Configuration.cs) referenced consistently in Task 4; `REDIS_URL`/`DATABASE_URL`/`DIRECT_URL` names match what `lib/redis.ts`/`lib/prisma`(via Prisma's standard env lookup) actually read, verified against source in the Ground Truth section above, not assumed.
