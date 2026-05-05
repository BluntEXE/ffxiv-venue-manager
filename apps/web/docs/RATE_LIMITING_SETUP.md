# Rate Limiting Setup Guide

## Overview

Rate limiting is implemented using **Upstash Redis** to protect your API endpoints from abuse and DDoS attacks. The system is designed to work gracefully without Redis (for development) and with Redis (for production).

---

## 🚀 Quick Setup (5 minutes)

### Step 1: Create Upstash Redis Database

1. **Go to**: https://console.upstash.com/redis
2. **Sign in** or create account (GitHub/Google available)
3. Click **"Create Database"**

### Step 2: Configure Database

- **Name**: `venue-manager-ratelimit` (or any name)
- **Region**: Choose closest to your app deployment
- **Type**: Choose **"Regional"** (free tier)
- **TLS**: Enable (recommended)

Click **"Create"**

### Step 3: Get Credentials

After creating, you'll see the database dashboard:

1. Scroll to **"REST API"** section
2. Copy **"UPSTASH_REDIS_REST_URL"**
3. Copy **"UPSTASH_REDIS_REST_TOKEN"**

### Step 4: Add to Environment Variables

**Local Development** (`.env`):
```bash
UPSTASH_REDIS_REST_URL="https://your-region.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_token_here"
```

**Production** (Vercel/etc):
```bash
vercel env add UPSTASH_REDIS_REST_URL production
# Paste your URL

vercel env add UPSTASH_REDIS_REST_TOKEN production
# Paste your token
```

### Step 5: Restart Your App

```bash
npm run dev
```

You should see: `✅ Rate limiting enabled with Upstash Redis`

---

## 📋 Current Rate Limits

| Endpoint Type | Requests | Window | Use Case |
|--------------|----------|--------|----------|
| **Authentication** | 5 | 1 minute | Login, signup |
| **Sensitive Operations** | 3 | 1 minute | Password reset, delete account |
| **Standard API** | 30 | 1 minute | CRUD operations |
| **Read-Only** | 60 | 1 minute | GET requests |

---

## 🛠️ Using Rate Limiting in Your Code

### Option 1: Wrap Existing Handler

```typescript
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { NextResponse } from "next/server"

export const GET = withRateLimit(
  async (req) => {
    // Your existing handler logic
    const data = await fetchData()
    return NextResponse.json({ data })
  },
  { requests: 30, window: "1 m" }
)
```

### Option 2: Use Helper Functions

```typescript
import { rateLimitedGET, rateLimitedPOST } from "@/lib/middleware/with-rate-limit"

// GET with 30 req/min (default)
export const GET = rateLimitedGET(async (req) => {
  return NextResponse.json({ data: "..." })
})

// POST with 10 req/min (default)
export const POST = rateLimitedPOST(async (req) => {
  return NextResponse.json({ success: true })
})
```

### Option 3: Custom Limits

```typescript
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

// Very strict for sensitive operations
export const DELETE = withRateLimit(
  async (req) => {
    // Delete user account
    return NextResponse.json({ success: true })
  },
  { requests: 3, window: "1 m" }
)

// Lenient for public endpoints
export const GET = withRateLimit(
  async (req) => {
    return NextResponse.json({ data: "public" })
  },
  { requests: 100, window: "1 m" }
)
```

---

## 🧪 Testing Rate Limiting

### Test Script

Create `test-rate-limit.js`:

```javascript
const baseUrl = "http://localhost:3000"

async function testRateLimit() {
  console.log("Testing rate limiting...")

  for (let i = 1; i <= 35; i++) {
    const response = await fetch(`${baseUrl}/api/venues`)

    console.log(`Request ${i}:`, {
      status: response.status,
      limit: response.headers.get("X-RateLimit-Limit"),
      remaining: response.headers.get("X-RateLimit-Remaining"),
      reset: response.headers.get("X-RateLimit-Reset"),
    })

    if (response.status === 429) {
      console.log("✅ Rate limit working! Request blocked.")
      break
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

testRateLimit()
```

Run with: `node test-rate-limit.js`

### Expected Output

```
Request 1: { status: 200, limit: '30', remaining: '29', reset: '...' }
Request 2: { status: 200, limit: '30', remaining: '28', reset: '...' }
...
Request 30: { status: 200, limit: '30', remaining: '0', reset: '...' }
Request 31: { status: 429, limit: '30', remaining: '0', reset: '...' }
✅ Rate limit working! Request blocked.
```

---

## 🔧 Configuration Options

### Customize Limits

Edit `lib/rate-limit.ts`:

```typescript
export const rateLimitConfig = {
  auth: {
    requests: 5,      // Change to 10 for more lenient
    window: "1 m",
  },
  api: {
    requests: 30,     // Change to 60 for higher traffic
    window: "1 m",
  },
  // Add custom configurations
  upload: {
    requests: 5,
    window: "5 m",
  },
}
```

### Change Window Durations

Supported formats:
- `"10 s"` - 10 seconds
- `"1 m"` - 1 minute
- `"1 h"` - 1 hour
- `"1 d"` - 1 day

### Bypass Development Mode

```typescript
export const GET = withRateLimit(
  async (req) => { /* ... */ },
  {
    requests: 30,
    window: "1 m",
    bypassForDevelopment: true // No rate limiting in dev
  }
)
```

---

## 🚨 Rate Limit Response

When rate limit is exceeded, the API returns:

```json
{
  "error": "Too many requests",
  "message": "You have exceeded the rate limit. Please try again later."
}
```

**Status Code**: `429 Too Many Requests`

**Headers**:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## 💰 Upstash Free Tier Limits

**Free Plan Includes**:
- 10,000 commands per day
- 256 MB storage
- Multi-region replication
- REST API access
- **No credit card required**

For a venue management app:
- ~30 requests/min per user
- Supports ~300 active users daily
- Well within free tier limits

---

## 🔒 Security Best Practices

### 1. Different Limits for Different Endpoints

```typescript
// Public endpoints - lenient
GET /api/venues → 60 requests/min

// Authenticated operations - moderate
POST /api/venues/[id]/events → 30 requests/min

// Sensitive operations - strict
DELETE /api/venues/[id] → 3 requests/min
POST /api/auth/reset-password → 5 requests/min
```

### 2. IP-Based Identification

The rate limiter uses IP address from:
1. `x-forwarded-for` header (proxies/load balancers)
2. `x-real-ip` header (Nginx)
3. `cf-connecting-ip` header (Cloudflare)
4. Fallback to "anonymous" (development)

### 3. Monitor Usage

Check Upstash Dashboard:
- **Commands**: See rate limit checks
- **Bandwidth**: Monitor API usage
- **Latency**: Ensure fast responses

### 4. Set Up Alerts

In Upstash Dashboard → Alerts:
- Alert when reaching 80% of daily limit
- Alert on unusual spike in requests

---

## 🐛 Troubleshooting

### Rate Limiting Not Working

**Symptom**: Requests not being limited

**Check**:
1. Redis credentials in `.env`
2. Console shows: `✅ Rate limiting enabled`
3. Headers present: `X-RateLimit-*`

### All Requests Blocked

**Symptom**: Immediate 429 errors

**Fix**:
1. Check system clock (Redis uses timestamps)
2. Verify window duration is correct
3. Clear Redis database if needed

### Redis Connection Errors

**Symptom**: Rate limiting falls back to allowing all requests

**Check**:
1. Upstash Redis database is active
2. Credentials are correct
3. IP not blocked by Upstash firewall

### Development Mode

**Symptom**: Want to disable rate limiting locally

**Options**:
1. Don't add Redis credentials to `.env` (auto-disabled)
2. Use `bypassForDevelopment: true` option
3. Set very high limits for development

---

## 📊 Monitoring Rate Limits

### Check Current Limits

```bash
curl -I http://localhost:3000/api/venues
```

Look for headers:
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1700000000
```

### Dashboard Monitoring

Upstash Dashboard shows:
- Total requests
- Rate limit hits
- Geographic distribution
- Peak usage times

---

## 🔄 Migrating to Production

### Vercel Deployment

```bash
# Add environment variables
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production

# Deploy
vercel --prod
```

### Other Platforms

**Netlify**:
- Site settings → Environment variables
- Add `UPSTASH_REDIS_REST_URL` and token

**Railway**:
- Project → Variables
- Add both Redis credentials

**Docker**:
```dockerfile
ENV UPSTASH_REDIS_REST_URL=https://...
ENV UPSTASH_REDIS_REST_TOKEN=...
```

---

## 📚 Additional Resources

- [Upstash Redis Docs](https://upstash.com/docs/redis)
- [Rate Limiting Docs](https://upstash.com/docs/redis/features/ratelimiting)
- [Upstash Console](https://console.upstash.com/)

---

**Last Updated**: November 27, 2025
**Status**: Production-ready with Upstash Redis
