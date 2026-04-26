import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/plugin/events/active?venueId=...
 *
 * Returns the currently-active event at the given venue (startTime ≤ now ≤
 * endTime, status PUBLISHED or ACTIVE). Used by the Dalamud plugin to gate
 * patron-visit sync when `syncOnlyDuringEvents` is enabled - the plugin
 * caches the result for ~60s per venue, so analytics stay attributed to
 * the right event without hammering this endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized - missing API key' }, { status: 401 })
    }

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized - invalid API key' }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, 'read')
    if (limited) return limited

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    if (!venueId) {
      return NextResponse.json({ error: 'Missing venueId' }, { status: 400 })
    }

    // Venue scoping - the API key must be authorized for this venue. This
    // mirrors the same gate used by other /api/plugin/* routes.
    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: 'Venue not authorized for this key' }, { status: 403 })
    }

    const now = new Date()
    const event = await prisma.event.findFirst({
      where: {
        venueId,
        startTime: { lte: now },
        endTime: { gte: now },
        status: { in: ['PUBLISHED', 'ACTIVE'] },
      },
      orderBy: { startTime: 'desc' },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        status: true,
      },
    })

    if (!event) {
      return NextResponse.json({ active: false })
    }

    return NextResponse.json({
      active: true,
      eventId: event.id,
      title: event.title,
      scheduledStart: event.startTime.toISOString(),
      scheduledEnd: event.endTime.toISOString(),
      status: event.status,
    })
  } catch (error) {
    console.error('[Plugin API] Error fetching active event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
