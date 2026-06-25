# ffxivvenues.com Integration Design

**Date:** 2026-06-25
**Status:** Awaiting API access confirmation from ffxivvenues.com
**Pattern:** Mirrors existing Partake integration

---

## Overview

Venue managers can opt in to link their ffxivvenues.com listing to their XIV Venue Manager venue. Once linked, schedule data (days/times) and events sync automatically and display across the web app and mobile app. The integration is additive -- no native data is modified, and no venues are auto-imported from ffxivvenues.com.

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
  schedule  Json     // raw schedule data from their API
  syncedAt  DateTime @updatedAt

  venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)

  @@map("venue_schedules")
}
```

### Event (additions)

```prisma
ffxivVenuesEventId  String?  @unique
source              String?  // "ffxivvenues" | null (null = native)
```

Native events have `source: null` -- no existing records are affected. External events are identified by `source: "ffxivvenues"` and managed exclusively by the sync layer.

---

## Sync Layer

### Cron Jobs (two, mirroring Partake)

**`sync-ffxivvenues-schedule`**
- Runs every few hours
- Fetches schedule data for all venues where `ffxivVenueId` is set
- Upserts into `VenueSchedule`

**`sync-ffxivvenues-events`**
- Runs every few hours
- Fetches upcoming events for all linked venues
- Upserts into the events table with `source: "ffxivvenues"` and `ffxivVenuesEventId`
- Deletes stale external events that no longer appear in their feed
- Never touches events where `source` is null

### Manual Sync

`POST /api/venues/[venueId]/sync-ffxivvenues`
- Triggers both syncs for a single venue
- Called from the settings page sync button
- Also fires automatically on initial link

### Link / Unlink

Handled via the existing `PATCH /api/venues/[venueId]/settings` endpoint:
- **Link:** save `ffxivVenueId`, store `ffxivVenueLinkedBy` + `ffxivVenueLinkedAt`, trigger initial sync
- **Unlink:** clear `ffxivVenueId`, delete `VenueSchedule` record, delete all `source: "ffxivvenues"` events for the venue

---

## Display Layer

### Web -- Venue Profile (public)
- Schedule section below venue description, sourced from `VenueSchedule`
- ffxivvenues.com events appear in the events list with a small "via ffxivvenues.com" label
- Native events and external events visually identical otherwise

### Web -- Operator Dashboard
- ffxivvenues.com events appear in the events tab with a source badge
- Read-only -- operators cannot edit external events, only native ones

### Web -- Venue Settings
- New "ffxivvenues.com Venue ID" field with a link to their directory
- Connected state shows linked venue name, last synced timestamp, Sync Now + Unlink buttons
- Unlink shows a confirmation warning that synced data will be removed

### Mobile -- Venue Detail
- Schedule data surfaces below the venue description
- ffxivvenues.com events appear in the events card list with a "View on ffxivvenues.com →" link
- Same pattern as existing "View on Partake →" link

---

## Settings / Linking Flow

### Linking
1. Operator enters their ffxivvenues.com venue ID in settings
2. API fetches that venue from ffxivvenues.com
3. Name and world/ward compared against the XIV VM venue record
4. Match: link saves, audit fields stored, initial sync fires
5. Mismatch: save rejected with a message explaining the discrepancy

### Unlinking
1. Operator clicks Unlink
2. Confirmation prompt warns that all synced schedule and event data will be removed
3. On confirm: `ffxivVenueId` cleared, `VenueSchedule` deleted, all `source: "ffxivvenues"` events deleted

### Audit Trail
`ffxivVenueLinkedBy` and `ffxivVenueLinkedAt` stored silently. Not visible to operators -- available in admin panel for investigating bad link claims.

---

## What's New vs Partake

| | Partake | ffxivvenues.com |
|---|---|---|
| Venue schedule/days | No | Yes -- `VenueSchedule` table |
| Events in event list | Yes | Yes |
| Attendee counts | Yes | No |
| Source link in mobile | Yes (Partake) | Yes (ffxivvenues.com) |
| Cron sync | Yes (2 jobs) | Yes (2 jobs) |
| Manual sync button | Yes | Yes |
| Settings ID field | Yes (team ID) | Yes (venue ID) |
| Verification | None | Name/world match |

---

## Out of Scope

- Pushing data to ffxivvenues.com (open/close status or otherwise)
- Auto-importing unlinked ffxivvenues.com venues into XIV VM
- Editing ffxivvenues.com events from within XIV VM
- Any integration before API access is confirmed with ffxivvenues.com

---

## Prerequisites

- API access confirmed and documented by ffxivvenues.com
- Understand their event and schedule data shapes before implementation
