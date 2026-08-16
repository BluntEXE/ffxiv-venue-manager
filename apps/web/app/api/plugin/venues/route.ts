import { NextRequest, NextResponse } from 'next/server'
import { getUserVenues, pluginAuthGate } from '@/lib/api/plugin-auth'

/**
 * GET /api/plugin/venues
 * 
 * Returns list of venues the authenticated user has access to.
 * Used by the Dalamud plugin to show available venues.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, 'read')
    if (!gate.ok) return gate.response
    const { auth } = gate

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
