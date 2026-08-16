# React #418 Hydration Error Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the React error #418 (hydration text mismatch) currently firing across ~9 distinct dashboard/public pages, and make future errors of any kind actually debuggable in GlitchTip (traces are currently unreadable minified JS with no sourcemaps).

**Architecture:** Root cause confirmed by live reproduction (2026-08-13, logged-in session against `https://xivvenuemanager.com/dashboard/rapture/shifts`): the page renders a raw email address (`forxbox1992@live.co.uk`, the logged-in user's own account email) in its initial HTML. Cloudflare's zone-level **Email Address Obfuscation** feature rewrites any raw email text it sees in the HTML response at the edge, replacing it with an obfuscated span plus a decode script (`cdn-cgi/scripts/.../email-decode.min.js`) that's supposed to restore the plain text client-side before paint. That decode script is blocked by this site's own CSP (`script-src 'self' 'nonce-...' 'strict-dynamic'` — a third-party edge-injected script has neither the nonce nor a `'self'` origin match). Result: the server-sent HTML contains Cloudflare's obfuscated markup, React's client render computes the original (correct) text, hydration diff fails → error #418. This explains the breadth (any page rendering any user's/staff's email, on any browser) and why the CSP itself is not the thing to change (it's correctly strict; loosening it to allow an arbitrary Cloudflare edge-injected script would be the wrong fix).

Two independent fixes, bundled here since both are small:

1. **Primary:** scope Email Address Obfuscation off on `/dashboard/*` only, via a Cloudflare Configuration Rule (dashboard action, not a code change) — removes the edge rewrite exactly where it breaks hydration, while keeping obfuscation active on public pages (`/discover`, marketing pages) where it still protects real venue contact emails from scraping. Deliberately not a zone-wide disable — that would give up scraping protection everywhere for a bug that only shows up on authenticated pages.
2. **Secondary/hardening:** re-enable sourcemap upload to GlitchTip (`sourcemaps: { disable: true }` in `next.config.ts` — currently off), so the _next_ production error, of any kind, has a readable stacktrace instead of single-letter minified function names.

**Tech Stack:** Cloudflare Zone Settings API, `@sentry/nextjs` (GlitchTip's Sentry-compatible ingestion), Next.js.

**Repo:** `~/xiv-app` on `server@192.168.1.122`, `main` branch.

---

## Task 1: Add a Configuration Rule disabling Email Address Obfuscation on `/dashboard/*`

**Files:** none — this is a Cloudflare dashboard/API setting, not a repo change.

Per Cloudflare's own docs (confirmed 2026-08-13): _"To apply it to specific hostnames only, use a Configuration Rule instead of disabling it zone-wide."_ Configuration Rules are path/hostname-scoped, so this keeps obfuscation active on public pages.

- [x] **Step 1: Create the rule** (manual, dashboard) — done 2026-08-13, created via the dashboard by the user with live walkthrough. Rule name `Disable email obfuscation on dashboard`, match `URI Path starts with /dashboard/`, setting `Email Obfuscation` → off. Confirmed to have deployed correctly (visible in the zone's Configuration Rules list post-deploy, exact match/setting as specified).

- [x] **Step 2: Verify the decode-script request is gone on a dashboard page** — done. `https://xivvenuemanager.com/dashboard/rapture/shifts` (the worst offender, 31 hits pre-fix): zero console errors, both the CSP violation and #418 gone.

- [x] **Step 3: Spot-check 2-3 more of the originally-affected dashboard URLs** — done. `/dashboard/velvet-rift/staff` and `/dashboard/account`: zero console errors on both.

- [x] **Step 4: Confirm the rule is properly scoped, not zone-wide** — attempted via `/discover` as originally planned, inconclusive as predicted (that page renders no raw email currently, `curl` found no obfuscation markup either way). Confirmed scoping instead by reading the deployed rule back from the Cloudflare dashboard's Configuration Rules list: match expression is exactly `(starts_with(http.request.uri.path, "/dashboard/"))`, not a zone-wide rule — scoping is correct by definition, not just by inference from public-page behavior.

- [x] **Step 5: No commit needed** — confirmed, no repo changes were required for this task.

**Task 1 complete 2026-08-13.** Root cause eliminated on all three previously-broken URLs tested; rule scoped correctly per the dashboard's own rule listing.

---

## Task 2: Re-enable GlitchTip sourcemap upload — **DONE, deployed 2026-08-13**

Actual implementation ended up more involved than originally scoped — three real issues found only by building and checking GlitchTip directly, not by reading docs:

1. **`url` isn't a valid `SentryBuildOptions` field** in the installed `@sentry/nextjs@10.51.0` — a build-time TypeScript error caught this immediately. Correct field is `sentryUrl` (confirmed by reading the package's own `.d.ts`, not assumed from memory).
2. **`SENTRY_AUTH_TOKEN` via `ARG`/`ENV` triggered Docker's own `SecretsUsedInArgOrEnv` warning** — the token would persist in `docker history` on every subsequent layer, readable by anyone with image access. Fixed with a proper BuildKit secret mount (`RUN --mount=type=secret`) instead, wired through `docker-compose.yml`'s `secrets:` block (`environment: SENTRY_AUTH_TOKEN`) rather than `args:`.
3. **The upload silently no-ops with zero uploaded files unless an explicit `release.name` is set** — the Docker build context has no `.git` (only `apps/web`, `packages/types` etc. are `COPY`'d in), so the plugin's auto-detection has nothing to find. This wasn't documented anywhere obvious; found by watching GlitchTip's Releases page stay at "(7)" through two full builds with `debug: true` on, until an explicit release name was set, at which point a matching release with chunk-upload requests appeared immediately. Fixed by threading the deploying commit's SHA through: deploy script computes `SENTRY_RELEASE=$(git rev-parse HEAD)` on the server (post-`git pull`, so it's the SHA actually being deployed) → `docker-compose.yml` build arg → `Dockerfile` `ARG`/`ENV` (not a secret, a public commit SHA) → `next.config.ts`'s `release: { name: process.env.SENTRY_RELEASE }`. This also makes the upload's release name match what the runtime SDK auto-tags events with, which is what actually lets GlitchTip symbolicate a given error against the right sourcemaps.

**Files changed (final):**

- `apps/web/next.config.ts` — `sentryUrl`, `org: "xiv-venue-manager"`, `project: "xiv-app-web"` (both slugs read from GlitchTip's own DB, `organizations_ext_organization`/`projects_project` tables), `release: { name: process.env.SENTRY_RELEASE }`, `sourcemaps: { disable: false }`.
- `apps/web/Dockerfile` — `ARG`/`ENV SENTRY_RELEASE` (not secret); `pnpm build` now runs under `RUN --mount=type=secret,id=sentry_auth_token SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)" pnpm build`.
- `docker-compose.yml` — both `venue-manager` and `venue-manager-next` build blocks get `SENTRY_RELEASE` in `args:` and `secrets: [sentry_auth_token]`; top-level `secrets: { sentry_auth_token: { environment: SENTRY_AUTH_TOKEN } }` added.
- `~/bin/deploy-xiv-web.sh` (not in this repo — separate local script) — both the `--green` and default branches now `export SENTRY_RELEASE=$(git rev-parse HEAD)` on the server, right after `git pull`, before the `docker compose build` call.
- New GlitchTip auth token created via its web UI (Profile → Auth Tokens), labeled `web-sourcemap-upload`, scope `project:releases` only (least-privilege — the existing `Homepage-Stats` token is `project:read, event:read` and was correctly _not_ reused, since it's a different service's token for a different purpose). Placed directly in `~/xiv-app/.env` on the server as `SENTRY_AUTH_TOKEN` by the user via SSH — never passed through this chat.

**Real incident during testing:** repeated `--no-cache` builds while diagnosing the release-name issue filled the server's root disk to 100% (0 bytes free) via Docker's build cache (20GB, only ~4GB reclaimable). Live production container (`venue-manager`) stayed up and unaffected throughout, but this was close to affecting it. Fixed with `docker builder prune -af` (build cache only — regenerable, doesn't touch running containers or their images). Recovered 17GB. Lesson: don't chain multiple `--no-cache` builds without checking `df -h` between them on this server.

**Verified end-to-end:**

- Real deploy (`~/bin/deploy-xiv-web.sh --green`, commit `67226ae`) succeeded, 13/13 smoke checks passed, production flipped to the new build.
- GlitchTip Releases list shows `67226aec61297dc4ae3def08fce60d3e65da237e` (matching the deployed commit) created at deploy time, alongside earlier test releases (`14a0809...`, a real prior commit; `debug-test-release`, a throwaway test name — left in place, GlitchTip 6.1.6's UI has no release-delete option, harmless clutter).
- Definitive proof of _readable_ stacktraces (vs. just "upload happened") is still only checkable opportunistically on the next real production error — a `captureMessage` diag call (`/api/diag/sentry-test`) confirmed connectivity end-to-end but doesn't exercise a thrown-error stack, and there was no practical way to trigger a genuine client-side JS error against the isolated pre-flip green container from outside the LAN.

- [ ] **Step 6: Verify on the next real error**

No error to check yet post-deploy — this can't be verified synthetically without triggering a real client exception. Note as "verify opportunistically": next time any GlitchTip issue fires in production, confirm its stacktrace shows real file/function names instead of `1ef4yk0rwzdj2.js:19` / single-letter function names.

---

## Self-Review

**Spec coverage:** primary fix (Cloudflare setting, Task 1) and the requested sourcemap follow-up (Task 2) both covered. Root-cause explanation given in the Architecture section, backed by the actual reproduction (email address found in page snapshot, CSP-block console error captured, correlated to the exact decode-script Cloudflare injects for its Email Obfuscation feature).

**Placeholder scan:** Task 1's manual-dashboard step is a real constraint (no API token scope for ruleset edits), stated plainly rather than scripted around. Task 2's auth-token step is conditional on what's discovered — this is a genuine "check first" step (the plan can't know what's already configured on the server without looking), not a vague TODO; both branches (token exists / needs creating) are spelled out.

**Type consistency:** N/A — no new types/functions introduced, this is a config-only fix.
