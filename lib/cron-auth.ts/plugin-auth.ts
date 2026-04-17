import { venueEventBus } from "@/lib/sse/venue-events"
import { prisma } from "@/lib/prisma"
import { nanoid } from 'nanoid'
import crypto from 'crypto'

/**
 * Hash an API key with SHA-256 for secure storage.
 * The raw key is shown once at creation; only the hash is persisted.
 */
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

/**
 * Generate a new API key for a user.
 * Returns the raw key (shown once). Only the hash is stored.
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
      key: key.slice(0, 7) + '...' + key.slice(-4), // masked display version
      keyHash,
      name: name || 'Plugin API Key',
      venueId
    }
  })

  return key
}

/**
 * Validate an API key and return the associated user.
 * Lookup is by keyHash (indexed) — the raw key is never stored.
 */
export async function validateApiKey(apiKey: string): Promise<{
  userId: string | null
  user: any | null
  venues: string[]
} | null> {
  if (!apiKey || !apiKey.startsWith('vm_')) {
    return null
  }

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

  if (membership.role === 'OWNER' || membership.role === 'MANAGER') {
    return true
  }

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
 * Log a patron visit
 *
 * Deduplication: if an identical (venueId, characterName, world, action)
 * row already exists within the last DEDUP_WINDOW_MS, the duplicate is
 * silently ignored and the existing row is returned.
 */
const DEDUP_WINDOW_MS = 3 * 60 * 1000

export async function logPatronVisit(data: {
  venueId: string;
  characterName: string;
  world: string;
  action: string;
  countChange?: number;
  loggedBy?: string;
}) {
  const action = (data.action || "ENTER").toUpperCase()

  const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS)
  const existing = await prisma.patronLog.findFirst({
    where: {
      venueId: data.venueId,
      characterName: data.characterName,
      world: data.world,
      action,
      loggedAt: { gte: windowStart },
    },
    orderBy: { loggedAt: "desc" },
  })

  if (existing) {
    return existing
  }

  const log = await prisma.patronLog.create({
    data: {
      id: nanoid(),
      venueId: data.venueId,
      characterName: data.characterName,
      world: data.world,
      action,
      countChange: data.countChange,
      timestamp: new Date(),
      loggedBy: data.loggedBy,
    },
  })
  const isEnter = action === "ENTER" || action === "PRESENT"
  venueEventBus.emit(data.venueId, {
    id: log.id,
    type: isEnter ? "patron_enter" : "patron_exit",
    venueId: data.venueId,
    timestamp: log.timestamp.toISOString(),
    data: { characterName: data.characterName, world: data.world, action },
  })
  return log
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
