import { prisma } from '@/lib/prisma'
import { postVenueStatus } from '@/lib/discord-feed'

/**
 * Call after any shift clock-in/clock-out. Recomputes whether the venue
 * currently has any ACTIVE shift and tells the bot the current state — the
 * bot itself decides whether this is an actual open/close transition worth
 * re-rendering a region board for.
 */
export async function syncVenueOpenStatus(venueId: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, dataCenter: true },
  })
  if (!venue) return

  const activeCount = await prisma.shift.count({
    where: { venueId, status: "ACTIVE" },
  })

  postVenueStatus(venue, activeCount > 0)
}
