import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://cdn.discordapp.com https://raw.githubusercontent.com https://cdn.partake.gg",
    "font-src 'self' data:",
    "connect-src 'self' https://discord.com https://api.github.com https://qstash.upstash.io https://errors.xivvenuemanager.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ")
}

export default withAuth(
  function middleware(req) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
    const response = NextResponse.next()
    response.headers.set("x-nonce", nonce)
    response.headers.set("Content-Security-Policy", buildCsp(nonce))
    return response
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname

        // Public paths that don't require authentication
        const publicPaths = ["/", "/auth/signin", "/auth/error", "/test", "/stats"]
        const isPublicPath = publicPaths.some(p => path === p)
        const isPublicPrefix = path.startsWith("/guide/") || path.startsWith("/invite/") || path.startsWith("/api/invites/") || path.startsWith("/api/mobile/")

        if (isPublicPath || isPublicPrefix) {
          return true
        }

        // Protected paths require authentication
        return !!token
      },
    },
    pages: {
      signIn: "/auth/signin",
    },
  }
)

// Configure which routes use this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth routes)
     * - api/cron (Cron job endpoints - protected by CRON_SECRET)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    "/((?!api/auth|api/cron|api/plugin|api/stats|api/diag|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)",
  ],
}
