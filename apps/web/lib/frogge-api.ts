const FROGGE_API_URL = process.env.FROGGE_API_URL ?? "https://api.frogge.tech"
const FROGGE_CLIENT_ID = process.env.FROGGE_CLIENT_ID ?? "xvm"
const USER_AGENT = "XIV-Venue-Manager/1.0"

export interface RedeemResult {
  token: string
  discord_user_id: string
  discord_username: string
  client: string
  scopes: string[]
  froggeVenueId?: string
}

// ── Types ──────────────────────────────────────────────────────

export interface FroggeRoom {
  id: string
  name: string | null
  room_number: number
  locked: boolean
  disabled: boolean
  status: string
  owner_discord_id: string | null
  images: FroggeRoomImage[]
  current_reservation: FroggeReservation | null
  reservations?: FroggeReservation[]
}

interface FroggeRoomImage {
  image_url: string
  sort_order: number
}

export interface FroggeReservation {
  id: string
  reserved_discord_id: string
  room_id: string
  start_at: string
  end_at: string | null
  source: string
}

export interface FroggeVenue {
  id: string
  name: string
  discord_guild_id?: string
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

export async function getVenues(bearerToken: string): Promise<FroggeVenue[]> {
  return froggeFetch<FroggeVenue[]>("/v2/venues", {}, bearerToken)
}

// ── Public API ─────────────────────────────────────────────────

export async function getRooms(froggeVenueId: string, bearerToken?: string): Promise<FroggeRoom[]> {
  return froggeFetch<FroggeRoom[]>(`/v2/venues/${froggeVenueId}/rooms`, {}, bearerToken)
}

export async function walkInReserve(
  froggeVenueId: string,
  froggeRoomId: string,
  discordUserId: string,
  bearerToken?: string
): Promise<void> {
  await froggeFetch(
    `/v2/venues/${froggeVenueId}/rooms/${froggeRoomId}/reserve`,
    { method: "POST", body: JSON.stringify({ discord_user_id: discordUserId }) },
    bearerToken
  )
}

export async function createReservation(
  froggeVenueId: string,
  froggeRoomId: string,
  params: { reserved_discord_id: string; start_at: string; end_at: string; source: string },
  bearerToken?: string
): Promise<void> {
  await froggeFetch(
    `/v2/venues/${froggeVenueId}/rooms/${froggeRoomId}/reservations`,
    { method: "POST", body: JSON.stringify(params) },
    bearerToken
  )
}

export async function releaseRoom(
  froggeVenueId: string,
  froggeRoomId: string,
  bearerToken?: string
): Promise<void> {
  await froggeFetch(`/v2/venues/${froggeVenueId}/rooms/${froggeRoomId}/release`, { method: "POST" }, bearerToken)
}

export async function pushRoomImage(
  froggeVenueId: string,
  froggeRoomId: string,
  imageUrl: string,
  sortOrder: number,
  bearerToken?: string
): Promise<void> {
  await froggeFetch(
    `/v2/venues/${froggeVenueId}/rooms/${froggeRoomId}/images`,
    { method: "POST", body: JSON.stringify({ image_url: imageUrl, sort_order: sortOrder }) },
    bearerToken
  )
}

export async function setRoomOwner(
  froggeVenueId: string,
  froggeRoomId: string,
  ownerDiscordId: string | null,
  bearerToken?: string
): Promise<void> {
  await froggeFetch(
    `/v2/venues/${froggeVenueId}/rooms/${froggeRoomId}`,
    { method: "PATCH", body: JSON.stringify({ owner_discord_id: ownerDiscordId }) },
    bearerToken
  )
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
