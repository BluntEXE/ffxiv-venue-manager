import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

interface RestockPayload {
  venueId: string
  serviceId: string
  stockCount: number
}

/**
 * POST /api/plugin/inventory/restock
 *
 * Set a Service's stockCount from the plugin's Inventory tab. OWNER/
 * MANAGER only — the automatic per-sale decrement (any staff, via
 * createTransaction) is a separate path from this explicit management
 * action.
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

    const body: RestockPayload = await request.json()
    const { venueId, serviceId, stockCount } = body

    if (!venueId || !serviceId || typeof stockCount !== 'number' || stockCount < 0) {
      return NextResponse.json(
        { error: 'Missing or invalid fields: venueId, serviceId, stockCount (>= 0)' },
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

    const service = await prisma.service.findFirst({ where: { id: serviceId, venueId } })
    if (!service) {
      return NextResponse.json({ error: 'Service not found in this venue' }, { status: 404 })
    }

    await prisma.service.update({
      where: { id: serviceId },
      data: { stockCount },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Plugin API] Error restocking:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
