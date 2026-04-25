import Redis from "ioredis"

/**
 * Fixed-window rate limiter backed by ioredis, with in-memory fallback.
 *
 * Why fixed-window not sliding: one INCR + EXPIRE per request is cheap and
 * the ~2x burst at window edges is acceptable for abuse protection. Sliding
 * windows need ZADD + ZREMRANGEBYSCORE + ZCARD every hit.
 *
 * Why fail-open to in-mem: Redis blip should not take the plugin offline.
 * In-mem limiter catches sustained abuse from a single process.
 */

export type RateLimitResult = {
  success: boolean
  limit: number
  remaining: number
  reset: number // ms since epoch when window rolls
}

let redis: Redis | null = null
let redisErrorLogged = false

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    enableOfflineQueue: false,
  })
  redis.on("error", (e) => {
    if (!redisErrorLogged) {
      console.error("[rate-limit] Redis error:", e.message)
      redisErrorLogged = true
    }
  })
  redis.on("ready", () => {
    console.log("[rate-limit] Redis ready")
    redisErrorLogged = false
  })
  redis.connect().catch((e) => {
    console.error("[rate-limit] Initial connect failed:", e.message)
  })
}

// In-memory fallback. Per-process, so multi-replica deployments lose shared
// state - fine here, only one venue-manager container.
const memBuckets = new Map<string, { count: number; reset: number }>()
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of memBuckets) if (v.reset <= now) memBuckets.delete(k)
}, 60_000).unref?.()

function memLimit(id: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const entry = memBuckets.get(id)
  if (!entry || entry.reset <= now) {
    const reset = now + windowMs
    memBuckets.set(id, { count: 1, reset })
    return { success: true, limit, remaining: limit - 1, reset }
  }
  entry.count++
  return {
    success: entry.count <= limit,
    limit,
    remaining: Math.max(0, limit - entry.count),
    reset: entry.reset,
  }
}

/**
 * Check and increment a rate limit counter.
 * @param identifier unique key (e.g. "plugin:<keyHash>" or "ip:<ip>")
 * @param limit max requests per window
 * @param windowSec window length in seconds
 */
export async function checkLimit(
  identifier: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const windowMs = windowSec * 1000
  const now = Date.now()
  const bucket = Math.floor(now / windowMs)
  const reset = (bucket + 1) * windowMs

  if (!redis || redis.status !== "ready") {
    return memLimit(identifier, limit, windowMs)
  }

  const key = `rl:${identifier}:${bucket}`
  try {
    const count = await redis.incr(key)
    if (count === 1) {
      // +1s safety margin so key outlives its window
      await redis.expire(key, windowSec + 1)
    }
    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      reset,
    }
  } catch (e) {
    return memLimit(identifier, limit, windowMs)
  }
}

/**
 * Budgets tuned for plugin traffic. Plugin polls ~once/min per active
 * screen, plus user-driven writes that are rare (clock-in 2x/shift, etc).
 * These caps are abuse-only territory - real use won't come close.
 */
export const budgets = {
  pluginRead: { limit: 120, windowSec: 60 }, // polling endpoints
  pluginWrite: { limit: 60, windowSec: 60 }, // logs + clock actions
  keyMgmt: { limit: 20, windowSec: 60 }, // UI-driven key CRUD
} as const

/**
 * Legacy export - kept null so any old imports fall through to the
 * middleware's in-memory fallback path. Removed once middleware is
 * refactored.
 */
export const ratelimit = null

/**
 * Rate limiting configurations for different endpoints (legacy).
 */
export const rateLimitConfig = {
  auth: { requests: 5, window: "1 m" },
  api: { requests: 30, window: "1 m" },
  read: { requests: 60, window: "1 m" },
  sensitive: { requests: 3, window: "1 m" },
}
