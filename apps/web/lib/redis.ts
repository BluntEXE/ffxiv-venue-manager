import Redis from "ioredis"

/**
 * Shared ioredis singleton. Both lib/rate-limit.ts and lib/redis-cache.ts
 * import this so they reuse one connection instead of opening two.
 *
 * No keyPrefix is set on the client - callers prepend their own namespace
 * ("rl:" for rate limit, "cache:" for cache) so a single connection can
 * serve both layers.
 *
 * Fail-open: if REDIS_URL is unset or the connection refuses, exported
 * `redis` is null. Callers must check `ready()` before issuing commands.
 */

let client: Redis | null = null
let errorLogged = false

if (process.env.REDIS_URL) {
  client = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    enableOfflineQueue: false,
  })
  client.on("error", (e) => {
    if (!errorLogged) {
      console.error("[redis] error:", e.message)
      errorLogged = true
    }
  })
  client.on("ready", () => {
    console.log("[redis] ready")
    errorLogged = false
  })
  client.connect().catch((e) => {
    console.error("[redis] initial connect failed:", e.message)
  })
}

export const redis = client

export function ready(): boolean {
  return client !== null && client.status === "ready"
}
