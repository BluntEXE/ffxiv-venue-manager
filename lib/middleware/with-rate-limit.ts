import { NextRequest, NextResponse } from "next/server"
import { ratelimit } from "@/lib/rate-limit"

/**
 * In-memory fallback rate limiter
 * Used when Redis is unavailable to prevent fail-open vulnerability
 */
class InMemoryRateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, value] of this.requests.entries()) {
      if (now > value.resetTime) {
        this.requests.delete(key)
      }
    }
  }

  limit(identifier: string, maxRequests: number, windowMs: number) {
    const now = Date.now()
    const entry = this.requests.get(identifier)

    if (!entry || now > entry.resetTime) {
      // New window - reset counter
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      })
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        reset: now + windowMs,
      }
    }

    // Increment counter
    entry.count++

    if (entry.count > maxRequests) {
      // Rate limit exceeded
      return {
        success: false,
        limit: maxRequests,
        remaining: 0,
        reset: entry.resetTime,
      }
    }

    // Still within limit
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - entry.count,
      reset: entry.resetTime,
    }
  }
}

// Create singleton in-memory rate limiter
const inMemoryLimiter = new InMemoryRateLimiter()

/**
 * Rate limiting middleware for API routes
 * Wraps an API handler with rate limiting protection
 *
 * @param handler - The API route handler to wrap
 * @param options - Rate limiting options
 * @returns Wrapped handler with rate limiting
 *
 * @example
 * ```ts
 * export const GET = withRateLimit(
 *   async (req) => {
 *     // Your handler logic
 *     return NextResponse.json({ data: "..." })
 *   },
 *   { requests: 10, window: "1 m" }
 * )
 * ```
 */
export function withRateLimit<T = unknown>(
  handler: (req: NextRequest, context?: T) => Promise<NextResponse>,
  options?: {
    requests?: number
    window?: string
    bypassForDevelopment?: boolean
  }
) {
  return async (req: NextRequest, context?: T): Promise<NextResponse> => {
    // Bypass rate limiting in development mode if specified
    if (options?.bypassForDevelopment && process.env.NODE_ENV === "development") {
      return handler(req, context)
    }

    // Default rate limit: 60 requests per minute
    const maxRequests = options?.requests || 200
    const windowStr = options?.window || "1 m"
    const windowMs = parseWindow(windowStr)

    // Get identifier for rate limiting (IP address or fallback)
    const identifier = getIdentifier(req)

    let rateLimitResult: {
      success: boolean
      limit: number
      remaining: number
      reset: number
    }

    try {
      // Try to use Redis-based rate limiting first
      if (ratelimit) {
        rateLimitResult = await ratelimit.limit(identifier)
      } else {
        // No Redis configured - use in-memory fallback
        console.warn("⚠️  Rate limiting using in-memory fallback (Redis not configured)")
        rateLimitResult = inMemoryLimiter.limit(identifier, maxRequests, windowMs)
      }
    } catch (error) {
      // Redis error - fall back to in-memory rate limiting
      console.error("Rate limiting error (using in-memory fallback):", error)
      rateLimitResult = inMemoryLimiter.limit(identifier, maxRequests, windowMs)
    }

    // Add rate limit headers to response
    const response = rateLimitResult.success
      ? await handler(req, context)
      : NextResponse.json(
          {
            error: "Too many requests",
            message: "You have exceeded the rate limit. Please try again later.",
          },
          { status: 429 }
        )

    // Add standard rate limit headers
    response.headers.set("X-RateLimit-Limit", rateLimitResult.limit.toString())
    response.headers.set("X-RateLimit-Remaining", rateLimitResult.remaining.toString())
    response.headers.set("X-RateLimit-Reset", rateLimitResult.reset.toString())

    return response
  }
}

/**
 * Parse window string (e.g., "1 m", "30 s") into milliseconds
 */
function parseWindow(window: string): number {
  const match = window.match(/^(\d+)\s*([smhd])$/)
  if (!match) {
    console.warn(`Invalid window format: ${window}, using 1 minute default`)
    return 60000
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
  }

  return value * multipliers[unit]
}

/**
 * Get unique identifier for rate limiting
 * Uses IP address with fallbacks
 */
function getIdentifier(req: NextRequest): string {
  // Try to get IP from various headers (in order of preference)
  const forwarded = req.headers.get("x-forwarded-for")
  const realIp = req.headers.get("x-real-ip")
  const cfConnectingIp = req.headers.get("cf-connecting-ip") // Cloudflare

  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(",")[0].trim()
  }

  if (realIp) {
    return realIp
  }

  if (cfConnectingIp) {
    return cfConnectingIp
  }

  // Fallback to a generic identifier
  // In development/testing, this ensures rate limiting still works
  return "anonymous"
}

/**
 * Simple helper to create a rate-limited GET handler
 */
export function rateLimitedGET(
  handler: (req: NextRequest) => Promise<NextResponse>,
  requests: number = 30
) {
  return withRateLimit(handler, { requests, window: "1 m" })
}

/**
 * Simple helper to create a rate-limited POST handler
 */
export function rateLimitedPOST(
  handler: (req: NextRequest) => Promise<NextResponse>,
  requests: number = 10
) {
  return withRateLimit(handler, { requests, window: "1 m" })
}
