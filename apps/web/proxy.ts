import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development"
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // No nonce here: nonces don't apply to inline style="" attributes, and
    // including one causes browsers to ignore 'unsafe-inline' per spec,
    // blocking every style={{...}} in the app (e.g. /stats progress bars).
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://cdn.discordapp.com https://raw.githubusercontent.com https://cdn.partake.gg${process.env.MINIO_PUBLIC_URL ? ` ${process.env.MINIO_PUBLIC_URL}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self' https://discord.com https://api.github.com https://qstash.upstash.io https://errors.xivvenuemanager.com${process.env.MINIO_PUBLIC_URL ? ` ${process.env.MINIO_PUBLIC_URL}` : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ")
}

const PUBLIC_PATHS = ["/privacy", "/", "/auth/signin", "/auth/error", "/auth/signout-shoutcrafter", "/test", "/stats", "/discover", "/sitemap.xml"]
const PUBLIC_PREFIXES = ["/.well-known/", "/guide/", "/invite/", "/venues/", "/following", "/discover/", "/api/invites/", "/api/mobile/", "/api/shout-crafter/", "/api/feedback", "/api/stats"]

export async function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = buildCsp(nonce)

  const path = req.nextUrl.pathname
  const isPublic =
    PUBLIC_PATHS.some(p => path === p) ||
    PUBLIC_PREFIXES.some(p => path.startsWith(p))

  if (!isPublic) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.redirect(new URL("/auth/signin", req.url))
    }
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export const config = {
  matcher: [
    "/((?!api/auth|api/cron|api/plugin|api/stats|api/homepage|api/diag|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.webp).*)",
  ],
}
