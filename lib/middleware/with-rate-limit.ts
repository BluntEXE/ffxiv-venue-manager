import { NextRequest, NextResponse } from "next/server"
import { ratelimit } from "@/lib/rate-limit"

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

    // If rate limiter is not configured, allow the request but log warning
    if (!ratelimit) {
      console.warn("⚠️  Rate limiting not configured - request allowed")
      return handler(req, context)
    }

    // Get identifier for rate limiting (IP address or fallback)
    const identifier = getIdentifier(req)

    try {
      // Check rate limit
      const { success, limit, reset, remaining } = await ratelimit.limit(identifier)

      // Add rate limit headers to response
      const response = success
        ? await handler(req, context)
        : NextResponse.json(
            {
              error: "Too many requests",
              message: "You have exceeded the rate limit. Please try again later.",
            },
            { status: 429 }
          )

      // Add standard rate limit headers
      response.headers.set("X-RateLimit-Limit", limit.toString())
      response.headers.set("X-RateLimit-Remaining", remaining.toString())
      response.headers.set("X-RateLimit-Reset", reset.toString())

      return response
    } catch (error) {
      console.error("Rate limiting error:", error)
      // On rate limit check failure, allow the request but log error
      return handler(req, context)
    }
  }
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
