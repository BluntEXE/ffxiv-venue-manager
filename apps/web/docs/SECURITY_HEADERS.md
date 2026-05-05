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
camera=(), microphone=(), geolocation=(), interest-cohort=()
```

Disables potentially dangerous browser APIs:
- No camera access
- No microphone access
- No geolocation access
- No FLoC tracking (privacy protection)

### 6. Content-Security-Policy (CSP)
**Protection**: XSS, injection attacks, unauthorized resource loading

Comprehensive CSP configuration:

```
default-src 'self';
script-src 'self' 'unsafe-eval' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://cdn.discordapp.com https://raw.githubusercontent.com;
font-src 'self' data:;
connect-src 'self' https://discord.com https://api.github.com https://qstash.upstash.io;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests
```

**Note on `unsafe-inline` and `unsafe-eval`:**
- Required by Next.js for React hydration and hot module replacement
- Required by Tailwind CSS for runtime styling
- Future improvement: Implement nonces for stricter CSP

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
permissions-policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; ...
```

## Security Benefits

| Header | Attack Prevented | Severity | Impact |
|--------|------------------|----------|---------|
| X-Frame-Options | Clickjacking | High | ✅ Complete protection |
| X-Content-Type-Options | MIME confusion XSS | Medium | ✅ Complete protection |
| Referrer-Policy | Information leakage | Low | ✅ Balanced privacy |
| Strict-Transport-Security | MITM, SSL strip | High | ✅ Complete protection |
| Permissions-Policy | Unauthorized API use | Medium | ✅ Complete protection |
| Content-Security-Policy | XSS, injection | High | ⚠️ Good (with unsafe-inline) |

## Known Limitations

### CSP Unsafe Directives

The CSP includes `unsafe-inline` and `unsafe-eval` which weakens XSS protection:

**Why it's needed:**
- Next.js requires `unsafe-eval` for React hydration
- Tailwind CSS requires `unsafe-inline` for utility classes

**Future improvement:**
```javascript
// Use nonces for stricter CSP
script-src 'self' 'nonce-{random}';
style-src 'self' 'nonce-{random}';
```

This requires:
1. Generating random nonce per request
2. Passing nonce to Next.js Head component
3. Adding nonce to all inline scripts/styles

## Compliance

These headers help meet compliance requirements for:

- ✅ **OWASP Top 10**: Protection against A03:2021 (Injection)
- ✅ **PCI DSS**: Requirement 6.5.7 (XSS prevention)
- ✅ **GDPR**: Privacy-respecting referrer policy
- ✅ **SOC 2**: Security controls for data protection

## Configuration Location

Security headers are configured in:
```
next.config.ts
```

They are applied automatically to **all routes** (`/:path*`) by Next.js.

## Vercel Deployment

Vercel automatically applies these headers from `next.config.ts` during deployment:

1. Headers are added to edge network configuration
2. Applied at CDN level (low latency)
3. No runtime performance impact
4. Cached for optimal delivery

## Troubleshooting

### Header not appearing in production

**Issue**: Security header missing in browser DevTools

**Solutions**:
1. Clear browser cache (Ctrl+Shift+R)
2. Check Vercel deployment logs
3. Verify `next.config.ts` is committed to git
4. Redeploy to Vercel

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
