import { NextRequest, NextResponse } from 'next/server'
import { pluginAuthGate } from '@/lib/api/plugin-auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/plugin/rooms?venueId=…
 *
 * Returns this venue's rooms with current status, for the plugin's
 * Rooms tab. Polled on an interval while that tab is open (see
 * RoomsTab.cs) — not a live push like the dashboard's SSE feed, since
 * this plugin has no persistent-connection infrastructure.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    if (!venueId || !auth.venues.includes(venueId)) {
      return NextResponse.json({ error: 'Invalid venue' }, { status: 400 })
    }

    const rooms = await prisma.room.findMany({
      where: { venueId },
      select: { id: true, name: true, isOccupied: true, note: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ rooms })
  } catch (error) {
    console.error('[Plugin API] Error fetching rooms:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
