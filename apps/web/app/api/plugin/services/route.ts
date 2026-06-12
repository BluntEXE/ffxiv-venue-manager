import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/plugin/services?venueId=…
 *
 * Returns the union of services the caller's assigned roles (primary
 * custom role + any additional roles) can perform at this venue. Shape
 * matches the plugin's ServicesResponse:
 *   { services: Service[], userRole: string | null }
 *
 * If the caller has no roles assigned at this venue (e.g. an OWNER who
 * hasn't been backfilled yet, or a STAFF with no assignment), services is
 * an empty list and userRole is null - plugin renders "Services: 0".
 *
 * Price is serialized as a string to match the plugin's Service.Price
 * field type (XIVAppApiClient.cs defines Price as string, so sending a
 * number would break System.Text.Json deserialization and fall through
 * to the silent-null path, giving the same "Services: 0" symptom we're
 * trying to fix).
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

    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, venueId, status: 'active' },
      include: {
        customRole: {
          include: { services: true },
        },
        additionalRoles: {
          include: { role: { include: { services: true } } },
        },
      },
    })

    const allRoles = [
      ...(membership?.customRole ? [membership.customRole] : []),
      ...(membership?.additionalRoles.map((ar) => ar.role) ?? []),
    ]

    const serviceMap = new Map<string, (typeof allRoles)[number]['services'][number]>()
    for (const role of allRoles) {
      for (const svc of role.services) {
        serviceMap.set(svc.id, svc)
      }
    }

    const services = Array.from(serviceMap.values()).map((svc) => ({
      id: svc.id,
      name: svc.name,
      description: svc.description,
      price: svc.price.toString(),
      category: svc.category,
    }))

    return NextResponse.json({
      services,
      userRole: allRoles.length > 0 ? allRoles.map((r) => r.name).join(' / ') : null,
    })
  } catch (error) {
    console.error('[Plugin API] Error fetching services:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
