import { NextResponse } from "next/server"
import crypto from "crypto"

/**
 * Validate cron request authentication using timing-safe comparison.
 * Returns null if authorized, or a NextResponse error if not.
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("CRON_SECRET not configured")
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${cronSecret}`

  // Timing-safe comparison to prevent timing attacks
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
