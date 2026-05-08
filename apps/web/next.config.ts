import path from "path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  // Required for pnpm workspaces: trace file deps from monorepo root
  outputFileTracingRoot: path.join(__dirname, "../../"),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Prevent clickjacking attacks
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Prevent MIME-sniffing attacks
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Control referrer information
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Control DNS prefetching
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          // Force HTTPS in production (HSTS)
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // Control browser features (disable potentially dangerous APIs)
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Content-Security-Policy is set per-request in proxy.ts with a unique nonce.
        ],
      },
    ]
  },
}

import { withSentryConfig } from "@sentry/nextjs"

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  widenClientFileUpload: false,
  disableLogger: true,
  sourcemaps: { disable: true },
})
