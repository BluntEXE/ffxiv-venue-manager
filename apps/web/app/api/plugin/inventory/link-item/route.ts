import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

interface LinkItemPayload {
  venueId: string
  serviceId: string
  itemId: number
  itemName: string
  iconId?: number | null
}

/**
 * POST /api/plugin/inventory/link-item
 *
 * Link a Service to a real FFXIV item ID from the plugin's Inventory tab
 * (local Lumina search). OWNER/MANAGER only, same tier as editing a
 * Service from the dashboard.
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

    const body: LinkItemPayload = await request.json()
    const { venueId, serviceId, itemId, itemName, iconId } = body

    if (!venueId || !serviceId || !itemId || !itemName) {
      return NextResponse.json(
        { error: 'Missing required fields: venueId, serviceId, itemId, itemName' },
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
      data: { linkedItemId: itemId, linkedItemName: itemName, linkedItemIcon: iconId ?? null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Plugin API] Error linking item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
