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

export interface RuleRow {
  interval: string
  weekday: number | null
  day_of_month: number | null
  week_of_month: number | null
  start_minute_of_day: number
  duration_minutes: number
  timezone: string
  anchor_date: string
  ends_on: string | null
  ends_after_count: number | null
  enabled: boolean
}

export interface HoursRow {
  id: number
  label: string | null
  source: string
  rule: RuleRow
}

export interface HoursCreate {
  label?: string | null
  interval: string
  weekday?: number | null
  day_of_month?: number | null
  week_of_month?: number | null
  start_minute_of_day: number
  duration_minutes: number
  timezone?: string | null
  anchor_date: string
  ends_on?: string | null
  ends_after_count?: number | null
}

export interface HoursUpdate {
  label?: string | null
  enabled?: boolean | null
}

export interface OpeningRow {
  hours_id: number
  label: string | null
  starts_at: string
  ends_at: string
}

export interface OpenNow {
  open: boolean
  current: OpeningRow | null
  next: OpeningRow | null
}

// ── Venues API ─────────────────────────────────────────────────

export interface VenueCreate {
  name: string
  slug?: string | null
  data_center: string
  world: string
}

export interface VenueRow {
  id: string
  name: string
  slug: string
  data_center: string
  world: string
}

export interface VenueImageRow {
  id: number
  image_url: string
  sort_order: number
}

export interface VenueLinkRow {
  id: number
  provider: string
  external_id: string
  linked_at: string
  linked_by_person_id: number | null
  last_synced_at: string | null
  unlinked_at: string | null
}

export type TaskVisibility = "all" | "assigned" | "assigned_unassigned"
export type SalesVisibility = "all" | "own" | "none"
export type RevenueVisibility = "all" | "hide" | "own"
export type EventVisibility = "all" | "published"

export interface VenueDetail {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  banner_url: string | null
  venue_type: string | null
  data_center: string
  world: string
  district: string | null
  ward: number | null
  plot: number | null
  apartment: number | null
  room: number | null
  subdivision: boolean | null
  timezone: string
  currency_name: string
  task_visibility: TaskVisibility
  sales_visibility: SalesVisibility
  revenue_visibility: RevenueVisibility
  event_visibility: EventVisibility
  is_active: boolean
  created_at: string
  updated_at: string
  images: VenueImageRow[]
  external_links: VenueLinkRow[]
}

export interface VenueUpdate {
  name?: string
  description?: string | null
  logo_url?: string | null
  banner_url?: string | null
  venue_type?: string | null
  data_center?: string
  world?: string
  district?: string | null
  ward?: number | null
  plot?: number | null
  apartment?: number | null
  room?: number | null
  subdivision?: boolean | null
  timezone?: string
  currency_name?: string
  task_visibility?: TaskVisibility
  sales_visibility?: SalesVisibility
  revenue_visibility?: RevenueVisibility
  event_visibility?: EventVisibility
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

// xvm-api's explicit ErrorDetail schema is {detail: string}, but FastAPI's own
// 422 validation responses (bad query/body shape, or a Pydantic model_validator
// raising ValueError) use {detail: [{msg: string, ...}, ...]} instead - err.body
// is the raw response text either way, so forwarding it as-is renders a JSON
// blob to the user instead of the message.
export function xvmErrorMessage(err: XvmApiError): string {
  try {
    const parsed = JSON.parse(err.body)
    if (typeof parsed?.detail === "string") return parsed.detail
    if (Array.isArray(parsed?.detail)) {
      const messages = parsed.detail
        .map((d: unknown) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : null))
        .filter((m: string | null): m is string => m !== null)
      if (messages.length > 0) return messages.join("; ")
    }
  } catch {
    // body wasn't JSON, fall through to the raw text below
  }
  return err.body || err.message
}

async function xvmFetch<T>(path: string, options: RequestInit = {}, bearerToken?: string): Promise<T> {
  const headers: Record<string, string> = {}
  // FormData bodies must NOT get an explicit Content-Type - fetch generates the
  // multipart boundary itself and only does so when it owns the header.
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
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

// xvm-api's gallery POSTs take multipart bytes now (validated, re-encoded to WebP
// server-side), not a JSON {image_url} - `file` is whatever the browser's <input
// type="file"> or a drag-drop handler already hands you.
export async function uploadRoomImage(
  personToken: string,
  venueId: string,
  roomId: number,
  file: File | Blob
): Promise<RoomImage> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const form = new FormData()
  form.append("file", file)
  return xvmFetch<RoomImage>(
    `/venues/${venueId}/rooms/${roomId}/images`,
    { method: "POST", body: form },
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

export async function createVenue(personToken: string, data: VenueCreate): Promise<VenueRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<VenueRow>("/venues", { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function getVenue(personToken: string, venueId: string): Promise<VenueDetail> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<VenueDetail>(`/venues/${venueId}`, {}, personToken)
}

export async function updateVenue(personToken: string, venueId: string, data: VenueUpdate): Promise<VenueDetail> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<VenueDetail>(`/venues/${venueId}`, { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

// ── Venue Hours API ────────────────────────────────────────────

export async function listHours(personToken: string, venueId: string): Promise<HoursRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<HoursRow[]>(`/venues/${venueId}/hours`, {}, personToken)
}

export async function createHours(personToken: string, venueId: string, data: HoursCreate): Promise<HoursRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<HoursRow>(`/venues/${venueId}/hours`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateHours(
  personToken: string,
  venueId: string,
  hoursId: number,
  data: HoursUpdate
): Promise<HoursRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<HoursRow>(`/venues/${venueId}/hours/${hoursId}`, { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

export async function deleteHours(personToken: string, venueId: string, hoursId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/hours/${hoursId}`, { method: "DELETE" }, personToken)
}

// from/to are ISO instants; the API caps the window at 60 days and 400s on an
// inverted or oversized range.
export async function listOpenings(
  personToken: string,
  venueId: string,
  from: string,
  to: string
): Promise<OpeningRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams({ from, to })
  return xvmFetch<OpeningRow[]>(`/venues/${venueId}/hours/openings?${params}`, {}, personToken)
}

export async function getOpenNow(personToken: string, venueId: string, at?: string): Promise<OpenNow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = at ? `?${new URLSearchParams({ at })}` : ""
  return xvmFetch<OpenNow>(`/venues/${venueId}/hours/now${params}`, {}, personToken)
}

// Unauthenticated - no bearerToken param, matching the endpoint's own
// unauthenticated public/venues/{id}/hours contract for anonymous page renders.
export interface PublicHours {
  open_now: OpenNow
  rules: HoursRow[]
  upcoming: OpeningRow[]
}

export async function getPublicHours(venueId: string, days?: number): Promise<PublicHours> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = days !== undefined ? `?${new URLSearchParams({ days: String(days) })}` : ""
  // Cached and revalidated rather than fetched fresh on every render - this
  // endpoint's 30 req/min/IP budget is shared across every public venue page
  // view site-wide via the dashboard server's one outbound IP, and hours data
  // changes rarely enough that a short revalidation window is unnoticeable.
  return xvmFetch<PublicHours>(`/public/venues/${venueId}/hours${params}`, { next: { revalidate: 60 } })
}

export interface PublicHoursBatch {
  venues: Record<string, PublicHours>
}

export async function getPublicHoursBatch(venueIds: string[], days?: number): Promise<PublicHoursBatch> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  if (venueIds.length === 0) return { venues: {} }
  const params = new URLSearchParams({ ids: venueIds.join(",") })
  if (days !== undefined) params.set("days", String(days))
  return xvmFetch<PublicHoursBatch>(`/public/venues/hours?${params}`, { next: { revalidate: 60 } })
}

// xvm-api caps one batch read at PUBLIC_HOURS_BATCH_MAX ids - this wraps
// getPublicHoursBatch with chunking and merging so callers with more ids
// (Following is unbounded) don't silently lose venues past the first batch.
export const PUBLIC_HOURS_BATCH_MAX = 50

export async function getPublicHoursForVenues(
  venueIds: string[],
  days?: number
): Promise<Record<string, PublicHours>> {
  const merged: Record<string, PublicHours> = {}
  for (let i = 0; i < venueIds.length; i += PUBLIC_HOURS_BATCH_MAX) {
    const batch = await getPublicHoursBatch(venueIds.slice(i, i + PUBLIC_HOURS_BATCH_MAX), days)
    Object.assign(merged, batch.venues)
  }
  return merged
}

// ── Positions API ──────────────────────────────────────────────

export interface PositionCreate {
  name: string
  color?: number | null
  responsibilities?: string | null
  hourly_rate_minor?: number | null
  discord_role_id?: number | null
}

export interface PositionUpdate {
  name?: string | null
  color?: number | null
  responsibilities?: string | null
  hourly_rate_minor?: number | null
  discord_role_id?: number | null
}

export interface PositionRow {
  id: number
  name: string
  color: number | null
  responsibilities: string | null
  hourly_rate_minor: number | null
  pot_payout_mode: string
  contractor_shares_pot: boolean
  discord_role_id: number | null
  member_ids: number[]
}

export async function listPositions(personToken: string, venueId: string): Promise<PositionRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PositionRow[]>(`/venues/${venueId}/positions`, {}, personToken)
}

export async function createPosition(
  personToken: string,
  venueId: string,
  data: PositionCreate
): Promise<PositionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PositionRow>(
    `/venues/${venueId}/positions`,
    { method: "POST", body: JSON.stringify(data) },
    personToken
  )
}

export async function updatePosition(
  personToken: string,
  venueId: string,
  positionId: number,
  data: PositionUpdate
): Promise<PositionRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<PositionRow>(
    `/venues/${venueId}/positions/${positionId}`,
    { method: "PATCH", body: JSON.stringify(data) },
    personToken
  )
}

export async function assignPositionMember(
  personToken: string,
  venueId: string,
  positionId: number,
  membershipId: number
): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(
    `/venues/${venueId}/positions/${positionId}/members`,
    { method: "POST", body: JSON.stringify({ membership_id: membershipId }) },
    personToken
  )
}

export async function deletePosition(personToken: string, venueId: string, positionId: number): Promise<void> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<void>(`/venues/${venueId}/positions/${positionId}`, { method: "DELETE" }, personToken)
}

// ── Memberships API ────────────────────────────────────────────

export interface MembershipPerson {
  id: number
  display_name: string
}

export interface MembershipRow {
  id: number
  person: MembershipPerson
  nickname: string | null
  tier: string
  effective_tier: string
  is_employed: boolean
}

export async function listMemberships(personToken: string, venueId: string): Promise<MembershipRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<MembershipRow[]>(`/venues/${venueId}/memberships`, {}, personToken)
}

// ── Tasks API ──────────────────────────────────────────────────

export interface CategoryRow {
  id: number
  name: string
  sort_order: number
}

export async function listTaskCategories(personToken: string, venueId: string): Promise<CategoryRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<CategoryRow[]>(`/venues/${venueId}/tasks/categories`, {}, personToken)
}

export async function createTaskCategory(personToken: string, venueId: string, name: string): Promise<CategoryRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<CategoryRow>(
    `/venues/${venueId}/tasks/categories`,
    { method: "POST", body: JSON.stringify({ name, sort_order: 0 }) },
    personToken
  )
}

export interface TaskRow {
  id: number
  title: string
  description: string | null
  priority: number
  due_at: string | null
  category_id: number | null
  assigned_membership_id: number | null
  assigned_position_id: number | null
  started_at: string | null
  completed_at: string | null
  completed_by_person_id: number | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_by_person_id: number | null
  created_at: string
  updated_at: string
}

export interface TaskCreateData {
  title: string
  description?: string | null
  priority?: number
  due_at?: string | null
  category_id?: number | null
  assigned_membership_id?: number | null
  assigned_position_id?: number | null
}

export interface TaskUpdateData {
  title?: string
  description?: string | null
  priority?: number
  due_at?: string | null
  category_id?: number | null
}

export interface TaskAssignData {
  membership_id?: number | null
  position_id?: number | null
}

export async function listTasks(
  personToken: string,
  venueId: string,
  options: { includeCompleted?: boolean; includeCancelled?: boolean; categoryId?: number } = {}
): Promise<TaskRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  const params = new URLSearchParams()
  if (options.includeCompleted) params.set("include_completed", "true")
  if (options.includeCancelled) params.set("include_cancelled", "true")
  if (options.categoryId !== undefined) params.set("category_id", String(options.categoryId))
  const query = params.toString() ? `?${params}` : ""
  return xvmFetch<TaskRow[]>(`/venues/${venueId}/tasks${query}`, {}, personToken)
}

export async function createTask(personToken: string, venueId: string, data: TaskCreateData): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function updateTask(personToken: string, venueId: string, taskId: number, data: TaskUpdateData): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }, personToken)
}

export async function assignTask(personToken: string, venueId: string, taskId: number, data: TaskAssignData): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}/assign`, { method: "POST", body: JSON.stringify(data) }, personToken)
}

export async function startTask(personToken: string, venueId: string, taskId: number): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}/start`, { method: "POST" }, personToken)
}

export async function completeTask(personToken: string, venueId: string, taskId: number): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(`/venues/${venueId}/tasks/${taskId}/complete`, { method: "POST" }, personToken)
}

export async function cancelTask(personToken: string, venueId: string, taskId: number, reason?: string | null): Promise<TaskRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TaskRow>(
    `/venues/${venueId}/tasks/${taskId}/cancel`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
    personToken
  )
}
