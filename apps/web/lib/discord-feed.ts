const BOT_URL = process.env.EORZEA_BOT_WEBHOOK_URL
const BOT_SECRET = process.env.EORZEA_BOT_WEBHOOK_SECRET

async function post(path: string, body: unknown) {
  if (!BOT_URL) return
  const url = `${BOT_URL}${path}`
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(BOT_SECRET ? { 'x-webhook-secret': BOT_SECRET } : {}),
    },
    body: JSON.stringify(body),
  }).catch((e) => console.error('[discord-feed] bot webhook failed:', e))
}

export type VenueSlug = { name: string; slug: string }

export type VenueInfo = {
  name: string; slug: string;
  dataCenter: string; world: string;
  district?: string | null; ward?: number | null; plot?: number | null;
}

export function postNewVenue(venue: VenueInfo) {
  post('/webhook/new-venue', venue)
}

export function postTonightList(
  venues: (VenueInfo & { scheduledStart: Date; scheduledEnd: Date })[]
) {
  post('/webhook/tonight', venues)
}

export function postWeeklySummary(stats: {
  newVenues: number; eventsHosted: number; patronVisits: number; newStaff: number; weekStart: Date
}) {
  post('/webhook/weekly-summary', stats)
}

export function postVenueGraduation(venue: VenueSlug, milestone: number) {
  post('/webhook/venue-graduation', { venue, milestone })
}

export function postPartakeDigest(
  events: { title: string; startTime: Date; endTime: Date; venue: VenueSlug }[]
) {
  post('/webhook/partake-digest', events)
}

export function postEventLive(event: {
  title: string; startTime: Date; endTime: Date; venue: VenueSlug | VenueInfo
}) {
  post('/webhook/event-live', { event })
}

export async function postPatronVisitXp(venueId: string, characterName: string, world: string) {
  const { prisma } = await import('@/lib/prisma')
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } })
  const character = await prisma.userCharacter.findUnique({
    where: { characterName_world: { characterName, world } },
    select: { user: { select: { discordId: true } } },
  })
  const discordId = character?.user?.discordId
  if (!discordId || !venue) return
  post('/webhook/patron-visit-xp', { discordId, venueName: venue.name })
}

export async function postShiftXp(userId: string, venueId: string) {
  const { prisma } = await import('@/lib/prisma')
  const [user, venue] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { discordId: true } }),
    prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } }),
  ])
  const discordId = user?.discordId
  if (!discordId || !venue) return
  post('/webhook/shift-xp', { discordId, venueName: venue.name })
}
