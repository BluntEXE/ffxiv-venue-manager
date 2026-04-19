import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit } from '@/lib/api/plugin-rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/plugin/roles/[venueId]
 *
 * Path-param variant of /api/plugin/roles — same semantics. Returns only
 * the caller's assigned custom role at the venue, as a 0-or-1 element
 * list. See ../route.ts for the rationale on why checkPermission('view')
 * was removed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, 'read')
    if (limited) return limited

    const { venueId } = await params
    if (!venueId || !auth.venues.includes(venueId)) {
      return NextResponse.json({ error: 'Invalid venue' }, { status: 400 })
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, venueId, status: 'active' },
      include: { customRole: true },
    })

    const role = membership?.customRole
    const roles = role
      ? [{ id: role.id, name: role.name, color: role.color ?? null }]
      : []
    return NextResponse.json({ roles })
  } catch (error) {
    console.error('[Plugin API] Error fetching roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
