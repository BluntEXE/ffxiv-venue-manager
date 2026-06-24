# Mobile Feedback + GlitchTip — Design Spec
**Date:** 2026-06-24
**Status:** Approved

## Overview

Two independent additions to the mobile app:
1. **Feedback screen** -- hidden route accessible via a subtle Settings link. Submits to the existing web feedback system via a new mobile API endpoint.
2. **GlitchTip crash reporting** -- `@sentry/react-native` wired to the self-hosted GlitchTip instance. Automatic crash capture, no UI.

## Part 1: Feedback

### New API: `POST /api/mobile/feedback`

Auth: `requireMobileAuth` / `isAuthFailure`.

Body: `{ category, subject, description }` -- same fields as existing `/api/feedback`.

Valid categories: `BUG_REPORT | FEATURE_REQUEST | IMPROVEMENT | GENERAL`.

Implementation: creates `prisma.feedback` record, fires Discord webhook via `sendDiscordWebhook` + `formatFeedbackSubmittedEmbed` (same helpers as web route). Tags `userAgent` from request headers. No CORS needed (mobile only).

### New screen: `apps/mobile/app/feedback.tsx`

Standalone stack screen (no tab). Fields:
- **Category** -- four buttons (pill style): Bug Report / Feature Request / Improvement / General. Default: General.
- **Subject** -- single-line text input, required, max 100 chars
- **Description** -- multiline text input, required, min 10 chars
- **Submit** button -- disabled until both fields valid, shows spinner during submit

On success: show "Thanks for your feedback!" message, navigate back after 1.5s.
On error: inline error text below submit button.

Uses `apiFetch` for auth. Styled with XIV blue design system (same patterns as other screens).

### Settings link

In `apps/mobile/app/(app)/settings.tsx`, add a new "About" section row:

```
Send Feedback  →
```

Navigates to `/(app)/feedback` (or the feedback modal route). Styled subtly -- same as other secondary rows, no special prominence. Sits at the bottom of the About section below the existing Website row.

## Part 2: GlitchTip Crash Reporting

### Dependencies

Add to `apps/mobile/package.json`:
- `@sentry/react-native` (latest compatible with Expo SDK 51)

### Initialisation

In `apps/mobile/app/_layout.tsx`, init Sentry before the root navigator renders:

```typescript
import * as Sentry from '@sentry/react-native'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0,         // errors only, no performance tracing
  enableNativeNagger: false,   // suppress native setup warning in Expo managed
})
```

### Environment variable

Add to `apps/mobile/eas.json` in all three build profiles (`development`, `preview`, `production`):

```json
"EXPO_PUBLIC_SENTRY_DSN": "https://0361538a2d1e42a8934f4d255890ad8d@errors.xivvenuemanager.com/1"
```

### What gets captured

- Unhandled JS exceptions
- Unhandled promise rejections
- Manual `Sentry.captureException(error)` calls (optional, for future use)

Performance tracing is disabled (`tracesSampleRate: 0`) to avoid noise.

## Files

| File | Action |
|------|--------|
| `apps/web/app/api/mobile/feedback/route.ts` | Create |
| `apps/mobile/app/feedback.tsx` | Create |
| `apps/mobile/app/(app)/settings.tsx` | Modify — add feedback link in About section |
| `apps/mobile/app/_layout.tsx` | Modify — init Sentry |
| `apps/mobile/package.json` | Modify — add `@sentry/react-native` |
| `apps/mobile/eas.json` | Modify — add `EXPO_PUBLIC_SENTRY_DSN` to all profiles |
