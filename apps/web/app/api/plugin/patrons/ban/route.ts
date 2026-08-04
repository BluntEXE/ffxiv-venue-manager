import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

interface BanPatronPayload {
  venueId: string
  characterName: string
  world: string
  reason: string
}

/**
 * POST /api/plugin/patrons/ban
 *
 * Ban a patron from the Dalamud plugin (/xvm ban! <reason>). Finds or
 * creates the Patron row (same upsert-by-identity approach the
 * dashboard's patron-logs page uses), then sets the ban fields.
 * OWNER/MANAGER only, same tier as the dashboard ban route.
 */
export async function POST(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, 'write')
    if (limited) return limited

    const body: BanPatronPayload = await request.json()
    const { venueId, characterName, world, reason } = body

    if (!venueId || !characterName || !reason || !reason.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: venueId, characterName, reason' },
        { status: 400 }
      )
    }

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: 'Invalid venue' }, { status: 400 })
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, venueId, status: 'active' },
    })
    if (!membership || !['OWNER', 'MANAGER'].includes(membership.role)) {
      return NextResponse.json({ error: 'Owner or Manager role required' }, { status: 403 })
    }

    const worldValue = world ?? ''

    await prisma.patron.upsert({
      where: {
        venueId_characterName_world: { venueId, characterName, world: worldValue },
      },
      create: {
        venueId,
        characterName,
        world: worldValue,
        isBanned: true,
        banReason: reason.trim(),
        bannedAt: new Date(),
        bannedById: auth.userId,
      },
      update: {
        isBanned: true,
        banReason: reason.trim(),
        bannedAt: new Date(),
        bannedById: auth.userId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Plugin API] Error banning patron:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
