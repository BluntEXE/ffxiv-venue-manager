# ffxivvenues.com Integration Design

**Date:** 2026-06-25
**Updated:** 2026-06-26 (API confirmed, spec revised against actual schema)
**Status:** API access confirmed -- ready to build
**Pattern:** Mirrors existing Partake integration

---

## API Facts (confirmed 2026-06-26)

- **Spec:** `https://api.ffxivvenues.com/openapi/v1.0.json`
- **Base URL:** `http://api.ffxivvenues.com`
- **Auth:** None required for reads. Write endpoints need an Authorization Key (not needed for this integration).
- **Rate limit:** 3 calls / 10 seconds per IP (shared across all callers from that IP)
- **User-Agent:** Required on every request -- use `XIV-Venue-Manager/1.0`
- **`recordView=false`:** Must add this query param on all our sync fetches to avoid polluting their telemetry
- **No events endpoint.** The API only exposes venue data with embedded schedule. There is no separate events resource.

### Venue object (relevant fields)

```ts
{
  id: string
  name: string
  bannerUri: string | null         // their banner image URL
  description: string[] | null     // array of paragraphs
  location: {
    dataCenter, world, district,
    ward, plot, apartment, room,
    subdivision, shard, override
  }
  website: string | null
  discord: string | null
  hiring: boolean
  sfw: boolean
  tags: string[] | null
  schedule: Schedule[] | null      // recurring weekly schedule entries
  scheduleOverrides: ScheduleOverride[] | null  // one-off date overrides
  notices: Notice[] | null         // temporary announcements
  resolution: Opening | null       // pre-computed: isNow, next open window
  lastModified: datetime
}
```

### Schedule entry

```ts
{
  day: integer          // Day enum (0=Sunday? -- verify against their docs)
  start: { hour, minute, timeZone, nextDay }
  end: { hour, minute, timeZone, nextDay } | null
  interval: { intervalType, intervalArgument }  // weekly, biweekly, etc.
  commencing: datetime | null    // when this schedule entry starts being valid
  location: Location | null      // per-schedule location override
  resolution: Opening            // next concrete open window for this entry
  utc: UtcSchedule               // UTC-normalised version
}
```

### Opening (resolution)

```ts
{
  start: datetime
  end: datetime
  isNow: boolean
  isWithinWeek: boolean
}
```

---

## What This Changes vs Original Design

**Removed:** `Event` table additions. ffxivvenues.com has no events resource -- only schedule data. The original plan assumed an events feed; it doesn't exist.

**Removed:** `sync-ffxivvenues-events` cron job. Only one cron needed.

**Simplified:** `VenueSchedule` stores the full venue payload (schedule + resolution + notices). Display reads from this blob.

---

## Data Model

### Venue (additions)

```prisma
ffxivVenueId         String?   @unique
ffxivVenueLinkedAt   DateTime?
ffxivVenueLinkedBy   String?   // userId of the person who linked it
```

### New: VenueSchedule

```prisma
model VenueSchedule {
  id        String   @id @default(cuid())
  venueId   String   @unique
  source    String   // "ffxivvenues"
  data      Json     // full Venue object from their API (schedule, resolution, notices, etc.)
  syncedAt  DateTime @updatedAt

  venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)

  @@map("venue_schedules")
}
```

`data` stores the entire ffxivvenues Venue object. We don't project out fields at write time -- display layer reads what it needs. Avoids a migration every time their schema adds a field.

---

## Sync Layer

### Cron Job (one)

**`sync-ffxivvenues-schedule`**
- Runs every 2 hours
- Fetches `GET /v1.0/venue/{id}?recordView=false` for each venue where `ffxivVenueId` is set
- Throttled: max 3 requests / 10s (respect shared IP rate limit)
- Upserts result into `VenueSchedule.data`
- On 404: unlink the venue (their listing was removed), clear `ffxivVenueId`, delete `VenueSchedule`
- Sets `User-Agent: XIV-Venue-Manager/1.0` on every request
- Handles failures gracefully -- stale data is better than crashing

### Manual Sync

`POST /api/venues/[venueId]/sync-ffxivvenues`
- Triggers sync for a single venue immediately
- Called from the settings page Sync Now button
- Also fires automatically on initial link (gives instant feedback to the operator)

### Link / Unlink

Handled via the existing `PATCH /api/venues/[venueId]/settings` endpoint:
- **Link:** save `ffxivVenueId`, store `ffxivVenueLinkedBy` + `ffxivVenueLinkedAt`, trigger initial sync
- **Unlink:** clear `ffxivVenueId`, delete `VenueSchedule` record

---

## Display Layer

### Web -- Venue Profile (public)

- "Schedule" section sourced from `VenueSchedule.data.schedule`
- Show `resolution.isNow` as an "Open Now" badge if applicable
- Show next open window from `resolution` if not currently open
- Attribution: "Schedule via ffxivvenues.com" with link, near the schedule section (required by their ToS §7)

### Web -- Operator Dashboard

- Schedule tab shows synced schedule with "via ffxivvenues.com" source badge
- Read-only -- no editing of synced schedule data

### Web -- Venue Settings

- New "ffxivvenues.com" section
- Disconnected state: text input for venue ID + a link to their directory to find it
- Connected state: linked venue name, last synced time, Sync Now + Unlink buttons
- Unlink shows confirmation warning that synced schedule data will be removed

### Mobile -- Venue Detail

- Schedule data surfaces below venue description
- "Open Now" badge from `resolution.isNow`
- "View schedule on ffxivvenues.com →" link (attribution + link)
- Same pattern as existing "View on Partake →"

---

## Settings / Linking Flow

### Linking

1. Operator enters their ffxivvenues.com venue ID in settings
2. Our API fetches `GET /v1.0/venue/{id}?recordView=false` and returns the venue name
3. Settings page shows "You are linking to: [venue name]" + Confirm button
4. On confirm: link saves, audit fields stored, initial sync fires, settings page shows connected state

No automated name/location matching -- multi-plot venues and name variations make this unreliable. Operator confirms what they're linking to. Audit trail handles bad-faith claims.

### Unlinking

1. Operator clicks Unlink
2. Confirmation prompt: warns that synced schedule data will be removed
3. On confirm: `ffxivVenueId` cleared, `VenueSchedule` record deleted

### Audit Trail

`ffxivVenueLinkedBy` + `ffxivVenueLinkedAt` stored silently. Not visible to operators -- available in admin panel for investigating bad-link claims.

---

## Terms Compliance

| Requirement | How we meet it |
|---|---|
| Rate limit 3/10s | Throttled cron + single venue fetches |
| User-Agent required | `XIV-Venue-Manager/1.0` on every request |
| `recordView=false` on sync fetches | Always added |
| Attribution mandatory near feature | "Schedule via ffxivvenues.com" link in schedule section |
| Non-commercial only | XIV VM is cost-recovery/nonprofit, compliant |
| Handle failures gracefully | Stale data retained on error, no crash |

---

## What's New vs Partake

| | Partake | ffxivvenues.com |
|---|---|---|
| Venue schedule/days | No | Yes -- `VenueSchedule` table |
| Events in event list | Yes | No (no events API) |
| Open Now status | No | Yes -- `resolution.isNow` |
| Attendee counts | Yes | No |
| Source link in mobile | Yes (Partake) | Yes (ffxivvenues.com) |
| Cron sync | Yes (2 jobs) | Yes (1 job) |
| Manual sync button | Yes | Yes |
| Settings ID field | Yes (team ID) | Yes (venue ID) |
| Verification | None | Operator confirms venue name before linking |
| Attribution required | No | Yes (ToS §7) |

---

## Out of Scope

- Pushing data to ffxivvenues.com (open/close status or otherwise)
- Auto-importing unlinked ffxivvenues.com venues into XIV VM
- Any write operations against their API
- Displaying their banner image (we have our own gallery)

---

## API Endpoint Used

```
GET /v1.0/venue/{id}?recordView=false
Headers:
  User-Agent: XIV-Venue-Manager/1.0
```

That's it. One endpoint, one cron, one table.
