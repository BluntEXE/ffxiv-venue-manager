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
 * at creation). Both the raw key and its SHA-256 hash are persisted —
 * raw is kept during the migration window so we can roll back to
 * plaintext lookup if the hash path misbehaves. Drop the `key` column
 * once the soak window is clean.
 */
export async function generateApiKey(
  userId: string,
  name?: string,
  venueId?: string
): Promise<string> {
  const key = `vm_${nanoid(32)}`
  const id = nanoid()
  const keyHash = hashApiKey(key)

  await prisma.apiKey.create({
    data: {
      id,
      userId,
      key,
      keyHash,
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
  // was last seen. We intentionally do NOT await — swallowing errors and
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
 * Get roles and their permissions for a venue
 */
export async function getVenueRoles(venueId: string, userId: string) {
  // Check user has access to this venue
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      venueId,
      status: 'active'
    },
  })

  if (!membership) {
    return null
  }
  
  // Get all roles at this venue, with their linked services eagerly loaded
  // via the Role.services relation (Prisma implicit many-to-many).
  const rolesRaw = await prisma.role.findMany({
    where: { venueId },
    include: { services: true },
  })

  const rolesWithServices = rolesRaw.map((role) => ({
    id: role.id,
    name: role.name,
    color: role.color,
    responsibilities: role.responsibilities,
    services: role.services.map((svc) => ({
      id: svc.id,
      name: svc.name,
      description: svc.description,
      price: Number(svc.price),
      category: svc.category,
    })),
  }))
  
  return {
    userRole: membership.role,
    roles: rolesWithServices
  }
}

/**
 * Check if a user can perform an action at a venue
 */
export async function checkPermission(
  userId: string,
  venueId: string,
  action: 'view' | 'log_service' | 'log_transaction' | 'log_patron' | 'view_shifts' | 'clock_shift'
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
  // active membership — any active member can log a sale from either
  // surface.
  if (membership.role === 'STAFF') {
    return (
      action === 'log_service' ||
      action === 'log_patron' ||
      action === 'log_transaction' ||
      action === 'view_shifts' ||
      action === 'clock_shift'
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
 * (membership but no active shift) are logged as patrons — that's the
 * visit-as-a-friend case the venue owner wants tracked as attendance.
 *
 * Dedupe: 60s sliding window on (venueId, character, world, action).
 * Multiple staff plugins observing the same arrival collapse to one row.
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

  // 1) Dedupe — sliding 60s window.
  const dedupeSince = new Date(Date.now() - 60_000)
  const existing = await prisma.patronLog.findFirst({
    where: {
      venueId: data.venueId,
      characterName: data.characterName,
      world: data.world,
      action,
      loggedAt: { gte: dedupeSince },
    },
    select: { id: true, wasWorking: true, eventId: true },
  })
  if (existing) {
    return {
      created: null,
      deduped: true,
      id: existing.id,
      wasWorking: existing.wasWorking,
      eventId: existing.eventId,
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

  // 3) Active shift check — only true if the user is clocked into an
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

  // 4) Event attribution — active event at this venue (startTime ≤ now
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
  const created = await prisma.patronLog.create({
    data: {
      id: nanoid(),
      venueId: data.venueId,
      characterName: data.characterName,
      world: data.world,
      action,
      countChange: data.countChange,
      timestamp: data.timestamp,
      loggedBy: data.loggedBy,
      wasWorking,
      workingUserId,
      eventId: activeEvent?.id ?? null,
    },
  })

  // 6) Push to SSE bus so /dashboard/<venue>/live updates in real time
  // without polling. Fire-and-forget — bus emit failures must not break
  // the plugin's POST. The live page consumer lives at
  // /api/stream/[venueId]/route.ts.
  const isEnter = action === "ENTER" || action === "PRESENT"
  try {
    venueEventBus.emit(data.venueId, {
      id: created.id,
      type: isEnter ? "patron_enter" : "patron_exit",
      venueId: data.venueId,
      timestamp: created.timestamp.toISOString(),
      data: { characterName: data.characterName, world: data.world, action },
    })
  } catch {
    // Swallowed — never fail a plugin write because the live page bus is sad.
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
