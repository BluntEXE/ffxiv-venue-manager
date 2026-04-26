import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/plugin/roles?venueId=…
 *
 * Returns ONLY the caller's assigned custom role at this venue, as a
 * 0-or-1 element list. Membership.roleId is a scalar nullable - a member
 * has exactly one custom role or none, so the plugin never needs a
 * multi-select here.
 *
 * Previously this route called getVenueRoles (returns the whole catalog)
 * behind a checkPermission('view') gate. That was wrong on two axes:
 *  - Over-restrictive: blocked STAFF + any future membership tier
 *    (STAFF users saw "Roles: (none fetched yet)" even when they had a
 *    legitimate custom role assigned).
 *  - Under-restrictive in semantics: returning the whole role catalog
 *    leaked roles the caller didn't hold. Callers should only see their
 *    own role.
 *
 * auth.venues.includes(venueId) already proves active membership, and the
 * prisma.membership.findFirst below is self-scoping - no extra
 * checkPermission is needed.
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
      include: { customRole: true },
    })

    const role = membership?.customRole
    const roles = role ? [{ id: role.id, name: role.name }] : []
    return NextResponse.json({ roles })
  } catch (error) {
    console.error('[Plugin API] Error fetching roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
