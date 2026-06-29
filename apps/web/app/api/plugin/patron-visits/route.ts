import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkPermission, logPatronVisit, getPatronVisits } from '@/lib/api/plugin-auth'
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from '@/lib/api/plugin-rate-limit'
import { venueEventBus } from '@/lib/sse/venue-events'
import { nanoid } from 'nanoid'
import { prisma } from '@/lib/prisma'
import { postVenueGraduation } from '@/lib/discord-feed'

const GRADUATION_MILESTONES = [100, 500, 1000]

interface PatronVisitPayload {
  venueId: string
  characterName: string
  world: string
  action: 'enter' | 'leave' | 'present'
  timestamp: string
  countChange?: number
}

/**
 * POST /api/plugin/patron-visits
 * 
 * Log a patron visit (from the Dalamud plugin)
 */
export async function POST(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get('x-api-key')
    
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const auth = await validateApiKey(apiKey)

    if (!auth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, 'write')
    if (limited) return limited

    const body: PatronVisitPayload = await request.json()
    const { venueId, characterName, world, action, timestamp, countChange } = body
    
    // Validate required fields
    if (!venueId || !characterName || !action || !timestamp) {
      return NextResponse.json(
        { error: 'Missing required fields: venueId, characterName, action, timestamp' },
        { status: 400 }
      )
    }
    
    // Check permission
    const canLog = await checkPermission(auth.userId, venueId, 'log_patron')
    if (!canLog) {
      return NextResponse.json(
        { error: 'Permission denied to log at this venue' },
        { status: 403 }
      )
    }
    
    const result = await logPatronVisit({
      venueId,
      characterName,
      world,
      action,
      countChange,
      timestamp: new Date(timestamp),
      loggedBy: auth.userId
    })

    if (!result.deduped && !result.wasWorking) {
      venueEventBus.emit(venueId, {
        id: result.id,
        type: action === 'enter' ? 'patron_enter' : 'patron_exit',
        venueId,
        timestamp: new Date(timestamp).toISOString(),
        data: { characterName, world },
      })
    }

    if (!result.deduped && action === 'enter') {
      const totalEnters = await prisma.patronLog.count({
        where: { venueId, action: 'ENTER' },
      })
      if (GRADUATION_MILESTONES.includes(totalEnters)) {
        const venue = await prisma.venue.findUnique({
          where: { id: venueId },
          select: { name: true, slug: true },
        })
        if (venue) postVenueGraduation(venue, totalEnters)
      }
    }

    return NextResponse.json({
      success: true,
      message: result.deduped ? 'Duplicate suppressed (within 60s window)' : 'Patron visit logged',
      data: {
        id: result.id,
        characterName,
        world,
        action,
        deduped: result.deduped,
        wasWorking: result.wasWorking,
        eventId: result.eventId,
      }
    })
  } catch (error) {
    console.error('[Plugin API] Error logging patron visit:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/plugin/patron-visits?venueId=xxx
 * 
 * Retrieve patron visit history
 */
export async function GET(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get('x-api-key')
    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const limit = parseInt(searchParams.get('limit') || '50')
    
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const auth = await validateApiKey(apiKey)

    if (!auth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, 'read')
    if (limited) return limited

    if (!venueId) {
      return NextResponse.json(
        { error: 'venueId is required' },
        { status: 400 }
      )
    }
    
    // Check if user has access to this venue
    if (!auth.venues.includes(venueId)) {
      return NextResponse.json(
        { error: 'Access denied to this venue' },
        { status: 403 }
      )
    }
    
    const visits = await getPatronVisits(venueId, limit)
    
    return NextResponse.json({
      visits: visits.map(v => ({
        id: v.id,
        characterName: v.characterName,
        world: v.world,
        action: v.action,
        countChange: v.countChange,
        timestamp: v.timestamp,
        loggedAt: v.loggedAt
      }))
    })
  } catch (error) {
    console.error('[Plugin API] Error fetching patron visits:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
