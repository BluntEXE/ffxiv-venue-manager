import { prisma } from "@/lib/prisma"
import { postVenueStatus } from "@/lib/discord-feed"

// How far ahead of a not-yet-started event a shift still gets suppressed as
// "prep", not a real open. Matches the system-wide earliest-clock-in bound
// (shifts can't be clocked in more than 30 min before scheduledStart — see
// the same 30 * 60 * 1000 check in clock-in/route.ts and the mobile/web
// shift routes), so this can't be earlier than the earliest real clock-in.
const EVENT_PREP_WINDOW_MS = 30 * 60 * 1000

/**
 * Call after any shift clock-in/clock-out, or when an event transitions
 * status (PUBLISHED -> ACTIVE -> COMPLETED). Recomputes whether the venue
 * should currently read as open and tells the bot the current state — the
 * bot itself decides whether this is an actual open/close transition worth
 * re-rendering a region board for.
 *
 * An ACTIVE event always means open. Otherwise, if an event is PUBLISHED and
 * about to start (within EVENT_PREP_WINDOW_MS), the venue stays closed even
 * with a shift running — this is what stops staff clocking in early to prep
 * from showing the venue as open before the event really starts. Absent
 * either of those, open falls back to whether any shift is ACTIVE, same as
 * before.
 */
export async function syncVenueOpenStatus(venueId: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, dataCenter: true },
  })
  if (!venue) return

  const now = new Date()

  const hasActiveEvent = await prisma.event.findFirst({
    where: { venueId, status: "ACTIVE" },
    select: { id: true },
  })

  let isOpen: boolean
  if (hasActiveEvent) {
    isOpen = true
  } else {
    const hasImminentEvent = await prisma.event.findFirst({
      where: {
        venueId,
        status: "PUBLISHED",
        startTime: { gte: now, lte: new Date(now.getTime() + EVENT_PREP_WINDOW_MS) },
      },
      select: { id: true },
    })

    if (hasImminentEvent) {
      isOpen = false
    } else {
      const activeCount = await prisma.shift.count({
        where: { venueId, status: "ACTIVE" },
      })
      isOpen = activeCount > 0
    }
  }

  postVenueStatus(venue, isOpen)
}
