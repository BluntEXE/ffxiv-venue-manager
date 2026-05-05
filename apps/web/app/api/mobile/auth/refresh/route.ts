import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { rotateRefreshToken, signMobileJwt } from "@/lib/auth/mobile-auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { z } from "zod"

const schema = z.object({ refreshToken: z.string().min(1) })

async function handler(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const result = await rotateRefreshToken(
    parsed.data.refreshToken,
    req.headers.get("user-agent") ?? undefined
  )
  if (!result) {
    return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } })
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 })
  }

  const jwt = await signMobileJwt({
    sub: user.id, email: user.email, name: user.name, image: user.image,
  })

  return NextResponse.json({
    token:        jwt,
    refreshToken: result.newRaw,
    expiresAt:    new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  })
}

export const POST = withRateLimit(handler, { requests: 10, window: "1 m" })
