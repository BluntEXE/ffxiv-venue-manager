import { Redis } from "@upstash/redis"

// Redis instance for caching
let redis: Redis | null = null

// Initialize Redis if credentials are available
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
  console.log("✅ Redis caching enabled")
} else {
  console.warn("⚠️  Redis caching disabled: Upstash credentials not configured")
}

/**
 * Cache TTL (Time To Live) configurations
 */
export const cacheTTL = {
  venue: 300, // 5 minutes
  venueSettings: 600, // 10 minutes
  membership: 300, // 5 minutes
  user: 300, // 5 minutes
}

/**
 * Cache key prefixes
 */
export const cacheKeys = {
  venue: (id: string) => `venue:${id}`,
  venueSettings: (id: string) => `venue:${id}:settings`,
  venueBySlug: (slug: string) => `venue:slug:${slug}`,
  membership: (userId: string, venueId: string) => `membership:${userId}:${venueId}`,
  userVenues: (userId: string) => `user:${userId}:venues`,
}

/**
 * Get cached data by key
 */
export async function getCached<T>(key: string): Promise<T | null> {
  if (!redis) return null

  try {
    const data = await redis.get<T>(key)
    return data
  } catch (error) {
    console.error(`Redis get error for key ${key}:`, error)
    return null
  }
}

/**
 * Set cached data with TTL
 */
export async function setCache<T>(
  key: string,
  data: T,
  ttlSeconds: number
): Promise<void> {
  if (!redis) return

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(data))
  } catch (error) {
    console.error(`Redis set error for key ${key}:`, error)
  }
}

/**
 * Invalidate cache by key or pattern
 */
export async function invalidateCache(keyOrPattern: string): Promise<void> {
  if (!redis) return

  try {
    // If it's a pattern (contains *), scan and delete
    if (keyOrPattern.includes("*")) {
      let cursor = "0"
      do {
        const [nextCursor, keys] = await redis.scan(cursor, {
          match: keyOrPattern,
          count: 100,
        })
        cursor = nextCursor

        if (keys.length > 0) {
          await redis.del(...keys)
        }
      } while (cursor !== "0")
    } else {
      // Simple key deletion
      await redis.del(keyOrPattern)
    }
  } catch (error) {
    console.error(`Redis invalidate error for key ${keyOrPattern}:`, error)
  }
}

/**
 * Invalidate multiple cache keys
 */
export async function invalidateCacheKeys(keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return

  try {
    await redis.del(...keys)
  } catch (error) {
    console.error("Redis batch invalidate error:", error)
  }
}

/**
 * Get or set cached data (cache-aside pattern)
 */
export async function getOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  // Try to get from cache
  const cached = await getCached<T>(key)
  if (cached !== null) {
    return cached
  }

  // Fetch fresh data
  const data = await fetchFn()

  // Store in cache
  await setCache(key, data, ttlSeconds)

  return data
}

export { redis }
