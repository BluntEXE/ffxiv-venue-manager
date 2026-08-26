const XVM_API_BASE_URL = process.env.XVM_API_BASE_URL
const XVM_API_DASHBOARD_SERVICE_TOKEN = process.env.XVM_API_DASHBOARD_SERVICE_TOKEN

// ── Types ──────────────────────────────────────────────────────

export interface Credential {
  id: number
  kind: string
  client: string
  name: string
  preview: string
  venue_id: string | null
  issued_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

export interface CredentialIssued {
  secret: string
  credential: Credential
}

export interface MePerson {
  id: number
  display_name: string
}

export interface MeMembership {
  venue_id: string
  tier: string
}

export interface Me {
  kind: string
  client: string
  name: string
  venue_narrow: string | null
  person: MePerson | null
  memberships: MeMembership[]
}

type ReservationSource = string

export interface RoomImage {
  id: number
  image_url: string
  sort_order: number
}

export interface Reservation {
  id: number
  room_id: number
  reserved_person_id: number | null
  reserved_character_name: string | null
  reserved_world: string | null
  start_at: string
  end_at: string | null
  source: ReservationSource
  created_by_person_id: number | null
  created_at: string
  cancelled_at: string | null
  is_current: boolean
}

export interface Room {
  id: number
  venue_id: string
  owner_membership_id: number | null
  name: string | null
  notes: string | null
  room_number: number | null
  locked: boolean
  disabled: boolean
  updated_by_person_id: number | null
  created_at: string
  updated_at: string
  images: RoomImage[]
  current_reservation: Reservation | null
  status: string
}

export interface RoomCreate {
  name?: string | null
  notes?: string | null
  owner_membership_id?: number | null
  room_number?: number | null
  locked?: boolean
  disabled?: boolean
}

export interface RoomUpdate {
  name?: string | null
  notes?: string | null
  owner_membership_id?: number | null
  room_number?: number | null
  locked?: boolean | null
  disabled?: boolean | null
}

export interface ReservationCreate {
  reserved_person_id?: number | null
  reserved_character_name?: string | null
  reserved_world?: string | null
  start_at: string
  end_at?: string | null
  source: ReservationSource
}

export interface RoomImageCreate {
  image_url: string
}

// ── Internal fetch helper ──────────────────────────────────────

// Carries the upstream HTTP status so callers can distinguish "xvm-api
// rejected this request" (4xx to forward as-is) from "our token is bad"
// (401, handled by invalidating the stored credential).
export class XvmApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`xvm-api ${status}: ${body}`)
  }
}

async function xvmFetch<T>(path: string, options: RequestInit = {}, bearerToken?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (bearerToken) {
    headers["Authorization"] = `Bearer ${bearerToken}`
  }
  const res = await fetch(`${XVM_API_BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new XvmApiError(res.status, body)
  }
  return res.status === 204 ? (null as T) : res.json()
}

// ── Auth ───────────────────────────────────────────────────────

export async function exchangeToken(externalId: string, displayName: string): Promise<CredentialIssued> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  if (!process.env.XVM_API_DASHBOARD_SERVICE_TOKEN) throw new Error("XVM_API_DASHBOARD_SERVICE_TOKEN is not set")
  return xvmFetch<CredentialIssued>(
    "/internal/tokens/exchange",
    {
      method: "POST",
      body: JSON.stringify({ provider: "discord", external_id: externalId, display_name: displayName }),
    },
    XVM_API_DASHBOARD_SERVICE_TOKEN
  )
}

// ── Person API ─────────────────────────────────────────────────

export async function getMe(personToken: string): Promise<Me> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Me>("/me", {}, personToken)
}

export async function listMyCredentials(personToken: string): Promise<Credential[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Credential[]>("/me/credentials", {}, personToken)
}

export async function revokeCredential(personToken: string, credentialId: number): Promise<Credential> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Credential>(`/me/credentials/${credentialId}/revoke`, { method: "POST" }, personToken)
}

// ── Rooms API ──────────────────────────────────────────────────

export async function listRooms(personToken: string, venueId: string): Promise<Room[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Room[]>(`/venues/${venueId}/rooms`, {}, personToken)
}

export async function getRoom(personToken: string, venueId: string, roomId: number): Promise<Room> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Room>(`/venues/${venueId}/rooms/${roomId}`, {}, personToken)
}

export async function createRoom(personToken: string, venueId: string, data: RoomCreate): Promise<Room> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Room>(`/venues/${venueId}/rooms`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateRoom(
  personToken: string,
  venueId: string,
  roomId: number,
  data: RoomUpdate
): Promise<Room> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Room>(`/venues/${venueId}/rooms/${roomId}`, { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

export async function deleteRoom(personToken: string, venueId: string, roomId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/rooms/${roomId}`, { method: "DELETE" }, personToken)
}

export async function listReservations(personToken: string, venueId: string, roomId: number): Promise<Reservation[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Reservation[]>(`/venues/${venueId}/rooms/${roomId}/reservations`, {}, personToken)
}

export async function createReservation(
  personToken: string,
  venueId: string,
  roomId: number,
  data: ReservationCreate
): Promise<Reservation> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Reservation>(
    `/venues/${venueId}/rooms/${roomId}/reservations`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function releaseRoom(personToken: string, venueId: string, roomId: number): Promise<Room> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Room>(`/venues/${venueId}/rooms/${roomId}/release`, { method: "POST" }, personToken)
}

export async function cancelReservation(
  personToken: string,
  venueId: string,
  roomId: number,
  reservationId: number
): Promise<Reservation> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<Reservation>(
    `/venues/${venueId}/rooms/${roomId}/reservations/${reservationId}/cancel`,
    { method: "POST" },
    personToken
  )
}

export async function uploadRoomImage(
  personToken: string,
  venueId: string,
  roomId: number,
  data: RoomImageCreate
): Promise<RoomImage> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<RoomImage>(
    `/venues/${venueId}/rooms/${roomId}/images`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function deleteRoomImage(
  personToken: string,
  venueId: string,
  roomId: number,
  imageId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/rooms/${roomId}/images/${imageId}`, { method: "DELETE" }, personToken)
}
