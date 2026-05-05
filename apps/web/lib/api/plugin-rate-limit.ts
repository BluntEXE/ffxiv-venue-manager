import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { checkLimit, budgets } from "@/lib/rate-limit"

/**
 * Per-IP pre-filter for plugin routes. Runs BEFORE validateApiKey so that
 * missing/bad/revoked keys still get throttled - otherwise an attacker
 * can brute-force the keyspace at full speed since 401 short-circuits
 * before any per-key counter exists.
 *
 * Budget chosen to allow a handful of FFXIV characters on shared NAT
 * polling normally (~2 req/min/char), while capping a key-stuffing
 * attacker to ~1 attempt/sec from any one IP.
 */
const ipBudget = { limit: 60, windowSec: 60 }

export async function enforcePluginIpRateLimit(
  request: NextRequest
): Promise<NextResponse | null> {
  const ip = getIp(request)
  const rl = await checkLimit(`plugin-ip:${ip}`, ipBudget.limit, ipBudget.windowSec)
  if (rl.success) return null
  return NextResponse.json(
    {
      error: "Too many requests",
      message: `Rate limit ${ipBudget.limit}/${ipBudget.windowSec}s exceeded`,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.reset),
        "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
      },
    }
  )
}

function getIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "anonymous"
}

/**
 * Per-API-key rate limit check for plugin routes.
 *
 * Call after validateApiKey() succeeds. Returns NextResponse(429) if the
 * caller has exceeded their budget, null otherwise.
 *
 * Keyed by SHA-256 prefix of the API key so the raw key never lands in
 * Redis. Per-key (not per-IP) because multiple venue staff can share a
 * NAT, and a compromised/runaway key is the actual abuse vector.
 */
export async function enforcePluginRateLimit(
  apiKey: string,
  kind: "read" | "write"
): Promise<NextResponse | null> {
  const budget = kind === "read" ? budgets.pluginRead : budgets.pluginWrite
  const id = createHash("sha256").update(apiKey).digest("hex").slice(0, 16)
  const rl = await checkLimit(`plugin:${id}`, budget.limit, budget.windowSec)
  if (rl.success) return null
  return NextResponse.json(
    {
      error: "Too many requests",
      message: `Rate limit ${budget.limit}/${budget.windowSec}s exceeded`,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.reset),
        "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
      },
    }
  )
}
