# React #418 Hydration Error Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the React error #418 (hydration text mismatch) currently firing across ~9 distinct dashboard/public pages, and make future errors of any kind actually debuggable in GlitchTip (traces are currently unreadable minified JS with no sourcemaps).

**Architecture:** Root cause confirmed by live reproduction (2026-08-13, logged-in session against `https://xivvenuemanager.com/dashboard/rapture/shifts`): the page renders a raw email address (`forxbox1992@live.co.uk`, the logged-in user's own account email) in its initial HTML. Cloudflare's zone-level **Email Address Obfuscation** feature rewrites any raw email text it sees in the HTML response at the edge, replacing it with an obfuscated span plus a decode script (`cdn-cgi/scripts/.../email-decode.min.js`) that's supposed to restore the plain text client-side before paint. That decode script is blocked by this site's own CSP (`script-src 'self' 'nonce-...' 'strict-dynamic'` — a third-party edge-injected script has neither the nonce nor a `'self'` origin match). Result: the server-sent HTML contains Cloudflare's obfuscated markup, React's client render computes the original (correct) text, hydration diff fails → error #418. This explains the breadth (any page rendering any user's/staff's email, on any browser) and why the CSP itself is not the thing to change (it's correctly strict; loosening it to allow an arbitrary Cloudflare edge-injected script would be the wrong fix).

Two independent fixes, bundled here since both are small:
1. **Primary:** scope Email Address Obfuscation off on `/dashboard/*` only, via a Cloudflare Configuration Rule (dashboard action, not a code change) — removes the edge rewrite exactly where it breaks hydration, while keeping obfuscation active on public pages (`/discover`, marketing pages) where it still protects real venue contact emails from scraping. Deliberately not a zone-wide disable — that would give up scraping protection everywhere for a bug that only shows up on authenticated pages.
2. **Secondary/hardening:** re-enable sourcemap upload to GlitchTip (`sourcemaps: { disable: true }` in `next.config.ts` — currently off), so the *next* production error, of any kind, has a readable stacktrace instead of single-letter minified function names.

**Tech Stack:** Cloudflare Zone Settings API, `@sentry/nextjs` (GlitchTip's Sentry-compatible ingestion), Next.js.

**Repo:** `~/xiv-app` on `server@192.168.1.122`, `main` branch.

---

## Task 1: Add a Configuration Rule disabling Email Address Obfuscation on `/dashboard/*`

**Files:** none — this is a Cloudflare dashboard/API setting, not a repo change.

Per Cloudflare's own docs (confirmed 2026-08-13): *"To apply it to specific hostnames only, use a Configuration Rule instead of disabling it zone-wide."* Configuration Rules are path/hostname-scoped, so this keeps obfuscation active on public pages.

- [ ] **Step 1: Create the rule** (manual, dashboard) — the server's `CF_API_TOKEN` (in `~/.xiv-env`) only has DNS/Tunnel scope, not `Zone WAF`/ruleset edit, so this needs to be done in the dashboard rather than scripted, unless the token is deliberately widened for it (not worth it for a one-time rule):

  1. Cloudflare dashboard → xivvenuemanager.com zone → **Rules** → **Configuration Rules** → **Create rule**.
  2. Rule name: `Disable email obfuscation on dashboard`.
  3. Match: `URI Path` `starts with` `/dashboard/`.
  4. Setting: turn **Email Obfuscation** off (leave every other setting in the rule untouched — this rule should only affect this one setting).
  5. Save and deploy.

- [ ] **Step 2: Verify the decode-script request is gone on a dashboard page**

Re-run the same reproduction that caught this originally — navigate to `https://xivvenuemanager.com/dashboard/rapture/shifts` while logged in, check console.

```
mcp__playwright-brave__browser_navigate → https://xivvenuemanager.com/dashboard/rapture/shifts
mcp__playwright-brave__browser_console_messages (level: error)
```

Expected: zero errors (neither the CSP violation for `cloudflare-static/email-decode.min.js` nor the #418 hydration error). Note: Cloudflare's edge cache may still serve an already-obfuscated cached HTML response for a few minutes after the rule deploys — if the CSP error is gone but #418 still fires once, wait ~5 min (cache TTL) and retry before concluding the fix didn't work.

- [ ] **Step 3: Spot-check 2-3 more of the originally-affected dashboard URLs**

`/dashboard/velvet-rift/staff`, `/dashboard/account` — confirm no #418 on either.

- [ ] **Step 4: Confirm the rule is properly scoped, not zone-wide**

Load a page under `/discover` (public, not under `/dashboard/`) and view source (`curl -s https://xivvenuemanager.com/discover | grep -o 'cdn-cgi/l/email-protection' | head -1`). If Cloudflare still injects its obfuscation markup on public pages, the rule is correctly scoped to `/dashboard/*` only. (This page doesn't currently render a raw email, so it won't itself show #418 either way — this step is purely to confirm the rule's path match is correctly scoped, not a repro check.)

- [ ] **Step 5: No commit needed** — this task has no repo changes. Note the completion (date + who created the rule) in a follow-up memory update.

---

## Task 2: Re-enable GlitchTip sourcemap upload

**Files:**
- Modify: `apps/web/next.config.ts:76-81`

- [ ] **Step 1: Check what auth GlitchTip's Sentry-compatible sourcemap upload needs**

GlitchTip implements the same self-hosted sourcemap upload API as Sentry — the `@sentry/nextjs` build plugin needs an org slug, project slug, and an auth token with upload permission, normally read from `SENTRY_AUTH_TOKEN` (and `SENTRY_ORG`/`SENTRY_PROJECT` or explicit `org`/`project` options passed to `withSentryConfig`). Check whether these already exist anywhere:

```bash
ssh server@192.168.1.122 'grep -rn "SENTRY_AUTH_TOKEN\|SENTRY_ORG\|SENTRY_PROJECT\|GLITCHTIP" ~/xiv-app/apps/web/.env* ~/xiv-env 2>/dev/null; grep -n "org:\|project:\|url:" ~/xiv-app/apps/web/next.config.ts ~/xiv-app/apps/web/sentry.*.config.ts'
```

If no auth token exists yet, generate one from the GlitchTip web UI (errors.xivvenuemanager.com → Settings → Auth Tokens, scope: `project:releases` / `project:write` — GlitchTip's UI labels these, check what's available) and add it to the server's env as `SENTRY_AUTH_TOKEN` (deploy script already sources `~/.xiv-env`-style files per [[reference_xiv_app_deploy_script]] — add it there, not committed to the repo).

- [ ] **Step 2: Flip the config**

Current (`apps/web/next.config.ts:76-81`):
```typescript
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  widenClientFileUpload: false,
  disableLogger: true,
  sourcemaps: { disable: true },
})
```

New:
```typescript
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  widenClientFileUpload: false,
  disableLogger: true,
  sourcemaps: { disable: false },
})
```

(`widenClientFileUpload: false` stays as-is — that's a separate setting about which client chunks get uploaded, not whether uploading happens at all. Don't touch it as part of this task; if source-mapped traces are still incomplete after this ships, that's a separate follow-up, not part of this fix.)

- [ ] **Step 3: Build locally to confirm the plugin doesn't fail without a token** (sanity check before deploying — if `SENTRY_AUTH_TOKEN` isn't set yet, the build should still succeed, just skip the upload with a warning, not hard-fail)

```bash
ssh server@192.168.1.122 'cd ~/xiv-app/apps/web && pnpm build 2>&1 | tail -30'
```

Expected: build succeeds. If `SENTRY_AUTH_TOKEN` is set, look for a line confirming sourcemap upload (exact wording varies by `@sentry/nextjs` version — check the build output). If not set, expect a skip/warning, not a failure.

- [ ] **Step 4: Commit**

```bash
cd ~/xiv-app
git add apps/web/next.config.ts
git commit -m "fix: re-enable GlitchTip sourcemap upload for readable prod stacktraces"
```

- [ ] **Step 5: Deploy**

```bash
~/bin/deploy-xiv-web.sh --green
```

Per [[reference_xiv_app_deploy_script]] — standard flow, run smoke checks after.

- [ ] **Step 6: Verify on the next real error**

No error to check yet post-deploy — this can't be verified synthetically without triggering a real client exception. Note as "verify opportunistically": next time any GlitchTip issue fires in production, confirm its stacktrace shows real file/function names instead of `1ef4yk0rwzdj2.js:19` / single-letter function names.

---

## Self-Review

**Spec coverage:** primary fix (Cloudflare setting, Task 1) and the requested sourcemap follow-up (Task 2) both covered. Root-cause explanation given in the Architecture section, backed by the actual reproduction (email address found in page snapshot, CSP-block console error captured, correlated to the exact decode-script Cloudflare injects for its Email Obfuscation feature).

**Placeholder scan:** Task 1's manual-dashboard step is a real constraint (no API token scope for ruleset edits), stated plainly rather than scripted around. Task 2's auth-token step is conditional on what's discovered — this is a genuine "check first" step (the plan can't know what's already configured on the server without looking), not a vague TODO; both branches (token exists / needs creating) are spelled out.

**Type consistency:** N/A — no new types/functions introduced, this is a config-only fix.
