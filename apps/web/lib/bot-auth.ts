import { NextResponse } from "next/server"
import crypto from "crypto"

/**
 * Validate that a request came from the Aetherlink bot, using timing-safe
 * comparison. Returns null if authorized, or a NextResponse error if not.
 * Mirrors verifyCronAuth in cron-auth.ts, but for bot -> web requests
 * (the reverse direction of the existing EORZEA_BOT_WEBHOOK_SECRET, which
 * is used for web -> bot requests).
 */
export function verifyBotAuth(request: Request): NextResponse | null {
  const botSecret = process.env.EORZEA_BOT_API_SECRET
  if (!botSecret) {
    console.error("EORZEA_BOT_API_SECRET not configured")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }

  const provided = request.headers.get("x-bot-secret") ?? ""

  const a = Buffer.from(provided)
  const b = Buffer.from(botSecret)

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
