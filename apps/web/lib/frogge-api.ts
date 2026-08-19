import { prisma } from "@/lib/prisma"

const FROGGE_API_URL = process.env.FROGGE_API_URL ?? "https://api.frogge.gg"
const FROGGE_CLIENT_ID = process.env.FROGGE_CLIENT_ID ?? "xvm"
const FROGGE_SECRET = process.env.FROGGE_SECRET ?? ""
const USER_AGENT = "XIV-Venue-Manager/1.0"

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

async function froggeFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${FROGGE_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-Frogge-Client-Id": FROGGE_CLIENT_ID,
      "X-Frogge-Secret": FROGGE_SECRET,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Frogge API ${path} → ${res.status}: ${body}`)
  }
  return res.status === 204 ? (null as T) : res.json()
}

// ── Public API ─────────────────────────────────────────────────

export async function getRooms(froggeVenueId: string): Promise<FroggeRoom[]> {
  return froggeFetch<FroggeRoom[]>(`/v2/venues/${froggeVenueId}/rooms`)
}

export async function reserveRoom(
  froggeVenueId: string,
  froggeRoomId: number,
  durationMinutes: number
): Promise<void> {
  await froggeFetch(`/v2/venues/${froggeVenueId}/rooms/${froggeRoomId}/reserve`, {
    method: "POST",
    body: JSON.stringify({ duration_minutes: durationMinutes }),
  })
}

export async function releaseRoom(froggeVenueId: string, froggeRoomId: number): Promise<void> {
  await froggeFetch(`/v2/venues/${froggeVenueId}/rooms/${froggeRoomId}/release`, {
    method: "POST",
  })
}

export async function postRoomsToDiscord(froggeVenueId: string): Promise<void> {
  await froggeFetch(`/v2/venues/${froggeVenueId}/rooms/post`, {
    method: "POST",
  })
}

// ── Local cache helpers ────────────────────────────────────────

export async function getRoomsWithFallback(venueId: string): Promise<FroggeRoom[]> {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { froggeVenueId: true },
    })

    if (!venue?.froggeVenueId) {
      return getLocalRooms(venueId)
    }

    const rooms = await getRooms(venue.froggeVenueId)
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
        lastSyncedAt: new Date(),
      },
    })
  }
}
