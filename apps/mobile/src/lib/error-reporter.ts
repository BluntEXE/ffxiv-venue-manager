// Lightweight GlitchTip/Sentry error reporter — pure JS, no native deps.
// Uses the Sentry envelope HTTP API which GlitchTip is compatible with.
import { Platform } from 'react-native'
import Constants from 'expo-constants'

const DSN = 'https://0361538a2d1e42a8934f4d255890ad8d@errors.xivvenuemanager.com/1'

function parseDsn(dsn: string) {
  const url = new URL(dsn)
  return {
    key: url.username,
    host: url.hostname,
    projectId: url.pathname.replace('/', ''),
    endpoint: `${url.protocol}//${url.hostname}/api/${url.pathname.replace('/', '')}/envelope/`,
  }
}

const { key, endpoint, projectId } = parseDsn(DSN)

export async function reportError(error: Error, context?: string): Promise<void> {
  if (__DEV__) return // only report in production

  try {
    const eventId = Math.random().toString(36).slice(2, 18)
    const timestamp = new Date().toISOString().replace('Z', '')

    const event = {
      event_id: eventId,
      timestamp,
      platform: 'javascript',
      level: 'error',
      tags: {
        platform: Platform.OS,
        context: context ?? 'unknown',
      },
      sdk: { name: 'xiv-mobile-reporter', version: '1.0.0' },
      release: Constants.expoConfig?.version ?? '1.0.0',
      exception: {
        values: [{
          type: error.name || 'Error',
          value: error.message,
          stacktrace: {
            frames: (error.stack ?? '').split('\n').slice(1).map((line) => ({
              filename: line.trim(),
              in_app: !line.includes('node_modules'),
            })),
          },
        }],
      },
    }

    const envelope = [
      JSON.stringify({ dsn: DSN, event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
    ].join('\n')

    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7,sentry_key=${key}` },
      body: envelope,
    })
  } catch {
    // never crash on error reporting
  }
}

// Global unhandled JS error handler
export function setupErrorReporting() {
  const originalHandler = ErrorUtils.getGlobalHandler()
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, isFatal ? 'fatal' : 'unhandled')
    originalHandler?.(error, isFatal)
  })
}
