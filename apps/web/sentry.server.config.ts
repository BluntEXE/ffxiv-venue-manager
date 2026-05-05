// Server-side error reporting for the Node runtime.
// Routed to GlitchTip (Sentry-protocol compatible) at errors.xivvenuemanager.com.
import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Errors only — performance tracing and session replay are disabled by
  // default. Re-enable selectively if/when traffic justifies the volume.
  tracesSampleRate: 0,
  // Drop noisy client-disconnect / abort errors that are not actionable.
  ignoreErrors: [
    "ECONNRESET",
    "ECONNABORTED",
    "ETIMEDOUT",
    "AbortError",
  ],
})
