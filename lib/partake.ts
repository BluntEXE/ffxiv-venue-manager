import { prisma } from "@/lib/prisma"

const PARTAKE_API = "https://api.partake.gg/"

const EVENTS_QUERY = `
  query getTimelineEvents($teamId: Int, $sortBy: EventSortType, $endsBetween: TimeRangeInput, $offset: Int, $limit: Int) {
    events(
      teamId: $teamId
      sortBy: $sortBy
      endsBetween: $endsBetween
      offset: $offset
      limit: $limit
    ) {
      id
      title
      description
      tags
      ageRating
      location
      locationData {
        server { name }
        dataCenter { name }
      }
      startsAt
      endsAt
      attendeeCount
      createdAt
      updatedAt
    }
  }
`

interface PartakeEvent {
  id: number
  title: string
  description: string | null
  tags: string[]
  ageRating: string
  location: string
  locationData: {
    server: { name: string }
    dataCenter: { name: string }
  }
  startsAt: string
  endsAt: string
  attendeeCount: number
  createdAt: string
  updatedAt: string
}

/**
 * Map Partake tags to our EventType enum.
 */
function mapEventType(tags: string[]): string {
  const tagStr = tags.join(" ").toLowerCase()
  if (tagStr.includes("nightlife") || tagStr.includes("entertainment")) return "SOCIAL"
  if (tagStr.includes("performance") || tagStr.includes("music") || tagStr.includes("concert")) return "PERFORMANCE"
  if (tagStr.includes("game") || tagStr.includes("trivia") || tagStr.includes("contest")) return "GAME_NIGHT"
  if (tagStr.includes("special") || tagStr.includes("grand opening") || tagStr.includes("anniversary")) return "SPECIAL"
  return "OTHER"
}

/**
 * Fetch upcoming events from Partake for a given team ID.
 */
export async function fetchPartakeEvents(teamId: number): Promise<PartakeEvent[]> {
  const res = await fetch(PARTAKE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: EVENTS_QUERY,
      variables: {
        teamId,
        sortBy: "ENDS_AT",
        endsBetween: { end: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString() },
        offset: 0,
        limit: 50,
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Partake API error: ${res.status}`)
  }

  const json = await res.json()
  return json.data?.events ?? []
}

/**
 * Sync events from Partake for a single venue.
 * Returns summary of created/updated/skipped counts.
 */
export async function syncVenuePartakeEvents(venue: {
  id: string
  ownerId: string
  partakeTeamId: number
}) {
  const results = { synced: 0, created: 0, updated: 0, skipped: 0, errors: 0 }

  const events = await fetchPartakeEvents(venue.partakeTeamId)

  for (const pe of events) {
    const existing = await prisma.event.findUnique({
      where: { partakeEventId: pe.id },
    })

    const locationStr = pe.locationData?.server?.name
      ? `${pe.location} (${pe.locationData.server.name} - ${pe.locationData.dataCenter.name})`
      : pe.location || null

    const eventData = {
      title: pe.title,
      description: pe.description || null,
      location: locationStr,
      eventType: mapEventType(pe.tags) as any,
      status: "PUBLISHED" as const,
      startTime: new Date(pe.startsAt),
      endTime: new Date(pe.endsAt),
      timezone: "UTC",
      partakeAttendeeCount: pe.attendeeCount > 0 ? pe.attendeeCount : null,
    }

    if (existing) {
      if (
        existing.title !== eventData.title ||
        existing.description !== eventData.description ||
        existing.location !== eventData.location ||
        existing.startTime.toISOString() !== eventData.startTime.toISOString() ||
        existing.endTime.toISOString() !== eventData.endTime.toISOString()
      ) {
        await prisma.event.update({
          where: { partakeEventId: pe.id },
          data: eventData,
        })
        results.updated++
      } else {
        results.skipped++
      }
    } else {
      await prisma.event.create({
        data: {
          ...eventData,
          venueId: venue.id,
          createdById: venue.ownerId,
          partakeEventId: pe.id,
        },
      })
      results.created++
    }
    results.synced++
  }

  return results
}

/**
 * Sync events from Partake for all venues that have a partakeTeamId configured.
 * Returns summary of created/updated/skipped counts.
 */
export async function syncPartakeEvents() {
  const venues = await prisma.venue.findMany({
    where: { partakeTeamId: { not: null }, isActive: true },
    select: { id: true, ownerId: true, partakeTeamId: true, name: true },
  })

  const totals = { synced: 0, created: 0, updated: 0, skipped: 0, errors: 0 }

  for (const venue of venues) {
    try {
      const results = await syncVenuePartakeEvents({
        id: venue.id,
        ownerId: venue.ownerId,
        partakeTeamId: venue.partakeTeamId!,
      })
      totals.synced += results.synced
      totals.created += results.created
      totals.updated += results.updated
      totals.skipped += results.skipped
    } catch (error) {
      console.error(`[Partake Sync] Error syncing venue "${venue.name}":`, error)
      totals.errors++
    }
  }

  return totals
}
