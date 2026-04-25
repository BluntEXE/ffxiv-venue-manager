import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/plugin/services?venueId=…
 *
 * Returns the services the caller's assigned custom role can perform at
 * this venue. Shape matches the plugin's ServicesResponse:
 *   { services: Service[], userRole: string | null }
 *
 * If the caller has no customRole at this venue (e.g. an OWNER who hasn't
 * been backfilled yet, or a STAFF with no assignment), services is an
 * empty list and userRole is null - plugin renders "Services: 0".
 *
 * Price is serialized as a string to match the plugin's Service.Price
 * field type (XIVAppApiClient.cs defines Price as string, so sending a
 * number would break System.Text.Json deserialization and fall through
 * to the silent-null path, giving the same "Services: 0" symptom we're
 * trying to fix).
 */
export async function GET(request: NextRequest) {
  try {
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

    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, venueId, status: 'active' },
      include: {
        customRole: {
          include: { services: true },
        },
      },
    })

    const role = membership?.customRole
    const services = (role?.services ?? []).map((svc) => ({
      id: svc.id,
      name: svc.name,
      description: svc.description,
      price: svc.price.toString(),
      category: svc.category,
    }))

    return NextResponse.json({
      services,
      userRole: role?.name ?? null,
    })
  } catch (error) {
    console.error('[Plugin API] Error fetching services:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
