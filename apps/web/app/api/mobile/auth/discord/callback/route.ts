import { NextRequest, NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { prisma } from "@/lib/prisma"
import { signMobileJwt, issueRefreshToken } from "@/lib/auth/mobile-auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token"
const DISCORD_USER_URL  = "https://discord.com/api/users/@me"

async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/mobile/auth/discord/callback`

  if (!code) {
    return NextResponse.redirect(
      `vmapp://auth/error?message=${encodeURIComponent("Missing code")}`
    )
  }

  try {
    const tokenRes = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      console.error("[MobileAuth] Discord exchange failed:", await tokenRes.text())
      return NextResponse.redirect(
        `vmapp://auth/error?message=${encodeURIComponent("Auth failed")}`
      )
    }

    const { access_token } = await tokenRes.json() as { access_token: string }

    const userRes = await fetch(DISCORD_USER_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const discordUser = await userRes.json() as {
      id: string; username: string; email?: string; avatar?: string | null
    }

    const image = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null

    // Find existing user via Account (same lookup path as PrismaAdapter)
    const account = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: { provider: "discord", providerAccountId: discordUser.id },
      },
      include: { user: true },
    })

    let user = account?.user ?? null

    if (!user) {
      user = await prisma.user.create({
        data: {
          name:      discordUser.username,
          email:     discordUser.email ?? null,
          image,
          discordId: discordUser.id,
          accounts: {
            create: {
              id:                nanoid(),
              type:              "oauth",
              provider:          "discord",
              providerAccountId: discordUser.id,
              access_token,
              scope:             "identify email",
            },
          },
        },
      })
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { name: discordUser.username, image },
      })
    }

    const jwt = await signMobileJwt({
      sub: user.id, email: user.email, name: user.name, image: user.image,
    })
    const refresh = await issueRefreshToken(
      user.id,
      req.headers.get("user-agent") ?? undefined
    )
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    return NextResponse.redirect(
      `vmapp://auth/callback?token=${encodeURIComponent(jwt)}&refresh=${encodeURIComponent(refresh)}&expiresAt=${encodeURIComponent(expiresAt)}`
    )
  } catch (err) {
    console.error("[MobileAuth] Callback error:", err)
    return NextResponse.redirect(
      `vmapp://auth/error?message=${encodeURIComponent("Server error")}`
    )
  }
}

export const GET = withRateLimit(handler, { requests: 20, window: "1 m" })
