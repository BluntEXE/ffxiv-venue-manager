import { NextRequest, NextResponse } from "next/server"
import { checkLimit } from "@/lib/rate-limit"

/**
 * Rate limiting middleware for web API routes.
 *
 * Wraps a handler and checks the requesting IP against a per-route budget.
 * Backed by the shared Redis limiter when available, in-memory fallback
 * otherwise (see lib/rate-limit.ts).
 *
 * Plugin routes do NOT use this - they key off the API key via
 * lib/api/plugin-rate-limit.ts so shared-NAT users aren't collapsed.
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
    if (options?.bypassForDevelopment && process.env.NODE_ENV === "development") {
      return handler(req, context)
    }

    const maxRequests = options?.requests || 200
    const windowSec = Math.max(1, Math.floor(parseWindow(options?.window || "1 m") / 1000))
    const identifier = `ip:${getIdentifier(req)}`

    const rl = await checkLimit(identifier, maxRequests, windowSec)

    const response = rl.success
      ? await handler(req, context)
      : NextResponse.json(
          {
            error: "Too many requests",
            message: "You have exceeded the rate limit. Please try again later.",
          },
          { status: 429 }
        )

    response.headers.set("X-RateLimit-Limit", rl.limit.toString())
    response.headers.set("X-RateLimit-Remaining", rl.remaining.toString())
    response.headers.set("X-RateLimit-Reset", rl.reset.toString())
    if (!rl.success) {
      response.headers.set(
        "Retry-After",
        String(Math.ceil((rl.reset - Date.now()) / 1000))
      )
    }
    return response
  }
}

function parseWindow(window: string): number {
  const match = window.match(/^(\d+)\s*([smhd])$/)
  if (!match) return 60000
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

function getIdentifier(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  const realIp = req.headers.get("x-real-ip")
  const cfConnectingIp = req.headers.get("cf-connecting-ip")
  if (forwarded) return forwarded.split(",")[0].trim()
  if (realIp) return realIp
  if (cfConnectingIp) return cfConnectingIp
  return "anonymous"
}
