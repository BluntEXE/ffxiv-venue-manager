import { NextResponse } from "next/server"
import { syncPartakeEvents } from "@/lib/partake"

/**
 * Cron Job: Sync events from Partake.gg
 * Fetches upcoming events for all venues with a linked Partake team ID.
 *
 * QStash Configuration:
 * - URL: https://xivvenuemanager.com/api/cron/sync-partake-events
 * - Schedule: Every hour (cron: 0 * * * *)
 * - Method: GET
 * - Headers: { "authorization": "Bearer YOUR_CRON_SECRET" }
 */
export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error("CRON_SECRET not configured")
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
    }

    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const now = new Date()
    console.log(`[Partake Sync] Starting at ${now.toISOString()}`)

    const results = await syncPartakeEvents()

    console.log(`[Partake Sync] Complete: ${results.created} created, ${results.updated} updated, ${results.skipped} unchanged, ${results.errors} errors`)

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    })
  } catch (error) {
    console.error("[Partake Sync] Fatal error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
