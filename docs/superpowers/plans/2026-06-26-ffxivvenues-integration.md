# ffxivvenues.com Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow venue operators to optionally link their ffxivvenues.com listing, syncing their schedule data to display on their XIV VM profile with proper attribution.

**Architecture:** Three linked pieces: (1) a `VenueSchedule` table stores the full synced JSON blob from their API; (2) a lib module handles rate-limited fetching and upsert; (3) a cron job syncs all linked venues every 2 hours, while the settings page provides link/unlink/sync-now controls. Display adds a synced schedule card to the venue profile with mandatory attribution per ToS §6. No events API exists — schedule only.

**Tech Stack:** Next.js 15 App Router, Prisma v7 (db push), Zod, `fetch` (no extra HTTP lib needed), existing `verifyCronAuth` cron pattern, XIV design system.

---

## Context You Must Know

- **API base:** `http://api.ffxivvenues.com` — no auth required for reads
- **Required headers on every request:** `User-Agent: XIV-Venue-Manager/1.0`
- **Required query param on sync fetches:** `?recordView=false`
- **Rate limit:** 3 calls / 10 seconds (shared IP) — add a 400ms sleep between cron requests
- **Attribution:** ToS §6 requires visible "Schedule via ffxivvenues.com" link wherever synced schedule data is displayed
- **No write operations** — we only read from their API
- **Server Time = UTC** — their `utc` sub-object on schedule entries gives ST-native times directly
- **Prisma db push workflow** — no migrations table; apply schema changes with `pnpm prisma db push` from `apps/web/`, or raw SQL on the postgres container if the worktree lacks `.env`
- **Settings route** is `PUT /api/venues/[venueId]/settings` (not PATCH) — follows same pattern as `partakeTeamId`
- **Cron pattern:** `verifyCronAuth(request)` first, then lib function, return stats JSON — see `apps/web/app/api/cron/sync-partake-events/route.ts`
- **Membership auth:** `status: "active"` (not `isActive: true`)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/web/prisma/schema.prisma` | Modify | Add 3 fields to Venue + VenueSchedule model |
| `apps/web/lib/ffxivvenues.ts` | Create | API client, type definitions, sync functions |
| `apps/web/app/api/venues/[venueId]/sync-ffxivvenues/route.ts` | Create | GET preview + POST manual sync |
| `apps/web/app/api/cron/sync-ffxivvenues-schedule/route.ts` | Create | Cron: sync all linked venues |
| `apps/web/app/api/venues/[venueId]/settings/route.ts` | Modify | Add ffxivVenueId to GET response + PUT schema + link/unlink logic |
| `apps/web/components/ffxivvenues-schedule-display.tsx` | Create | Read-only schedule display for synced data |
| `apps/web/app/dashboard/[slug]/settings/page.tsx` | Modify | Add ffxivvenues.com link/unlink/sync UI section |
| `apps/web/app/venues/[slug]/page.tsx` | Modify | Add synced schedule card + attribution + update Open Now badge |

---

## Task 1: Prisma Schema

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Add 3 fields to the `Venue` model** — after the `// Partake Integration` block (around line 173):

```prisma
  // ffxivvenues.com Integration
  ffxivVenueId       String?   @unique
  ffxivVenueLinkedAt DateTime?
  ffxivVenueLinkedBy String?   // userId of the person who linked it
```

- [ ] **Add `venueSchedule` relation to the `Venue` model** — after `scheduleEntries VenueScheduleEntry[]` (before `@@map("venues")`):

```prisma
  venueSchedule   VenueSchedule?
```

- [ ] **Add the `VenueSchedule` model** — after the `VenueScheduleEntry` model block:

```prisma
model VenueSchedule {
  id       String   @id @default(cuid())
  venueId  String   @unique
  source   String   // "ffxivvenues"
  data     Json     // full Venue object from their API
  syncedAt DateTime @updatedAt

  venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)

  @@map("venue_schedules")
}
```

- [ ] **Apply the schema to the DB:**

The worktree at `.worktrees/feat-ffxivvenues-integration` won't have a `.env` file (it uses Docker internal hostnames). Apply via raw SQL on the postgres container instead:

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c \"
ALTER TABLE venues ADD COLUMN IF NOT EXISTS \\\"ffxivVenueId\\\" TEXT UNIQUE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS \\\"ffxivVenueLinkedAt\\\" TIMESTAMPTZ;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS \\\"ffxivVenueLinkedBy\\\" TEXT;

CREATE TABLE IF NOT EXISTS venue_schedules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  \\\"venueId\\\" TEXT NOT NULL UNIQUE REFERENCES venues(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  data JSONB NOT NULL,
  \\\"syncedAt\\\" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
\""
```

- [ ] **Verify:**

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c '\d venue_schedules'"
```

Expected: table with id, venueId, source, data, syncedAt columns.

- [ ] **Commit:**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat: add ffxivVenueId fields to Venue and VenueSchedule model"
```

---

## Task 2: ffxivvenues.ts Library

**Files:**
- Create: `apps/web/lib/ffxivvenues.ts`

- [ ] **Create the file:**

```ts
import { prisma } from "@/lib/prisma"

const FFXIVVENUES_API = "http://api.ffxivvenues.com"
const USER_AGENT = "XIV-Venue-Manager/1.0"

// ── Types (only the fields we use) ──────────────────────────────────────────

export type FfxivTime = {
  hour: number
  minute: number
  timeZone: string
  nextDay: boolean
}

export type FfxivUtcSchedule = {
  from: string | null
  day: number        // 0=Sun … 6=Sat
  start: FfxivTime
  end: FfxivTime
  location: unknown
}

export type FfxivScheduleEntry = {
  day: number
  start: FfxivTime
  end: FfxivTime | null
  interval: { intervalType: number; intervalArgument: number }
  commencing: string | null
  utc: FfxivUtcSchedule
  resolution: FfxivOpening
}

export type FfxivOpening = {
  start: string
  end: string
  isNow: boolean
  isWithinWeek: boolean
}

export type FfxivScheduleOverride = {
  open: boolean
  start: string
  end: string
  isNow: boolean
}

export type FfxivNotice = {
  id: string | null
  start: string
  end: string
  type: number
  message: string | null
  isNow: boolean
}

export type FfxivVenueData = {
  id: string
  name: string
  schedule: FfxivScheduleEntry[] | null
  scheduleOverrides: FfxivScheduleOverride[] | null
  notices: FfxivNotice[] | null
  resolution: FfxivOpening
}

// ── API fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch a single venue from ffxivvenues.com.
 * Returns null on 404 (venue removed/unlisted).
 * Throws on network errors or unexpected status codes.
 */
export async function fetchFfxivVenue(ffxivId: string): Promise<FfxivVenueData | null> {
  const url = `${FFXIVVENUES_API}/v1.0/venue/${encodeURIComponent(ffxivId)}?recordView=false`
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 0 },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`ffxivvenues API error: ${res.status}`)
  return res.json() as Promise<FfxivVenueData>
}

// ── Single venue sync ────────────────────────────────────────────────────────

export type SyncResult = {
  ok: boolean
  venueName?: string
  error?: string
  unlinked?: boolean   // true if their listing was 404 and we cleared the link
}

/**
 * Fetch the ffxivvenues data for a single linked venue and upsert it
 * into VenueSchedule. Clears the link if their venue returns 404.
 */
export async function syncFfxivVenue(venueId: string, ffxivId: string): Promise<SyncResult> {
  let data: FfxivVenueData | null
  try {
    data = await fetchFfxivVenue(ffxivId)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fetch failed" }
  }

  if (!data) {
    // Their listing was removed — clear the link
    await prisma.venue.update({
      where: { id: venueId },
      data: { ffxivVenueId: null, ffxivVenueLinkedAt: null, ffxivVenueLinkedBy: null },
    })
    await prisma.venueSchedule.deleteMany({ where: { venueId } })
    return { ok: false, unlinked: true, error: "Venue not found on ffxivvenues.com — link cleared" }
  }

  await prisma.venueSchedule.upsert({
    where: { venueId },
    create: { venueId, source: "ffxivvenues", data: data as object },
    update: { source: "ffxivvenues", data: data as object },
  })

  return { ok: true, venueName: data.name }
}

// ── Bulk cron sync ───────────────────────────────────────────────────────────

export type BulkSyncResults = {
  synced: number
  unlinked: number
  errors: number
}

/**
 * Sync all venues that have ffxivVenueId set.
 * Throttled to 3 calls / 10s via 400ms sleep between requests.
 */
export async function syncAllFfxivVenues(): Promise<BulkSyncResults> {
  const venues = await prisma.venue.findMany({
    where: { ffxivVenueId: { not: null } },
    select: { id: true, ffxivVenueId: true },
  })

  const results: BulkSyncResults = { synced: 0, unlinked: 0, errors: 0 }

  for (const venue of venues) {
    if (!venue.ffxivVenueId) continue

    const result = await syncFfxivVenue(venue.id, venue.ffxivVenueId)

    if (result.ok) results.synced++
    else if (result.unlinked) results.unlinked++
    else results.errors++

    // Rate limit: 3 calls / 10s → 400ms gap keeps us safely under
    await new Promise(r => setTimeout(r, 400))
  }

  return results
}
```

- [ ] **Commit:**

```bash
git add apps/web/lib/ffxivvenues.ts
git commit -m "feat: add ffxivvenues.com API client and sync functions"
```

---

## Task 3: Sync Route (Preview + Manual Sync)

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/sync-ffxivvenues/route.ts`

- [ ] **Create the directory and file:**

```bash
mkdir -p "apps/web/app/api/venues/[venueId]/sync-ffxivvenues"
```

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { fetchFfxivVenue, syncFfxivVenue } from "@/lib/ffxivvenues"

async function requireOwner(venueId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { venueId, userId, role: "OWNER", status: "active" },
  })
  return !!membership
}

/**
 * GET ?ffxivId=xxx — preview: fetch their venue and return name for confirmation UI.
 * Does NOT save anything. Used before the operator confirms a link.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  if (!(await requireOwner(venueId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const ffxivId = req.nextUrl.searchParams.get("ffxivId")
  if (!ffxivId) return NextResponse.json({ error: "ffxivId required" }, { status: 400 })

  const venue = await fetchFfxivVenue(ffxivId)
  if (!venue) return NextResponse.json({ error: "Venue not found on ffxivvenues.com" }, { status: 404 })

  return NextResponse.json({ id: venue.id, name: venue.name })
}

/**
 * POST — trigger a sync for this venue's linked ffxivvenues listing.
 * Uses the stored ffxivVenueId. Errors if not linked.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  if (!(await requireOwner(venueId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { ffxivVenueId: true },
  })
  if (!venue?.ffxivVenueId)
    return NextResponse.json({ error: "Venue is not linked to ffxivvenues.com" }, { status: 400 })

  const result = await syncFfxivVenue(venueId, venue.ffxivVenueId)

  if (!result.ok)
    return NextResponse.json({ error: result.error, unlinked: result.unlinked }, { status: result.unlinked ? 410 : 502 })

  return NextResponse.json({ ok: true, venueName: result.venueName })
}
```

- [ ] **Commit:**

```bash
git add "apps/web/app/api/venues/[venueId]/sync-ffxivvenues/route.ts"
git commit -m "feat: add GET preview + POST manual sync for ffxivvenues"
```

---

## Task 4: Cron Handler

**Files:**
- Create: `apps/web/app/api/cron/sync-ffxivvenues-schedule/route.ts`

- [ ] **Create the file:**

```ts
import { NextResponse } from "next/server"
import { syncAllFfxivVenues } from "@/lib/ffxivvenues"
import { verifyCronAuth } from "@/lib/cron-auth"

/**
 * Cron Job: Sync schedule data from ffxivvenues.com
 * Fetches venue data for all venues with ffxivVenueId set.
 *
 * QStash Configuration:
 * - URL: https://xivvenuemanager.com/api/cron/sync-ffxivvenues-schedule
 * - Schedule: Every 2 hours (cron: 0 */2 * * *)
 * - Method: GET
 * - Headers: { "authorization": "Bearer YOUR_CRON_SECRET" }
 */
export async function GET(request: Request) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const now = new Date()
    console.log(`[ffxivvenues Sync] Starting at ${now.toISOString()}`)

    const results = await syncAllFfxivVenues()

    console.log(`[ffxivvenues Sync] Complete: ${results.synced} synced, ${results.unlinked} unlinked, ${results.errors} errors`)

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    })
  } catch (error) {
    console.error("[ffxivvenues Sync] Fatal error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

- [ ] **Commit:**

```bash
git add apps/web/app/api/cron/sync-ffxivvenues-schedule/route.ts
git commit -m "feat: add cron handler for ffxivvenues schedule sync"
```

---

## Task 5: Settings Route — Link/Unlink Support

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/settings/route.ts`

Read the full file first to understand the current structure before editing.

- [ ] **Add `ffxivVenueId` to `updateSettingsSchema`** — after the `partakeTeamId` line (around line 38):

```ts
  // ffxivvenues.com integration
  ffxivVenueId: z.string().nullable().optional(),
```

- [ ] **Add `ffxivVenueId` and `ffxivVenueLinkedAt`/`ffxivVenueLinkedBy` to the GET response** — in the `select` and return of the GET handler. Find the `select` block in GET:

```ts
// Change:
select: {
  settings: true,
  discordWebhookUrl: true,
  partakeTeamId: true,
},

// To:
select: {
  settings: true,
  discordWebhookUrl: true,
  partakeTeamId: true,
  ffxivVenueId: true,
  ffxivVenueLinkedAt: true,
  venueSchedule: { select: { syncedAt: true } },
},
```

And update the GET return to include the new fields:

```ts
return NextResponse.json({
  ...parseVenueSettings(venue.settings),
  discordWebhookUrl: venue.discordWebhookUrl,
  partakeTeamId: venue.partakeTeamId,
  ffxivVenueId: venue.ffxivVenueId,
  ffxivVenueLinkedAt: venue.ffxivVenueLinkedAt,
  ffxivVenueSyncedAt: venue.venueSchedule?.syncedAt ?? null,
})
```

- [ ] **Handle `ffxivVenueId` in the PUT handler** — in the PUT handler, find the `const { discordWebhookUrl, partakeTeamId, ...settingsData } = validatedData` line and expand it:

```ts
const { discordWebhookUrl, partakeTeamId, ffxivVenueId, ...settingsData } = validatedData
```

Then find the `prisma.venue.update` data block and add after the `partakeTeamId` block:

```ts
...(ffxivVenueId !== undefined && {
  ffxivVenueId: ffxivVenueId,
  // Set audit fields on link, clear on unlink
  ffxivVenueLinkedAt: ffxivVenueId ? new Date() : null,
  ffxivVenueLinkedBy: ffxivVenueId ? session.user.id : null,
}),
```

Also, when `ffxivVenueId` is being set to `null` (unlink), delete the `VenueSchedule` record. Add after the `prisma.venue.update` call in the PUT handler:

```ts
// If unlinking, remove synced schedule data
if (ffxivVenueId === null) {
  await prisma.venueSchedule.deleteMany({ where: { venueId } })
}
```

- [ ] **Update the PUT response** to include the new fields — find the `return NextResponse.json(...)` in PUT and update:

```ts
return NextResponse.json({
  ...parseVenueSettings(updatedVenue.settings),
  discordWebhookUrl: updatedVenue.discordWebhookUrl,
  partakeTeamId: updatedVenue.partakeTeamId,
  ffxivVenueId: updatedVenue.ffxivVenueId,
})
```

Note: you'll need to add `ffxivVenueId: true` to the PUT's `select` block as well.

- [ ] **TypeScript check:**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Commit:**

```bash
git add "apps/web/app/api/venues/[venueId]/settings/route.ts"
git commit -m "feat: add ffxivVenueId link/unlink to settings route"
```

---

## Task 6: FfxivvenuesScheduleDisplay Component

**Files:**
- Create: `apps/web/components/ffxivvenues-schedule-display.tsx`

This is a server component. It displays the synced schedule from `VenueSchedule.data` with attribution.

- [ ] **Create the file:**

```tsx
import type { FfxivVenueData } from "@/lib/ffxivvenues"

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

function formatUtcTime(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM"
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const m = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`
  return `${h}${m} ${period}`
}

type Props = {
  data: FfxivVenueData
  syncedAt: Date | string
}

export function FfxivvenuesScheduleDisplay({ data, syncedAt }: Props) {
  const schedule = data.schedule ?? []
  const todayDay = new Date().getUTCDay()

  // Group entries by UTC day
  const byDay = new Map<number, typeof schedule>()
  for (const entry of schedule) {
    const d = entry.utc?.day ?? entry.day
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d)!.push(entry)
  }

  const syncedDate = new Date(syncedAt)
  const syncLabel = syncedDate.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  }) + " ST"

  return (
    <div className="dcard">
      <div className="dh">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        Schedule
        <span className="ml-auto text-[0.7rem] text-[var(--fg-faint)] font-normal">via ffxivvenues.com</span>
      </div>

      {schedule.length === 0 ? (
        <p className="px-5 py-3 text-[0.82rem] text-[var(--fg-faint)]">No schedule published on ffxivvenues.com.</p>
      ) : (
        <>
          {[0,1,2,3,4,5,6].map(i => {
            const entries = byDay.get(i)
            const isToday = i === todayDay
            if (!entries || entries.length === 0) {
              return (
                <div key={i} className={`hours-row closed${isToday ? " today" : ""}`}>
                  <span className="day">{DAY_NAMES[i]}</span>
                  <span className="hrs">—</span>
                </div>
              )
            }
            return entries.map((entry, idx) => {
              const utc = entry.utc
              const startStr = formatUtcTime(utc.start.hour, utc.start.minute)
              const endStr = utc.end ? formatUtcTime(utc.end.hour, utc.end.minute) : null
              const timeStr = endStr ? `${startStr} – ${endStr} ST` : `${startStr} ST`
              return (
                <div key={idx} className={`hours-row${isToday ? " today" : ""}`}>
                  <span className="day">{idx === 0 ? DAY_NAMES[i] : ""}</span>
                  <span className="hrs">{timeStr}</span>
                </div>
              )
            })
          })}
        </>
      )}

      <div className="px-5 py-2 flex items-center justify-between">
        <a
          href={`https://ffxivvenues.com/venue/${data.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.75rem] text-[var(--xiv-blue)] hover:opacity-80 transition-opacity"
        >
          Schedule via ffxivvenues.com →
        </a>
        <span className="text-[0.7rem] text-[var(--fg-faint)]">Synced {syncLabel}</span>
      </div>
    </div>
  )
}
```

- [ ] **Commit:**

```bash
git add apps/web/components/ffxivvenues-schedule-display.tsx
git commit -m "feat: add FfxivvenuesScheduleDisplay component with ToS attribution"
```

---

## Task 7: Settings Page UI — ffxivvenues Section

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

Read the full file first to understand the Partake section pattern — the ffxivvenues section should look similar.

No new component imports needed — we use only `fetch`, `useState`, and existing UI components already imported in the file.

- [ ] **Add state vars** near the other useState declarations:

```tsx
// ffxivvenues.com link state
const [ffxivVenueId, setFfxivVenueId] = useState<string | null>(null)
const [ffxivVenueLinkedAt, setFfxivVenueLinkedAt] = useState<string | null>(null)
const [ffxivVenueSyncedAt, setFfxivVenueSyncedAt] = useState<string | null>(null)
const [ffxivInput, setFfxivInput] = useState("")
const [ffxivPreview, setFfxivPreview] = useState<{ id: string; name: string } | null>(null)
const [ffxivPreviewLoading, setFfxivPreviewLoading] = useState(false)
const [ffxivPreviewError, setFfxivPreviewError] = useState<string | null>(null)
const [ffxivSyncing, setFfxivSyncing] = useState(false)
const [ffxivUnlinking, setFfxivUnlinking] = useState(false)
```

- [ ] **Load ffxivvenues state in the existing fetch** — inside `fetchSettings()`, after setting Partake state (find where `partakeTeamId` is set from the response), add:

```tsx
setFfxivVenueId(data.ffxivVenueId ?? null)
setFfxivVenueLinkedAt(data.ffxivVenueLinkedAt ?? null)
setFfxivVenueSyncedAt(data.ffxivVenueSyncedAt ?? null)
```

- [ ] **Add helper functions** (before the return):

```tsx
async function handleFfxivPreview() {
  if (!ffxivInput.trim()) return
  setFfxivPreviewLoading(true)
  setFfxivPreviewError(null)
  setFfxivPreview(null)
  try {
    const res = await fetch(`/api/venues/${venue.id}/sync-ffxivvenues?ffxivId=${encodeURIComponent(ffxivInput.trim())}`)
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error ?? "Not found")
    }
    setFfxivPreview(await res.json())
  } catch (e) {
    setFfxivPreviewError(e instanceof Error ? e.message : "Failed to look up venue")
  } finally {
    setFfxivPreviewLoading(false)
  }
}

async function handleFfxivLink() {
  if (!ffxivPreview) return
  setFfxivPreviewLoading(true)
  try {
    const res = await fetch(`/api/venues/${venue.id}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ffxivVenueId: ffxivPreview.id }),
    })
    if (!res.ok) throw new Error("Failed to link")
    const data = await res.json()
    setFfxivVenueId(data.ffxivVenueId)
    setFfxivPreview(null)
    setFfxivInput("")
    // Fire initial sync
    await fetch(`/api/venues/${venue.id}/sync-ffxivvenues`, { method: "POST" })
    setFfxivVenueSyncedAt(new Date().toISOString())
  } catch (e) {
    setFfxivPreviewError(e instanceof Error ? e.message : "Failed to link")
  } finally {
    setFfxivPreviewLoading(false)
  }
}

async function handleFfxivSyncNow() {
  setFfxivSyncing(true)
  try {
    const res = await fetch(`/api/venues/${venue.id}/sync-ffxivvenues`, { method: "POST" })
    if (!res.ok) {
      const err = await res.json()
      if (err.unlinked) { setFfxivVenueId(null); setFfxivVenueSyncedAt(null) }
      return
    }
    setFfxivVenueSyncedAt(new Date().toISOString())
  } finally {
    setFfxivSyncing(false)
  }
}

async function handleFfxivUnlink() {
  if (!confirm("Unlink ffxivvenues.com? The synced schedule will be removed from your profile.")) return
  setFfxivUnlinking(true)
  try {
    await fetch(`/api/venues/${venue.id}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ffxivVenueId: null }),
    })
    setFfxivVenueId(null)
    setFfxivVenueLinkedAt(null)
    setFfxivVenueSyncedAt(null)
  } finally {
    setFfxivUnlinking(false)
  }
}
```

- [ ] **Add the ffxivvenues section in JSX** — add this `<section>` after the Partake section (search for the partake section to find the right location):

```tsx
{/* ── ffxivvenues.com Integration ── */}
<section className="panel">
  <div className="ph">
    <span className="pt">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      ffxivvenues.com
    </span>
    {ffxivVenueId && (
      <span className="text-[0.72rem] text-emerald-400 ml-2">✓ Linked</span>
    )}
  </div>

  <div className="px-5 py-4 space-y-3">
    {ffxivVenueId ? (
      // Connected state
      <>
        <p className="text-[0.82rem] text-[var(--fg-faint)]">
          Schedule synced from your ffxivvenues.com listing every 2 hours.
          {ffxivVenueSyncedAt && (
            <> Last synced: {new Date(ffxivVenueSyncedAt).toLocaleString("en-GB", { timeZone: "UTC" })} ST</>
          )}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleFfxivSyncNow}
            disabled={ffxivSyncing}
            className="text-[0.82rem] text-[var(--xiv-blue)] hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            {ffxivSyncing ? "Syncing…" : "Sync now"}
          </button>
          <span className="text-[var(--fg-faint)]">·</span>
          <button
            type="button"
            onClick={handleFfxivUnlink}
            disabled={ffxivUnlinking}
            className="text-[0.82rem] text-red-400 hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            {ffxivUnlinking ? "Unlinking…" : "Unlink"}
          </button>
        </div>
      </>
    ) : ffxivPreview ? (
      // Confirmation state
      <>
        <p className="text-[0.82rem]">
          Linking to: <span className="font-medium text-[var(--xiv-blue)]">{ffxivPreview.name}</span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleFfxivLink}
            disabled={ffxivPreviewLoading}
            className="xiv-btn-shimmer px-3 py-1.5 text-[0.82rem] rounded-[var(--radius-sm)]"
          >
            {ffxivPreviewLoading ? "Linking…" : "Confirm link"}
          </button>
          <button
            type="button"
            onClick={() => { setFfxivPreview(null); setFfxivPreviewError(null) }}
            className="px-3 py-1.5 text-[0.82rem] text-[var(--fg-faint)] hover:opacity-80"
          >
            Cancel
          </button>
        </div>
      </>
    ) : (
      // Disconnected state
      <>
        <p className="text-[0.82rem] text-[var(--fg-faint)]">
          Link your ffxivvenues.com listing to sync your schedule automatically.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="ffxivvenues.com venue ID"
            value={ffxivInput}
            onChange={e => setFfxivInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleFfxivPreview()}
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleFfxivPreview}
            disabled={ffxivPreviewLoading || !ffxivInput.trim()}
            className="xiv-btn-shimmer px-3 py-1.5 text-[0.82rem] rounded-[var(--radius-sm)] disabled:opacity-40"
          >
            {ffxivPreviewLoading ? "Looking up…" : "Look up"}
          </button>
        </div>
        {ffxivPreviewError && <p className="text-[0.78rem] text-red-400">{ffxivPreviewError}</p>}
        <p className="text-[0.72rem] text-[var(--fg-faint)]">
          Find your venue ID at{" "}
          <a href="https://ffxivvenues.com" target="_blank" rel="noopener noreferrer" className="text-[var(--xiv-blue)]">
            ffxivvenues.com
          </a>
          {" "}— it appears in your listing URL.
        </p>
      </>
    )}
  </div>
</section>
```

- [ ] **TypeScript check:**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Commit:**

```bash
git add "apps/web/app/dashboard/[slug]/settings/page.tsx"
git commit -m "feat: add ffxivvenues.com link/unlink/sync section to venue settings"
```

---

## Task 8: Venue Profile — Synced Schedule Card + Open Now Update

**Files:**
- Modify: `apps/web/app/venues/[slug]/page.tsx`

Read the file first (it was modified in the previous branch — familiarise yourself with the current state before editing).

- [ ] **Add imports** at the top:

```tsx
import { FfxivvenuesScheduleDisplay } from "@/components/ffxivvenues-schedule-display"
import type { FfxivVenueData } from "@/lib/ffxivvenues"
```

- [ ] **Add `venueSchedule` to the Prisma query** — find the `prisma.venue.findUnique` call and add to the `include`:

```ts
venueSchedule: true,
```

- [ ] **Update the Open Now logic** — find where `openFromSchedule` and `isOpen` are defined (added in the previous branch) and update:

```tsx
const openFromSchedule  = isOpenNow(venue.scheduleEntries)
const ffxivIsNow        = !!(venue.venueSchedule?.data as FfxivVenueData | null)?.resolution?.isNow
const isOpen            = !!liveEvent || openFromSchedule || ffxivIsNow
```

- [ ] **Add synced schedule card** — find the `{/* Hours */}` dcard block. Add the ffxivvenues schedule card AFTER the Hours card (as a sibling):

```tsx
{/* ffxivvenues.com synced schedule */}
{venue.venueSchedule && (
  <FfxivvenuesScheduleDisplay
    data={venue.venueSchedule.data as FfxivVenueData}
    syncedAt={venue.venueSchedule.syncedAt}
  />
)}
```

- [ ] **TypeScript check:**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Commit:**

```bash
git add "apps/web/app/venues/[slug]/page.tsx"
git commit -m "feat: show synced ffxivvenues schedule on venue profile with attribution"
```

---

## Task 9: Deploy

- [ ] **Build check on server:**

```bash
ssh server@192.168.1.122 "cd ~/xiv-app && git pull"
~/bin/deploy-xiv-web.sh
```

Expected: build succeeds, container restarts.

- [ ] **Smoke test:**

1. Go to a venue settings page → confirm "ffxivvenues.com" section is visible
2. Enter a valid ffxivvenues.com venue ID → confirm preview shows the venue name
3. Confirm link → confirm "Sync now" button appears
4. Open the venue's public profile → confirm "Schedule" card appears with "Schedule via ffxivvenues.com →" attribution link
5. Unlink → confirm the Schedule card disappears from the profile

- [ ] **Register the cron in QStash** (or update existing scheduler):

URL: `https://xivvenuemanager.com/api/cron/sync-ffxivvenues-schedule`
Schedule: `0 */2 * * *` (every 2 hours)
Method: GET
Header: `authorization: Bearer ${CRON_SECRET}`

---

## Notes

- `VenueSchedule.data` is a Prisma `Json` field — cast to `FfxivVenueData` at the display layer
- ffxivvenues.com venue IDs appear in their listing URLs: `ffxivvenues.com/venue/{id}`
- The cron 400ms sleep gives us ~2.5 calls/10s — safely under their 3/10s limit
- The synced schedule card is additive: venues can have both native entries (Hours card) and synced data (Schedule card)
- Attribution "Schedule via ffxivvenues.com →" is required by ToS §6 wherever their data appears
