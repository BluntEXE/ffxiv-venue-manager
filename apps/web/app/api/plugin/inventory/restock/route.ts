import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'
import { invalidateCache, cacheKeys } from '@/lib/redis-cache'

const restockSchema = z.object({
  venueId: z.string().min(1, 'venueId is required'),
  serviceId: z.string().min(1, 'serviceId is required'),
  stockCount: z.number().int('stockCount must be a whole number').min(0, 'stockCount must be non-negative'),
})

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

    const body = await request.json()
    const { venueId, serviceId, stockCount } = restockSchema.parse(body)

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

    await invalidateCache(cacheKeys.venueServices(venueId))

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('[Plugin API] Error restocking:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
