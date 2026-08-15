import { nanoid } from 'nanoid'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { venueEventBus } from '@/lib/sse/venue-events'

/**
 * SHA-256 hash of an API key for storage + lookup. The plaintext key is
 * shown to the user once at creation; on every subsequent validation we
 * hash the incoming header and look up by `keyHash`. Plain SHA-256 (no
 * salt/HMAC) is sufficient because keys are 32-char nanoids = 192 bits of
 * entropy, beyond brute-force rainbow attacks even unsalted.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

/**
 * Generate a new API key for a user. Returns the raw key (shown once
 * at creation). Only the SHA-256 hash is persisted, plus a non-sensitive
 * keyPreview (first 8 + last 4 chars) for the dashboard listing.
 */
export async function generateApiKey(
  userId: string,
  name?: string,
  venueId?: string
): Promise<string> {
  const key = `vm_${nanoid(32)}`
  const id = nanoid()
  const keyHash = hashApiKey(key)
  const keyPreview = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`

  await prisma.apiKey.create({
    data: {
      id,
      userId,
      keyHash,
      keyPreview,
      name: name || 'Plugin API Key',
      venueId
    }
  })

  return key
}

/**
 * Validate an API key and return the associated user
 */
export async function validateApiKey(apiKey: string): Promise<{
  userId: string | null
  user: any | null
  venues: string[]
} | null> {
  if (!apiKey || !apiKey.startsWith('vm_')) {
    return null
  }

  // Lookup by keyHash, never by plaintext. Combined with revokedAt: null
  // in the where clause so revoked keys don't even produce a record.
  const keyHash = hashApiKey(apiKey)
  const apiKeyRecord = await prisma.apiKey.findFirst({
    where: { keyHash, revokedAt: null },
    include: {
      user: true
    }
  })

  if (!apiKeyRecord) {
    return null
  }
  
  // Fire-and-forget: bump lastUsedAt so the web UI shows when each key
  // was last seen. We intentionally do NOT await - swallowing errors and
  // not blocking validation keeps plugin requests fast.
  prisma.apiKey.update({
    where: { id: apiKeyRecord.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})
  
  // Get venues the user has access to
  const memberships = await prisma.membership.findMany({
    where: {
      userId: apiKeyRecord.userId,
      status: 'active'
    },
    select: {
      venueId: true
    }
  })
  
  const venues = memberships.map(m => m.venueId)
  
  // If key has specific venue, only allow that one
  if (apiKeyRecord.venueId) {
    if (!venues.includes(apiKeyRecord.venueId)) {
      return null
    }
    return {
      userId: apiKeyRecord.userId,
      user: apiKeyRecord.user,
      venues: [apiKeyRecord.venueId]
    }
  }
  
  return {
    userId: apiKeyRecord.userId,
    user: apiKeyRecord.user,
    venues
  }
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: string): Promise<boolean> {
  try {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() }
    })
    return true
  } catch {
    return false
  }
}

/**
 * Get user's API keys
 */
export async function getUserApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: {
      userId,
      revokedAt: null
    },
    orderBy: { createdAt: 'desc' }
  })
}

/**
 * Get venues accessible by a user (based on their memberships)
 */
export async function getUserVenues(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      status: 'active'
    },
    include: {
      venue: true
    }
  })
  
  return memberships.map(m => ({
    id: m.venue.id,
    name: m.venue.name,
    slug: m.venue.slug,
    role: m.role
  }))
}

/**
 * Check if a user can perform an action at a venue
 */
export async function checkPermission(
  userId: string,
  venueId: string,
  action: 'view' | 'log_service' | 'log_transaction' | 'log_patron' | 'view_shifts' | 'clock_shift' | 'toggle_room'
): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      venueId,
      status: 'active'
    }
  })
  
  if (!membership) {
    return false
  }
  
  // OWNER and MANAGER can do everything
  if (membership.role === 'OWNER' || membership.role === 'MANAGER') {
    return true
  }
  
  // STAFF can log services, patron visits, and transactions (sales).
  // Aligned with the web transactions POST route, which only checks for
  // active membership - any active member can log a sale from either
  // surface.
  if (membership.role === 'STAFF') {
    return (
      action === 'log_service' ||
      action === 'log_patron' ||
      action === 'log_transaction' ||
      action === 'view_shifts' ||
      action === 'clock_shift' ||
      action === 'toggle_room'
    )
  }
  
  return false
}

/**
 * Log a patron visit with dedupe + staff/patron classification + event
 * attribution. Returns { created, deduped, wasWorking, eventId }.
 *
 * Classification rule: a character is "working" only if their linked user
 * account has an ACTIVE shift at this venue at log time. Off-duty staff
 * (membership but no active shift) are logged as patrons - that's the
 * visit-as-a-friend case the venue owner wants tracked as attendance.
 *
 * Dedupe: state-based, not time-windowed. A character can only actually
 * transition ENTER -> LEAVE -> ENTER -> ...; if the incoming action
 * matches the character's last known state, it's a redundant observation
 * (another staff member's plugin independently detecting the same
 * arrival/departure, or the same plugin re-detecting after a brief
 * derender) and is ignored, no matter how much time has passed.
 *
 * A 60s sliding window used to gate this instead, but staff spread across
 * a large venue detect the same event at genuinely staggered times -
 * confirmed multi-minute gaps (up to 21 min) between duplicate ENTER rows
 * for the same character logged by different staff users. State-based
 * dedupe has no such window to outrun.
 */
export async function logPatronVisit(data: {
  venueId: string
  characterName: string
  world: string
  action: string
  countChange?: number
  timestamp: Date
  loggedBy?: string
}) {
  const action = (data.action || "ENTER").toUpperCase()

  // 1) Dedupe - compare against the character's last known state.
  const lastLog = await prisma.patronLog.findFirst({
    where: {
      venueId: data.venueId,
      characterName: data.characterName,
      world: data.world,
      action: { in: ["ENTER", "LEAVE", "PRESENT"] },
    },
    orderBy: { loggedAt: "desc" },
    select: { id: true, action: true, wasWorking: true, eventId: true },
  })
  const incomingIsEnter = action === "ENTER" || action === "PRESENT"
  const currentlyIn = lastLog ? lastLog.action === "ENTER" || lastLog.action === "PRESENT" : false
  if (lastLog && incomingIsEnter === currentlyIn) {
    return {
      created: null,
      deduped: true,
      id: lastLog.id,
      wasWorking: lastLog.wasWorking,
      eventId: lastLog.eventId,
    }
  }

  // 2) Character → user lookup. Required to evaluate shift state.
  const character = await prisma.userCharacter.findUnique({
    where: {
      characterName_world: {
        characterName: data.characterName,
        world: data.world,
      },
    },
    select: { userId: true },
  })

  // 3) Active shift check - only true if the user is clocked into an
  // ACTIVE shift at this venue right now. Off-duty staff fall through.
  let wasWorking = false
  let workingUserId: string | null = null
  if (character) {
    const shift = await prisma.shift.findFirst({
      where: {
        venueId: data.venueId,
        status: "ACTIVE",
        membership: { userId: character.userId },
      },
      select: { id: true },
    })
    if (shift) {
      wasWorking = true
      workingUserId = character.userId
    }
  }

  // 4) Event attribution - active event at this venue (startTime ≤ now
  // ≤ endTime, status PUBLISHED/ACTIVE). Snapshotted so later event
  // reschedules don't retro-rewrite history.
  const now = new Date()
  const activeEvent = await prisma.event.findFirst({
    where: {
      venueId: data.venueId,
      startTime: { lte: now },
      endTime: { gte: now },
      status: { in: ["PUBLISHED", "ACTIVE"] },
    },
    select: { id: true },
    orderBy: { startTime: "desc" },
  })

  // 5) Insert.
  // The Dalamud plugin's request model has no countChange field, so
  // data.countChange is always undefined for plugin-sourced logs. Derive
  // it from action instead of trusting the caller - analytics (peak
  // patrons, attendance-by-hour, totals) sums this column, and a null
  // countChange silently zeroes every one of those aggregates.
  const isEnter = action === "ENTER" || action === "PRESENT"
  const countChange = data.countChange ?? (isEnter ? 1 : -1)
  const created = await prisma.patronLog.create({
    data: {
      id: nanoid(),
      venueId: data.venueId,
      characterName: data.characterName,
      world: data.world,
      action,
      countChange,
      timestamp: data.timestamp,
      loggedBy: data.loggedBy,
      wasWorking,
      workingUserId,
      eventId: activeEvent?.id ?? null,
    },
  })

  // 6) Push to SSE bus so /dashboard/<venue>/live updates in real time
  // without polling. Fire-and-forget - bus emit failures must not break
  // the plugin's POST. The live page consumer lives at
  // /api/stream/[venueId]/route.ts.
  try {
    venueEventBus.emit(data.venueId, {
      id: created.id,
      type: isEnter ? "patron_enter" : "patron_exit",
      venueId: data.venueId,
      timestamp: created.timestamp.toISOString(),
      data: { characterName: data.characterName, world: data.world, action },
    })
  } catch {
    // Swallowed - never fail a plugin write because the live page bus is sad.
  }

  return {
    created,
    deduped: false,
    id: created.id,
    wasWorking,
    eventId: activeEvent?.id ?? null,
  }
}

/**
 * Get patron visits for a venue
 */
export async function getPatronVisits(venueId: string, limit = 50) {
  return prisma.patronLog.findMany({
    where: { venueId },
    orderBy: { timestamp: 'desc' },
    take: limit
  })
}
