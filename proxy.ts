import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    // Allow the request to proceed
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname

        // Public paths that don't require authentication
        const publicPaths = ["/", "/auth/signin", "/auth/error", "/test"]
        const isPublicPath = publicPaths.some(p => path === p)

        if (isPublicPath) {
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
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)",
  ],
}
