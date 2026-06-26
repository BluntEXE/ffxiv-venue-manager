import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { fetchFfxivVenue, syncFfxivVenue } from "@/lib/ffxivvenues"

async function requireOwner(venueId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { venueId, userId, role: "OWNER", status: "active" },
  })
  return !!membership
}

/**
 * GET ?ffxivId=xxx — preview fetch: returns venue name for link confirmation.
 * Does NOT save anything.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  if (!(await requireOwner(venueId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const ffxivId = req.nextUrl.searchParams.get("ffxivId")
  if (!ffxivId) return NextResponse.json({ error: "ffxivId required" }, { status: 400 })

  const venue = await fetchFfxivVenue(ffxivId)
  if (!venue) return NextResponse.json({ error: "Venue not found on ffxivvenues.com" }, { status: 404 })

  return NextResponse.json({ id: venue.id, name: venue.name })
}

/**
 * POST — trigger a sync for this venue's linked ffxivvenues listing.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  if (!(await requireOwner(venueId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { ffxivVenueId: true },
  })
  if (!venue?.ffxivVenueId)
    return NextResponse.json({ error: "Venue is not linked to ffxivvenues.com" }, { status: 400 })

  const result = await syncFfxivVenue(venueId, venue.ffxivVenueId)

  if (!result.ok)
    return NextResponse.json({ error: result.error, unlinked: result.unlinked ?? false }, { status: result.unlinked ? 410 : 502 })

  return NextResponse.json({ ok: true, venueName: result.venueName })
}
