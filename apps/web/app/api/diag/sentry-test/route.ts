import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"

// Diagnostic endpoint that emits a single test event to GlitchTip and
// reports the resulting event id. Gated behind CRON_SECRET so it cannot
// be used to fill the issue tracker with garbage.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const eventId = Sentry.captureMessage("Sentry connectivity test", "info")
  await Sentry.flush(2000)

  return NextResponse.json({
    ok: true,
    eventId,
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    timestamp: new Date().toISOString(),
  })
}
