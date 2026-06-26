import { prisma } from "@/lib/prisma"

const FFXIVVENUES_API = "http://api.ffxivvenues.com"
const USER_AGENT = "XIV-Venue-Manager/1.0"

// ── Types (only the fields we use) ──────────────────────────────────────────

export type FfxivTime = {
  hour: number
  minute: number
  timeZone: string
  nextDay: boolean
}

export type FfxivUtcSchedule = {
  from: string | null
  day: number        // 0=Sun … 6=Sat
  start: FfxivTime
  end: FfxivTime
  location: unknown
}

export type FfxivScheduleEntry = {
  day: number
  start: FfxivTime
  end: FfxivTime | null
  interval: { intervalType: number; intervalArgument: number }
  commencing: string | null
  utc: FfxivUtcSchedule
  resolution: FfxivOpening
}

export type FfxivOpening = {
  start: string
  end: string
  isNow: boolean
  isWithinWeek: boolean
}

export type FfxivScheduleOverride = {
  open: boolean
  start: string
  end: string
  isNow: boolean
}

export type FfxivNotice = {
  id: string | null
  start: string
  end: string
  type: number
  message: string | null
  isNow: boolean
}

export type FfxivVenueData = {
  id: string
  name: string
  schedule: FfxivScheduleEntry[] | null
  scheduleOverrides: FfxivScheduleOverride[] | null
  notices: FfxivNotice[] | null
  resolution: FfxivOpening
}

// ── API fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch a single venue from ffxivvenues.com.
 * Returns null on 404 (venue removed/unlisted).
 * Throws on network errors or unexpected status codes.
 */
export async function fetchFfxivVenue(ffxivId: string): Promise<FfxivVenueData | null> {
  const url = `${FFXIVVENUES_API}/v1.0/venue/${encodeURIComponent(ffxivId)}?recordView=false`
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 0 },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`ffxivvenues API error: ${res.status}`)
  return res.json() as Promise<FfxivVenueData>
}

// ── Single venue sync ────────────────────────────────────────────────────────

export type SyncResult = {
  ok: boolean
  venueName?: string
  error?: string
  unlinked?: boolean
}

/**
 * Fetch the ffxivvenues data for a single linked venue and upsert it
 * into VenueSchedule. Clears the link if their venue returns 404.
 */
export async function syncFfxivVenue(venueId: string, ffxivId: string): Promise<SyncResult> {
  let data: FfxivVenueData | null
  try {
    data = await fetchFfxivVenue(ffxivId)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fetch failed" }
  }

  if (!data) {
    await prisma.venue.update({
      where: { id: venueId },
      data: { ffxivVenueId: null, ffxivVenueLinkedAt: null, ffxivVenueLinkedBy: null },
    })
    await prisma.venueSchedule.deleteMany({ where: { venueId } })
    return { ok: false, unlinked: true, error: "Venue not found on ffxivvenues.com — link cleared" }
  }

  await prisma.venueSchedule.upsert({
    where: { venueId },
    create: { venueId, source: "ffxivvenues", data: data as object },
    update: { source: "ffxivvenues", data: data as object },
  })

  return { ok: true, venueName: data.name }
}

// ── Bulk cron sync ───────────────────────────────────────────────────────────

export type BulkSyncResults = {
  synced: number
  unlinked: number
  errors: number
}

/**
 * Sync all venues that have ffxivVenueId set.
 * Throttled to stay under 3 calls / 10s rate limit.
 */
export async function syncAllFfxivVenues(): Promise<BulkSyncResults> {
  const venues = await prisma.venue.findMany({
    where: { ffxivVenueId: { not: null } },
    select: { id: true, ffxivVenueId: true },
  })

  const results: BulkSyncResults = { synced: 0, unlinked: 0, errors: 0 }

  for (const venue of venues) {
    if (!venue.ffxivVenueId) continue

    const result = await syncFfxivVenue(venue.id, venue.ffxivVenueId)

    if (result.ok) results.synced++
    else if (result.unlinked) results.unlinked++
    else results.errors++

    // Rate limit: stay under 3 calls / 10s
    await new Promise(r => setTimeout(r, 400))
  }

  return results
}
