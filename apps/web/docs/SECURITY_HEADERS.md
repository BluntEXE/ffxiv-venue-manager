# Security Headers Implementation

## Overview

XIV Venue Manager implements comprehensive HTTP security headers to protect against common web vulnerabilities including XSS, clickjacking, MIME-sniffing, and other attacks.

## Implemented Headers

### 1. X-Frame-Options: DENY

**Protection**: Clickjacking attacks

Prevents the site from being embedded in iframes on other domains, protecting users from clickjacking attacks where malicious sites trick users into clicking hidden buttons.

### 2. X-Content-Type-Options: nosniff

**Protection**: MIME-sniffing attacks

Forces browsers to respect the declared Content-Type, preventing browsers from trying to "guess" file types which could lead to XSS vulnerabilities.

### 3. Referrer-Policy: strict-origin-when-cross-origin

**Protection**: Information leakage

Controls how much referrer information is sent with requests:

- Same-origin: Full URL
- Cross-origin HTTPS→HTTPS: Origin only
- HTTPS→HTTP: No referrer (downgrade protection)

### 4. Strict-Transport-Security

**Protection**: Man-in-the-middle attacks

```
max-age=31536000; includeSubDomains; preload
```

Forces browsers to only access the site via HTTPS for 1 year (31536000 seconds), including all subdomains.

### 5. Permissions-Policy

**Protection**: Unauthorized API access

```
camera=(), microphone=(), geolocation=()
```

Disables potentially dangerous browser APIs:

- No camera access
- No microphone access
- No geolocation access

### 6. Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Resource-Policy: same-site, Cross-Origin-Embedder-Policy: credentialless

**Protection**: Cross-origin opener attacks, hotlinking/side-channel resource loading

Isolates the browsing context from cross-origin openers and restricts who can load our resources cross-site. `credentialless` (not `require-corp`) on COEP so external CDN images (Discord avatars etc.) still load without needing CORP headers from those third parties.

### 7. X-DNS-Prefetch-Control: on

**Protection**: N/A — performance, not security

Allows the browser to prefetch DNS for links on the page.

### 8. Content-Security-Policy (CSP)

**Protection**: XSS, injection attacks, unauthorized resource loading

Nonce-based CSP generated per-request in `proxy.ts`:

```
default-src 'self';
script-src 'self' 'nonce-{per-request-random}' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://cdn.discordapp.com https://raw.githubusercontent.com https://cdn.partake.gg [+ MINIO_PUBLIC_URL if set];
font-src 'self' data:;
connect-src 'self' https://discord.com https://api.github.com https://qstash.upstash.io https://errors.xivvenuemanager.com [+ MINIO_PUBLIC_URL if set];
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests
```

This is the production shape. In development, `script-src` also allows `'unsafe-eval'` (Next.js dev-mode tooling needs it) and `upgrade-insecure-requests` is dropped (local dev serves plain HTTP). See `buildCsp()` in `proxy.ts` for the exact per-environment logic — this doc shows the general shape, not a byte-for-byte copy; don't diff against it literally.

**Nonce implementation (2026-05-07):**

- `unsafe-inline` and `unsafe-eval` removed from `script-src` in production
- Per-request nonce via `crypto.randomUUID()`, base64-encoded
- Next.js automatically stamps the nonce on all generated `<script>` tags
- CSP lives in `proxy.ts` (not `next.config.ts`) because nonces require per-request generation — `next.config.ts`'s `headers()` sets every _other_ header in this doc (all static, same value on every request), CSP is the one exception
- `style-src unsafe-inline` retained - required by Tailwind CSS

**Auth gating lives in the same function.** `proxy.ts`'s `proxy()` does two things per request, not just CSP: it also checks `PUBLIC_PATHS`/`PUBLIC_PREFIXES` and redirects unauthenticated requests to `/auth/signin` (via NextAuth's `getToken()`) before the response with the CSP header is ever built. If you're debugging "why did this route redirect" as well as "why did this header not appear," they're the same file.

**Allowed External Sources:**

- Discord CDN: For user avatars via Discord OAuth
- GitHub: For repository images and assets
- QStash: For cron job webhook delivery
- Discord API: For OAuth authentication

## Testing Security Headers

### Browser DevTools Method

1. Open your deployed site (https://xivvenuemanager.com)
2. Open DevTools (F12)
3. Go to **Network** tab
4. Refresh the page
5. Click on the main document request
6. Go to **Headers** tab
7. Scroll to **Response Headers**

You should see all headers listed above.

### Online Testing Tools

1. **Security Headers Scanner**
   - https://securityheaders.com
   - Enter: https://xivvenuemanager.com
   - Should score **A** or **A+**

2. **Mozilla Observatory**
   - https://observatory.mozilla.org
   - Enter: https://xivvenuemanager.com
   - Should score **B+** or higher

3. **CSP Evaluator**
   - https://csp-evaluator.withgoogle.com
   - Test the CSP policy specifically

### Command Line Testing

```bash
curl -I https://xivvenuemanager.com | grep -E "(X-Frame|X-Content|Strict-Transport|Permissions|Content-Security|Referrer)"
```

Expected output:

```
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=31536000; includeSubDomains; preload
permissions-policy: camera=(), microphone=(), geolocation=()
content-security-policy: default-src 'self'; script-src 'self' 'nonce-{base64}'; ...
```

## Security Benefits

| Header                    | Attack Prevented     | Severity | Impact                                               |
| ------------------------- | -------------------- | -------- | ---------------------------------------------------- |
| X-Frame-Options           | Clickjacking         | High     | ✅ Complete protection                               |
| X-Content-Type-Options    | MIME confusion XSS   | Medium   | ✅ Complete protection                               |
| Referrer-Policy           | Information leakage  | Low      | ✅ Balanced privacy                                  |
| Strict-Transport-Security | MITM, SSL strip      | High     | ✅ Complete protection                               |
| Permissions-Policy        | Unauthorized API use | Medium   | ✅ Complete protection                               |
| Content-Security-Policy   | XSS, injection       | High     | ✅ Nonce-based (no unsafe-inline/eval in script-src) |

## Known Limitations

### style-src unsafe-inline

`style-src` still includes `unsafe-inline` — required by Tailwind CSS for utility class injection. Removing it would require a full CSS-in-JS migration.

## Compliance

These headers help meet compliance requirements for:

- ✅ **OWASP Top 10**: Protection against A03:2021 (Injection)
- ✅ **PCI DSS**: Requirement 6.5.7 (XSS prevention)
- ✅ **GDPR**: Privacy-respecting referrer policy
- ✅ **SOC 2**: Security controls for data protection

## Configuration Location

Security headers are configured in two places:

```
next.config.ts   # every static header (X-Frame-Options, HSTS, Permissions-Policy, etc.) - same value every request
proxy.ts          # Content-Security-Policy only - needs a fresh nonce per request, can't be a static next.config.ts value
```

Both apply automatically to all routes matched by `proxy.ts`'s `config.matcher` (everything except static assets, plugin/cron/webhook API routes, and a few other exclusions listed there).

## Deployment

This app runs as a standalone Docker container on the project's own server (not Vercel), behind a Cloudflare tunnel. Both header sources ship as part of the normal build — see `~/bin/deploy-xiv-web.sh` (`git pull` + `docker compose build/up`) for the actual deploy flow. No separate header-specific deploy step; if the code is in the running container, the headers are live.

## Troubleshooting

### Header not appearing in production

**Issue**: Security header missing in browser DevTools

**Solutions**:

1. Clear browser cache (Ctrl+Shift+R)
2. Confirm the change actually deployed — check `docker compose logs venue-manager` on the server for the current build, or `git log` on the server checkout, rather than assuming a push alone shipped it (pushing to GitHub does not deploy, see the repo's root `CLAUDE.md`)
3. If it's the CSP specifically and every other header is present: the bug is in `proxy.ts`, not `next.config.ts` — check its `config.matcher` didn't exclude the route in question
4. Redeploy via `~/bin/deploy-xiv-web.sh`

### CSP blocking resources

**Issue**: Console errors like "Refused to load..."

**Solutions**:

1. Add the resource domain to appropriate CSP directive
2. For images: Add to `img-src`
3. For APIs: Add to `connect-src`
4. For scripts: Add to `script-src` (carefully!)

### Example: Adding a new image CDN

```javascript
"img-src 'self' data: https://cdn.discordapp.com https://new-cdn.example.com"
```

## Security Monitoring

### Recommended Tools

1. **Sentry** - Monitor CSP violations
2. **Cloudflare** - WAF and DDoS protection
3. **Snyk** - Dependency vulnerability scanning
4. **OWASP ZAP** - Automated security testing

### CSP Violation Reporting

Future improvement: Add CSP report-uri to collect violation reports:

```javascript
"report-uri https://xivvenuemanager.com/api/csp-report"
```

This allows monitoring attempted attacks and identifying CSP issues.

## References

- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [MDN HTTP Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
- [Content Security Policy Reference](https://content-security-policy.com/)
- [Next.js Security Headers Documentation](https://nextjs.org/docs/app/api-reference/next-config-js/headers)

## Last Updated

2025-12-03 - Initial implementation
2026-05-07 - Nonce-based CSP (see "Nonce implementation" above)
2026-08-15 - Corrected config location (proxy.ts, not next.config.ts, for CSP) and deployment section (own Docker server, not Vercel) - doc had never been updated after the app moved off Vercel; documented the 4 headers (COOP/CORP/COEP/X-DNS-Prefetch-Control) that were configured but not listed here
