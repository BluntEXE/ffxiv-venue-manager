import { NextRequest, NextResponse } from 'next/server'
import { pluginAuthGate } from '@/lib/api/plugin-auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/plugin/patrons/banned?venueId=…
 *
 * Returns characterName/world/reason for patrons banned at this venue,
 * for the plugin to warn staff in its in-game guest list. Fetched once
 * per venue-select (see AutoLoadXivAppDataAsync /
 * LoadVenueDataWithFeedbackAsync) — not a live feed. Informational
 * only: the plugin has no way to actually block a banned patron from
 * entering.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, 'read')
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    if (!venueId || !auth.venues.includes(venueId)) {
      return NextResponse.json({ error: 'Invalid venue' }, { status: 400 })
    }

    const bannedPatrons = await prisma.patron.findMany({
      where: { venueId, isBanned: true },
      select: { characterName: true, world: true, banReason: true },
    })

    return NextResponse.json({
      bannedPatrons: bannedPatrons.map((p) => ({
        characterName: p.characterName,
        world: p.world,
        reason: p.banReason ?? '',
      })),
    })
  } catch (error) {
    console.error('[Plugin API] Error fetching banned patrons:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
