<div align="center">

# XIV Venue Manager
### Production venue management for an MMO community

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org)
[![C# Plugin](https://img.shields.io/badge/Dalamud_Plugin-C%23-239120?logo=csharp)](https://github.com/goatcorp/Dalamud)
[![Live](https://img.shields.io/badge/status-production-success)](https://xivvenuemanager.com)

**Live:** [xivvenuemanager.com](https://xivvenuemanager.com) · **Built by** Ehno (`@BluntEXE`)

</div>

---

## TL;DR

A two-part venue management system for **Final Fantasy XIV** social venues: a **C# game-client plugin** that captures in-game events (patron arrivals, staff shifts, sales) and a **Next.js web dashboard** that aggregates them into analytics, payroll, and live attendance views. Replaces spreadsheets and Discord pings with proper tooling.

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  FFXIV client    │  HTTP │  Web app + API   │  SQL  │   PostgreSQL     │
│  + Dalamud       ├──────►│  (Next.js 16)    ├──────►│   19 tables      │
│  + my plugin     │  SSE  │  + Redis cache   │       │                  │
│  (4,981 LOC C#)  │◄──────┤  (19,419 LOC TS) │       │                  │
└──────────────────┘       └──────────────────┘       └──────────────────┘
        ▲                          │
        │                          ▼
   venue staff              browser dashboard
   (in-game)              (owners + analytics)
```

| | |
|---|---|
| **Lines of code** | ~24,400 (19,419 TS + 4,981 C#) |
| **API routes** | 55 |
| **Database tables** | 19 |
| **Commits** | 117 over ~5 months |
| **Knowledge-graph nodes** | 1,054 entities, 204 communities |
| **Solo built** | Yes - every line, every decision |

---

## The Problem

FFXIV has a thriving "venue" subculture: player-run nightclubs, lounges, and social spaces hosting live events. Operators were tracking everything - patron attendance, staff shifts, sales, tips, payroll - in **Google Sheets and Discord pings**. Every venue reinvented the same broken wheel.

Specific pain points that drove the build:

1. **Patron tracking** was manual: a host stood at the door typing names into a spreadsheet
2. **Shift/payroll** was eyeballed: staff posted "I worked 4 hours" in Discord and hoped for the best
3. **Analytics** didn't exist: no one knew which events drew traffic, which services sold, what staffing levels were needed
4. **Cross-venue mobility** was impossible: a bartender working at three different venues had no portable record of their hours

The opportunity: FFXIV exposes plugin APIs through the **Dalamud** framework. A plugin can observe game events directly (zone changes, party adds, chat messages, target focus) and report them somewhere structured. Pair that with a web app and the spreadsheet-and-prayer workflow becomes real software.

---

## The Solution

A two-tier system, each tier doing what it's good at.

### Tier 1: Dalamud plugin (C#, ~5k LOC)
- Runs inside the FFXIV game client
- Observes patron arrivals/departures via zone-change + party events
- Provides chat commands (`/venue`, `/vm`, `sale!`, `target!`) for instant logging without leaving the game
- Tracks staff shifts (clock-in/out)
- Authenticates to the web app via per-user API key

### Tier 2: Web app (Next.js 16 + PostgreSQL, ~19k LOC)
- 55-route REST API: plugin-facing routes (API key auth) + dashboard routes (Discord OAuth)
- Live page with **server-sent events** (SSE) for real-time patron flow
- Analytics dashboards per venue
- Payroll generation from shift + sales data
- Multi-venue, multi-role permission model
- [Partake.gg](https://partake.gg) event sync integration

### Design principle
> The plugin is the **primary action surface**. The website is the **fallback + analytics surface**.
> Players are already in the game, in the venue, busy. The plugin lets them act in 1-2 keystrokes; the website is where they review, configure, and analyze.

---

## Architecture at a Glance

```mermaid
graph TB
    subgraph Game["FFXIV Game Client"]
        Plugin["Dalamud Plugin<br/>(C# / .NET)"]
    end

    subgraph Edge["Web Edge"]
        Next["Next.js 16<br/>App Router<br/>Standalone Build"]
    end

    subgraph Data["Persistence Layer"]
        PG[("PostgreSQL 16<br/>19 tables")]
        Redis[("Redis 7<br/>cache + rate limit")]
    end

    subgraph Auth["Identity"]
        Discord["Discord OAuth"]
        APIKey["Per-user API Keys<br/>(SHA-256 hashed)"]
    end

    subgraph External["Integrations"]
        Partake["Partake.gg<br/>(event sync)"]
    end

    Browser["Browser Dashboard<br/>(venue owners,<br/>staff, patrons)"]

    Plugin -- "x-api-key, HTTPS" --> Next
    Browser -- "Discord OAuth + sessions" --> Next
    Next --> PG
    Next --> Redis
    Next -- "SSE stream" --> Browser
    Next <--> Discord
    Plugin -.->|authenticated by| APIKey
    Browser -.->|authenticated by| Discord
    Next <--> Partake

    style Plugin fill:#5a3e9c,stroke:#fff,color:#fff
    style Next fill:#000,stroke:#fff,color:#fff
    style PG fill:#336791,stroke:#fff,color:#fff
    style Redis fill:#dc382d,stroke:#fff,color:#fff
```

**Key flows:**
- **Patron logging:** Plugin detects game-side patron arrival → POSTs to `/api/plugin/patron-visits` → server dedupes (60s window), classifies as staff vs patron via active shift, attributes to active event → publishes to SSE bus → live dashboard updates without polling
- **Authentication split:** Two separate auth surfaces because the audiences differ. Plugin clients (machine-to-machine) use rotatable API keys with hashed storage. Browser clients use Discord OAuth via NextAuth.
- **Caching:** Redis sits between Next.js and Postgres for hot reads (venues, services, transactions). Same Redis instance also backs rate limiting via separate key namespaces (`cache:` vs `rl:`).

---

## Tech Stack & Why

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| **Frontend framework** | Next.js 16 App Router | Server Components mean dashboard data joins happen on the server, no waterfall fetches. Standalone build keeps the production image lean. |
| **Language** | TypeScript with `strict: true` | The plugin↔server contract is the single most important interface in the system. A typed contract catches drift at build time, not in production. |
| **Database** | PostgreSQL 16 | Relational because the domain is relational: venues have memberships, memberships have shifts, shifts have transactions. Joins, not document gymnastics. |
| **ORM** | Prisma | Generated types feed the TS strictness. Schema-first migrations force me to think about data shape before writing routes. |
| **Caching + rate limiting** | Redis 7 (single instance, ioredis client) | One container, two key namespaces. `allkeys-lru` so cache evicts under pressure but rate-limit keys (1-min TTL) never get squeezed out. |
| **Auth (browser)** | NextAuth + Discord OAuth | FFXIV's social fabric runs on Discord. Forcing users into a second account would have killed adoption. |
| **Auth (plugin)** | Hashed API keys (SHA-256, 32-char nanoid) | Plugin can't do an OAuth dance from inside a game client. Keys are hashed at rest with `keyHash` lookups, never plaintext. |
| **Real-time** | Server-Sent Events | Unidirectional (server → browser) is enough for live patron flow. WebSockets would be overkill, plus SSE survives proxy/CDN setups better. |
| **Game client** | Dalamud framework, C# / .NET | Standard FFXIV plugin runtime. C# bindings for game state are the only realistic option. |
| **Deployment** | Docker Compose on a self-hosted Linux server | I'm one person; managed Kubernetes is a tax I don't need. Compose is reproducible, debuggable, and survives reboots. |
| **CI/CD** | GitHub Actions for lint + `npm audit`; manual deploy via SSH | Solo project: full continuous deployment isn't worth the failure modes when I'm the only one shipping. |
| **Schema migrations** | `prisma db push` (not migrations) | A solo + small-data project: schema iterates faster than migration files would. Documented trade-off (see engineering docs) - would change at multi-engineer scale. |

---

## Three Engineering Vignettes

Real decisions, real trade-offs. Picked because they show range: cross-platform contract design, production security work, and a non-obvious real-time choice.

### Vignette 1: A C# plugin and a TypeScript server, talking

The plugin and web app are written in different languages, run on different machines, owned by different runtimes (game client vs. server). They have to agree on every payload byte or things break silently in production.

**The challenge:** A naive approach has the plugin POST raw JSON, the server parse it loosely, and any field rename rolls out as a silent compatibility break for every plugin user - who can't even auto-update because plugins ship as zipped binaries.

**The decision:** Treat the plugin↔web HTTP contract as a **versioned API surface**, not an internal call. Specifically:
- Every plugin-facing route lives under `/api/plugin/*` and is treated as public-stable
- Field additions are always additive and optional; field removals require a plugin release with a deprecation window
- The plugin pins a base URL and an API key, nothing else; no client SDK, no generated types, just HTTP + JSON
- Payload validation on the server side is **lenient on read, strict on write** - unknown fields ignored, but known fields type-checked

**What this bought me:** I can ship a server change today and the plugin doesn't break. I can ship a plugin change today and old server versions keep working. Two release cadences, one contract.

**What it cost:** I keep the API surface deliberately small. There are 12 plugin-facing routes (out of 55 total) and I'm careful about adding more. Each one is a permanent commitment.

> **Trade-off captured:** A loose contract optimizes for shipping speed; a strict one optimizes for upgrade safety. With binary plugin distribution and zero ability to force-update users, I chose strict. A web-only product would have made the opposite call.

### Vignette 2: A real security audit, with deferrals

Six months in I sat down and ran a full security audit against the production app. Not "did I read the OWASP top 10," but a line-by-line review against an actual checklist. **18 findings:** 4 Critical, 6 High, 7 Medium, 5 Low.

**What got fixed (highlights):**
- **API keys hashed at rest** (was: plaintext in DB). Migration was non-trivial because existing keys had no `keyHash`; would have logged out every plugin user mid-session.
- **Secrets out of `docker-compose.yml`** and out of the Docker image (was: `COPY .env .env` baked secrets into image layers)
- **Rate limiting on all plugin + dashboard routes** with Redis-backed sliding-window
- **IDOR fix on feedback endpoint** (was: GET by ID, no scoping; now: scoped to `session.user.id`)
- **40 venue queries gained `status: "active"` membership filter** (was: revoked staff retained read access)
- **Cron auth made timing-safe** with constant-time comparison
- **SSH password auth disabled**, ed25519 keys only

**What got intentionally deferred, with rationale:**
- **Strict CSP:** initially deferred given low threat model, later completed (2026-05-07) - nonce-based CSP with `unsafe-eval`/`unsafe-inline` removed, implemented via per-request nonce generation in `proxy.ts`
- **Database password rotation:** the password is weak but the database isn't externally exposed; rotated when convenient, not as fire-drill
- **Invite token venue-name leak:** non-issue - anyone joining will see the venue name regardless

**The senior-engineer move here isn't "I fixed everything."** It's "I documented every deferred item with the reason it's deferred and the trigger that should bring it back to the top of the queue." Memory entries flag these for future-me; if I forget, the next time I touch that part of the code the deferral note shows up.

**The bug I shipped on top of the audit:**
Even after the audit declared rate limiting "fixed," a recent test exposed an **ordering bug**: the rate limit ran *after* API-key validation. So bad/missing keys returned 401 before any counter incremented, leaving the keyspace open to unthrottled brute-force probing - each attempt costing a database lookup. Fixed by adding a per-IP pre-filter that runs **before** key validation. Verified: 80-request burst from one IP → 60×401 + 20×429.

> **Lesson captured:** Audits catch what's missing, not what's mis-ordered. "Rate limiting exists" and "rate limiting is positioned to do its job" are different claims. Test the assumption, not the checklist.

### Vignette 3: Real-time without WebSockets

The live page (`/dashboard/<venue>/live`) shows patrons entering and leaving in real time, as the plugin reports them. First instinct: WebSockets. Second instinct, after thinking: **Server-Sent Events.**

**Why SSE won:**
- Traffic is **unidirectional** - server pushes events to browser, browser never sends back
- SSE rides on plain HTTP/1.1, no protocol upgrade dance, no special proxy config, works through every reverse proxy I'd ever deploy behind
- Native `EventSource` API in browsers - no client library, no reconnection logic to write
- Resource-cheap: one open HTTP/2 connection per viewer, server holds it idle 99% of the time

**The architecture:**
```
plugin POST /api/plugin/patron-visits
  └─► server validates, dedupes, classifies
      └─► writes row to PatronLog (Postgres)
          └─► emits to in-process venueEventBus (per-venue channel)
              └─► every connected SSE client for that venue receives the event
                  └─► browser appends row to live feed without reload
```

The bus is **in-process per Node container**. With one venue-manager replica that's fine. Going multi-replica would require swapping the bus for Redis pub/sub, which is a documented future migration (Redis already provisioned, so it's a 50-line change when needed, not a re-architecture).

**The honest cost:** SSE doesn't survive a server restart - connections drop and the browser reconnects. For a live patron feed, that's a sub-second blip nobody notices. For a chat app it would be unacceptable.

> **Trade-off captured:** SSE is the right pick when traffic is unidirectional and you can tolerate brief reconnect blips. WebSockets are right when you need bidirectional push or rich session protocols. Picking the simpler tool when it fits is its own engineering skill.

---

## What I'd Do Differently

Asked of every senior engineer in every interview. My honest answer:

1. **I'd write the plugin↔web contract as a typed schema first.** Today the contract is implicit in route handlers and hand-coded plugin DTOs. A shared OpenAPI or `zod`-derived schema would cut the chance of silent drift to near zero. The cost would be one extra build step. Worth it from day one in any future project.
2. **I'd start with Prisma migrations, not `db push`.** Today's schema is at v19 tables. Iterating with `db push` was fast early; today every schema change is an audit-trail gap I have to reconstruct from git. The trade-off was right for week one and wrong for week 26.
3. **I'd put cache observability in from the start.** I have rate-limit metrics (Redis `INFO`), but no per-namespace cache hit/miss counters. Adding them later is harder than wiring them when you write the cache layer.
4. **I'd design payroll generation as event-sourced, not query-derived.** Today payroll is computed by querying shifts + transactions. Worked fine until I needed to handle retroactive shift edits. An event-sourced approach (immutable log of timecard events, projection into payroll periods) would handle history-rewrites cleanly.

---

## By the Numbers

<div align="center">

| Metric | Value |
|---|---|
| Total LOC | ~24,400 |
| Web app (TS/TSX) | 19,419 |
| Plugin (C#) | 4,981 |
| API routes | 55 |
| Database tables | 19 |
| Plugin-facing routes | 12 |
| Web-only routes | 43 |
| Cron jobs | 4 |
| Commits | 117 |
| Active development span | ~6 months (Dec 2025 → May 2026) |
| Production environment | Single self-hosted Linux box |
| Container count | 7 (web, postgres, redis, cron, static, adminer, static-ehno) |
| Redis memory ceiling | 256 MB (`allkeys-lru`) |

</div>

---

## Limitations & Roadmap

Honesty over polish.

**What it doesn't do (yet):**
- No multi-region deployment - single box, single region
- No iOS app - Android companion app ships (Expo/React Native, Play Store); iOS deferred (cost)
- No public API for third parties - `/api/plugin/*` is for the official plugin only
- No marketplace / cross-venue discovery - venues are isolated tenants
- No automated database backups beyond manual nightly tarballs

**What's in the queue (deferred-with-trigger):**
- Cache stampede protection + observability (deferred until traffic justifies)
- Multi-replica web tier (would require swapping in-process event bus for Redis pub/sub)

**What I'd build next if this were a job:**
- iOS companion app (Android shipped; deferred for cost, not technical reasons)
- Public read API for venue listings (with rate-limited keys)
- Per-venue custom branding so each venue feels distinct
- Slack / Discord webhook integrations for shift notifications

---

## Repos & Live Surfaces

- **Web app source:** [github.com/BluntEXE/ffxiv-venue-manager](https://github.com/BluntEXE/ffxiv-venue-manager)
- **Live production:** [xivvenuemanager.com](https://xivvenuemanager.com)
- **Plugin distribution:** Released as a [Dalamud third-party repo](https://github.com/goatcorp/Dalamud) (binary zips, auto-updated by the Dalamud installer)

For a deeper engineering walkthrough see [`apps/web/docs/engineering/`](./apps/web/docs/engineering) - broken into:
- [Architecture](./apps/web/docs/engineering/architecture.md) - system diagram, component responsibilities, data flow
- [Security](./apps/web/docs/engineering/security.md) - full audit narrative, what was fixed, what was deferred and why
- [Scaling](./apps/web/docs/engineering/scaling.md) - Redis + rate limit decisions, what changes at 10x and 100x

---

<div align="center">

*Built solo by **Ehno** (`@BluntEXE` on GitHub).*
*FFXIV character "Ehno" credited as plugin author; GitHub handle "BluntEXE" used for code.*

</div>
