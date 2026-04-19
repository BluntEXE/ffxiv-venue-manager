import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { checkLimit, budgets } from "@/lib/rate-limit"

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
