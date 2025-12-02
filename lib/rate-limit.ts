import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// Rate limiter instance
let ratelimit: Ratelimit | null = null

// Initialize rate limiter if Redis credentials are available
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "10 s"), // Increased from 10 to 30 for faster navigation
    analytics: true,
    prefix: "@upstash/ratelimit",
  })

  console.log("✅ Rate limiting enabled with Upstash Redis")
} else {
  console.warn(
    "⚠️  Rate limiting disabled: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN not configured"
  )
  console.warn("   Add Upstash Redis credentials to enable rate limiting in production")
}

export { ratelimit }

/**
 * Rate limiting configurations for different endpoints
 */
export const rateLimitConfig = {
  // Strict limits for authentication endpoints
  auth: {
    requests: 5,
    window: "1 m",
  },
  // Standard limits for API endpoints
  api: {
    requests: 30,
    window: "1 m",
  },
  // Lenient limits for read-only endpoints
  read: {
    requests: 60,
    window: "1 m",
  },
  // Very strict limits for sensitive operations
  sensitive: {
    requests: 3,
    window: "1 m",
  },
}
