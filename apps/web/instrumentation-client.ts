// Client-side error reporting for the browser. NEXT_PUBLIC_ prefix so the
// DSN is inlined into the client bundle (DSN is not a secret — it only
// authorises posting events, not reading them).
import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  // No session replay. Privacy-first default; venue dashboards contain
  // sensitive financial-adjacent data we do not want recorded.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  ignoreErrors: [
    // Browser noise that is not actionable for the app.
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
  ],
})
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
