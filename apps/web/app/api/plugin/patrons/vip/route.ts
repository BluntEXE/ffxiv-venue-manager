import { NextRequest, NextResponse } from "next/server"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/plugin/patrons/vip?venueId=…
 *
 * Returns the characterName/world pairs flagged VIP at this venue, for
 * the plugin to badge its in-game guest list. Fetched once per
 * venue-select on the plugin side (see AutoLoadXivAppDataAsync /
 * LoadVenueDataWithFeedbackAsync) — not a live feed.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get("venueId")
    if (!venueId || !auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    const vipPatrons = await prisma.patron.findMany({
      where: { venueId, isVip: true },
      select: { characterName: true, world: true },
    })

    return NextResponse.json({ vipPatrons })
  } catch (error) {
    console.error("[Plugin API] Error fetching VIP patrons:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
