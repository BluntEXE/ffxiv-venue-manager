import { NextRequest, NextResponse } from "next/server"
import { revokeRefreshToken } from "@/lib/auth/mobile-auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { z } from "zod"

const schema = z.object({ refreshToken: z.string().min(1) })

async function handler(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  await revokeRefreshToken(parsed.data.refreshToken)
  return NextResponse.json({ ok: true })
}

export const POST = withRateLimit(handler, { requests: 10, window: "1 m" })
