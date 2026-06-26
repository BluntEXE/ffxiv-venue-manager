import { NextResponse } from "next/server"
import { syncAllFfxivVenues } from "@/lib/ffxivvenues"
import { verifyCronAuth } from "@/lib/cron-auth"

/**
 * Cron Job: Sync schedule data from ffxivvenues.com
 * Fetches venue data for all venues with ffxivVenueId set.
 *
 * QStash Configuration:
 * - URL: https://xivvenuemanager.com/api/cron/sync-ffxivvenues-schedule
 * - Schedule: Every 2 hours (cron: 0 *\/2 * * *)
 * - Method: GET
 * - Headers: { "authorization": "Bearer YOUR_CRON_SECRET" }
 */
export async function GET(request: Request) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const now = new Date()
    console.log(`[ffxivvenues Sync] Starting at ${now.toISOString()}`)

    const results = await syncAllFfxivVenues()

    console.log(`[ffxivvenues Sync] Complete: ${results.synced} synced, ${results.unlinked} unlinked, ${results.errors} errors`)

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    })
  } catch (error) {
    console.error("[ffxivvenues Sync] Fatal error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
