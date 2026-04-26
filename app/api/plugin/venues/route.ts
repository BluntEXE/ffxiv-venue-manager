import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, getUserVenues } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'

/**
 * GET /api/plugin/venues
 * 
 * Returns list of venues the authenticated user has access to.
 * Used by the Dalamud plugin to show available venues.
 */
export async function GET(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get('x-api-key')
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Unauthorized - missing API key' },
        { status: 401 }
      )
    }
    
    const auth = await validateApiKey(apiKey)
    
    if (!auth || !auth.userId) {
      return NextResponse.json(
        { error: 'Unauthorized - invalid API key' },
        { status: 401 }
      )
    }

    const limited = await enforcePluginRateLimit(apiKey, 'read')
    if (limited) return limited

    const venues = await getUserVenues(auth.userId)
    
    // If key is venue-specific, filter to only that venue
    if (auth.venues.length === 1) {
      const filtered = venues.filter(v => v.id === auth.venues[0])
      return NextResponse.json({
        venues: filtered.map(v => ({
          id: v.id,
          name: v.name,
          slug: v.slug,
          role: v.role
        }))
      })
    }
    
    return NextResponse.json({
      venues: venues.map(v => ({
        id: v.id,
        name: v.name,
        role: v.role
      }))
    })
  } catch (error) {
    console.error('[Plugin API] Error fetching venues:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
