import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
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
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, 'read')
    if (limited) return limited

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
