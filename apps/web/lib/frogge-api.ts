import { prisma } from "@/lib/prisma"

const FROGGE_API_URL = process.env.FROGGE_API_URL ?? "https://api.frogge.gg"
const FROGGE_CLIENT_ID = process.env.FROGGE_CLIENT_ID ?? "xvm"
const USER_AGENT = "XIV-Venue-Manager/1.0"

export interface RedeemResult {
  token: string
  froggeVenueId: string
}

// ── Types ──────────────────────────────────────────────────────

export interface FroggeRoom {
  id: number
  name: string | null
  room_number: number
  locked: boolean
  disabled: boolean
  owner_discord_id: string | null
  images: FroggeRoomImage[]
  reservations: FroggeReservation[]
}

interface FroggeRoomImage {
  image_url: string
  sort_order: number
}

export interface FroggeReservation {
  id: number
  owner_discord_id: string
  room_id: number
  start_at: string
  end_at: string | null
}

// ── Internal fetch helper ──────────────────────────────────────

async function froggeFetch<T>(path: string, options: RequestInit = {}, bearerToken?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    "X-Frogge-Client-Id": FROGGE_CLIENT_ID,
  }
  if (bearerToken) {
    headers["Authorization"] = `Bearer ${bearerToken}`
  }
  const res = await fetch(`${FROGGE_API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Frogge API ${path} → ${res.status}: ${body}`)
  }
  return res.status === 204 ? (null as T) : res.json()
}

// ── Auth ───────────────────────────────────────────────────────

export async function redeemCode(code: string): Promise<RedeemResult> {
  return froggeFetch<RedeemResult>("/plugin-auth/redeem", {
    method: "POST",
    body: JSON.stringify({ code }),
  })
}

// ── Public API ─────────────────────────────────────────────────

export async function getRooms(froggeVenueId: string, bearerToken?: string): Promise<FroggeRoom[]> {
  return froggeFetch<FroggeRoom[]>(`/v2/venues/${froggeVenueId}/rooms`, {}, bearerToken)
}

export async function reserveRoom(
  froggeVenueId: string,
  froggeRoomId: number,
  durationMinutes: number,
  bearerToken?: string
): Promise<void> {
  await froggeFetch(
    `/v2/venues/${froggeVenueId}/rooms/${froggeRoomId}/reserve`,
    { method: "POST", body: JSON.stringify({ duration_minutes: durationMinutes }) },
    bearerToken
  )
}

export async function releaseRoom(froggeVenueId: string, froggeRoomId: number, bearerToken?: string): Promise<void> {
  await froggeFetch(`/v2/venues/${froggeVenueId}/rooms/${froggeRoomId}/release`, { method: "POST" }, bearerToken)
}

export async function postRoomsToDiscord(froggeVenueId: string, bearerToken?: string): Promise<void> {
  await froggeFetch(`/v2/venues/${froggeVenueId}/rooms/post`, { method: "POST" }, bearerToken)
}

export interface GuildMember {
  id: string
  username: string
  display_name?: string
  avatar?: string
}

export async function getGuildMembers(bearerToken: string): Promise<GuildMember[]> {
  return froggeFetch<GuildMember[]>("/guild/members", {}, bearerToken)
}

// ── Local cache helpers ────────────────────────────────────────

export async function getRoomsWithFallback(venueId: string): Promise<FroggeRoom[]> {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { froggeVenueId: true, froggeToken: true },
    })

    if (!venue?.froggeVenueId) {
      return getLocalRooms(venueId)
    }

    const rooms = await getRooms(venue.froggeVenueId, venue.froggeToken ?? undefined)
    await syncLocalCache(venueId, rooms)
    return rooms
  } catch (error) {
    console.warn("Frogge API unavailable, using local cache:", error)
    return getLocalRooms(venueId)
  }
}

async function getLocalRooms(venueId: string): Promise<FroggeRoom[]> {
  const localRooms = await prisma.room.findMany({
    where: { venueId },
    orderBy: { roomNumber: "asc" },
  })

  return localRooms.map((r) => ({
    id: r.froggeRoomId ?? 0,
    name: r.name,
    room_number: r.roomNumber ?? 0,
    locked: r.locked,
    disabled: r.disabled,
    owner_discord_id: null,
    images: [],
    reservations: r.isOccupied
      ? [{ id: 0, owner_discord_id: "unknown", start_at: "", end_at: null, room_id: r.froggeRoomId ?? 0 }]
      : [],
  }))
}

async function syncLocalCache(venueId: string, rooms: FroggeRoom[]): Promise<void> {
  for (const room of rooms) {
    await prisma.room.upsert({
      where: {
        venueId_name: { venueId, name: room.name ?? `Room ${room.room_number}` },
      },
      update: {
        froggeRoomId: room.id,
        roomNumber: room.room_number,
        locked: room.locked,
        disabled: room.disabled,
        isOccupied: room.reservations.some((r) => !r.end_at || new Date(r.end_at) > new Date()),
        imageUrl: room.images[0]?.image_url ?? null,
        lastSyncedAt: new Date(),
      },
      create: {
        venueId,
        name: room.name ?? `Room ${room.room_number}`,
        froggeRoomId: room.id,
        roomNumber: room.room_number,
        locked: room.locked,
        disabled: room.disabled,
        isOccupied: room.reservations.some((r) => !r.end_at || new Date(r.end_at) > new Date()),
        imageUrl: room.images[0]?.image_url ?? null,
        lastSyncedAt: new Date(),
      },
    })
  }
}
