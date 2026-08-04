import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

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

    const vipPatrons = await prisma.patron.findMany({
      where: { venueId, isVip: true },
      select: { characterName: true, world: true },
    })

    return NextResponse.json({ vipPatrons })
  } catch (error) {
    console.error('[Plugin API] Error fetching VIP patrons:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
