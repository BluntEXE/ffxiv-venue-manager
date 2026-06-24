# Patron Events Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface upcoming events to patrons on mobile -- a collapsible events feed on the Home tab and richer event cards on the venue detail screen.

**Architecture:** New API endpoint returns the next event per followed venue (7 day window, max 15). Home screen adds a collapsible section matching the existing Open Shifts pattern. Venue detail gets attendee counts added to its API select and renders event type badges + countdown. No new infrastructure -- all data already exists.

**Tech Stack:** Next.js 15 API routes, Prisma, React Native / Tamagui, `expo-secure-store`, existing `requireMobileAuth` / `apiFetch` / `formatST` patterns.

---

## Files

| File | Action |
|------|--------|
| `apps/web/app/api/mobile/my/events-feed/route.ts` | Create — GET events feed |
| `apps/web/app/api/mobile/venues/[venueId]/route.ts` | Modify — add attendee count fields to events select |
| `apps/mobile/app/(app)/home.tsx` | Modify — add events feed section |
| `apps/mobile/app/venue/[id].tsx` | Modify — richer event cards |

---

### Task 1: GET /api/mobile/my/events-feed

**Files:**
- Create: `apps/web/app/api/mobile/my/events-feed/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// apps/web/app/api/mobile/my/events-feed/route.ts
import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Get all followed venue IDs
  const follows = await prisma.venueFollow.findMany({
    where: { userId },
    select: { venueId: true },
  })
  if (follows.length === 0) return NextResponse.json([])

  const venueIds = follows.map((f) => f.venueId)

  // Get all qualifying events in the window
  const events = await prisma.event.findMany({
    where: {
      venueId: { in: venueIds },
      status: { in: ["PUBLISHED", "ACTIVE"] },
      startTime: { gte: now, lte: in7Days },
    },
    select: {
      id: true,
      venueId: true,
      title: true,
      startTime: true,
      endTime: true,
      eventType: true,
      partakeAttendeeCount: true,
      attendanceCount: true,
      venue: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  })

  // One per venue: keep only the first (soonest) event per venueId
  const seen = new Set<string>()
  const feed = events
    .filter((e) => {
      if (seen.has(e.venueId)) return false
      seen.add(e.venueId)
      return true
    })
    .slice(0, 15)

  return NextResponse.json(
    feed.map((e) => ({
      id: e.id,
      venueId: e.venueId,
      venueName: e.venue.name,
      title: e.title,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      eventType: e.eventType,
      partakeAttendeeCount: e.partakeAttendeeCount ?? null,
      attendanceCount: e.attendanceCount ?? null,
    }))
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/web exec tsc --noEmit 2>&1 | grep -v "node_modules" | grep "error" | head -10 || echo "clean"
```

Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/mobile/my/events-feed/route.ts
git commit -m "feat(api): add GET /api/mobile/my/events-feed endpoint"
```

---

### Task 2: Add attendee counts to venue detail events

**Files:**
- Modify: `apps/web/app/api/mobile/venues/[venueId]/route.ts`

The events `select` block currently includes `id, title, description, eventType, status, startTime, endTime`. Add `partakeAttendeeCount` and `attendanceCount`.

- [ ] **Step 1: Find and update the events select**

In `apps/web/app/api/mobile/venues/[venueId]/route.ts`, find:

```typescript
        select: {
          id: true,
          title: true,
          description: true,
          eventType: true,
          status: true,
          startTime: true,
          endTime: true,
        },
```

Replace with:

```typescript
        select: {
          id: true,
          title: true,
          description: true,
          eventType: true,
          status: true,
          startTime: true,
          endTime: true,
          partakeAttendeeCount: true,
          attendanceCount: true,
        },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/web exec tsc --noEmit 2>&1 | grep -v "node_modules" | grep "error" | head -10 || echo "clean"
```

Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/mobile/venues/[venueId]/route.ts"
git commit -m "feat(api): add attendee counts to venue detail events"
```

---

### Task 3: Events feed section on Home tab

**Files:**
- Modify: `apps/mobile/app/(app)/home.tsx`

- [ ] **Step 1: Add FeedEvent type**

Add below the existing `OpenShift` type:

```typescript
type FeedEvent = {
  id: string
  venueId: string
  venueName: string
  title: string
  startTime: string
  endTime: string
  eventType: string
  partakeAttendeeCount: number | null
  attendanceCount: number | null
}
```

- [ ] **Step 2: Add helper for event type badge**

Add above the `HomeScreen` export (alongside the existing `canClockIn` function):

```typescript
const EVENT_TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  PERFORMANCE: { bg: 'rgba(203,166,247,0.15)', color: '#cba6f7' },
  GAME_NIGHT:  { bg: 'rgba(137,180,250,0.15)', color: '#89b4fa' },
  SPECIAL:     { bg: 'rgba(249,226,175,0.15)', color: '#f9e2af' },
  SOCIAL:      { bg: 'rgba(166,227,161,0.15)', color: '#a6e3a1' },
  PRIVATE:     { bg: 'rgba(108,112,134,0.15)', color: '#6c7086' },
  OTHER:       { bg: 'rgba(166,173,200,0.15)', color: '#a6adc8' },
}

function eventTypeBadge(type: string) {
  return EVENT_TYPE_STYLES[type] ?? EVENT_TYPE_STYLES.OTHER
}

function attendeeCount(e: FeedEvent): number | null {
  return e.partakeAttendeeCount ?? e.attendanceCount ?? null
}
```

- [ ] **Step 3: Add state variables**

Add alongside the existing state declarations in `HomeScreen`:

```typescript
const [eventsFeed, setEventsFeed] = useState<FeedEvent[]>([])
const [eventsExpanded, setEventsExpanded] = useState(true)
```

- [ ] **Step 4: Load persisted collapse state**

Add a second `useEffect` after the existing SecureStore one:

```typescript
useEffect(() => {
  SecureStore.getItemAsync('@xivvm/eventsFeedExpanded').then(val => {
    if (val !== null) setEventsExpanded(val === 'true')
  })
}, [])
```

- [ ] **Step 5: Add toggle function**

Add alongside `toggleOpenShifts`:

```typescript
function toggleEvents() {
  const next = !eventsExpanded
  setEventsExpanded(next)
  SecureStore.setItemAsync('@xivvm/eventsFeedExpanded', String(next))
}
```

- [ ] **Step 6: Extend loadShifts to fetch events feed**

Find the existing `loadShifts` function with its `Promise.all`. Extend to include the events feed:

```typescript
async function loadShifts(isRefresh = false) {
  if (!isRefresh) setShiftsLoading(true)
  setClaimErrors({})
  try {
    const [shiftsRes, followsRes, openShiftsRes, eventsRes] = await Promise.all([
      apiFetch('/api/mobile/my/shifts'),
      apiFetch('/api/mobile/my/follows'),
      apiFetch('/api/mobile/my/open-shifts'),
      apiFetch('/api/mobile/my/events-feed'),
    ])
    if (shiftsRes.ok) setShifts(await shiftsRes.json())
    if (followsRes.ok) setFollows(await followsRes.json())
    if (openShiftsRes.ok) setOpenShifts(await openShiftsRes.json())
    if (eventsRes.ok) setEventsFeed(await eventsRes.json())
  } catch {}
  setShiftsLoading(false)
  setRefreshing(false)
}
```

- [ ] **Step 7: Render the events feed section**

In the JSX, find the `openShifts.length > 0` block and add the events section DIRECTLY ABOVE it:

```tsx
{eventsFeed.length > 0 && (
  <YStack gap="$2" marginTop="$2">
    <XStack alignItems="center" justifyContent="space-between">
      <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Upcoming Events</Text>
      <Button chromeless size="$2" onPress={toggleEvents} paddingHorizontal="$1">
        <Ionicons name={eventsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#a6adc8" />
      </Button>
    </XStack>
    {eventsExpanded && eventsFeed.map((e) => {
      const badge = eventTypeBadge(e.eventType)
      const count = attendeeCount(e)
      return (
        <XStack
          key={e.id}
          backgroundColor="$surface0"
          borderRadius="$2"
          padding="$3"
          alignItems="center"
          gap="$3"
          borderWidth={1}
          borderColor="rgba(0,180,255,0.15)"
          pressStyle={{ opacity: 0.85 }}
          onPress={() => router.push(`/venue/${e.venueId}` as any)}
        >
          <YStack flex={1} gap="$1">
            <Text color="$subtext0" fontSize={11}>{e.venueName}</Text>
            <Text color="$text" fontSize={14} fontFamily="Outfit_600SemiBold" numberOfLines={1}>
              {e.title}
            </Text>
            <XStack gap="$2" alignItems="center" marginTop="$1">
              <Text color="$subtext0" fontSize={12}>
                {formatST(e.startTime, 'datetime')} ST
              </Text>
              <XStack
                backgroundColor={badge.bg}
                borderRadius="$4"
                paddingHorizontal="$2"
                paddingVertical={2}
              >
                <Text fontSize={10} style={{ color: badge.color }}>
                  {e.eventType.replace('_', ' ')}
                </Text>
              </XStack>
              {count != null && (
                <Text fontSize={11} color="$subtext0">{count} attending</Text>
              )}
            </XStack>
          </YStack>
          <Ionicons name="chevron-forward" size={14} color="#6c7086" />
        </XStack>
      )
    })}
  </YStack>
)}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/mobile exec tsc --noEmit 2>&1 | grep -v "node_modules\|WARN\|vector-icons\|process\|TamaguiCustomConfig\|TamaguiInternalConfig\|defaultConfig\|_layout" | grep "error" | head -10 || echo "clean"
```

Expected: `clean`

- [ ] **Step 9: Sync corpus and commit**

```bash
cp "/home/ehno/xiv-app/apps/mobile/app/(app)/home.tsx" \
   "/home/ehno/xiv-graphify-corpus/mobile/app/(app)/home.tsx"
git add "apps/mobile/app/(app)/home.tsx"
git commit -m "feat(mobile): add collapsible Upcoming Events feed to Home tab"
```

---

### Task 4: Richer event cards on venue detail

**Files:**
- Modify: `apps/mobile/app/venue/[id].tsx`

- [ ] **Step 1: Add attendee fields to Event type and add helpers**

Find the existing `Event` type:

```typescript
type Event = {
  id: string
  title: string
  description: string | null
  eventType: string
  status: string
  startTime: string
  endTime: string
}
```

Replace with:

```typescript
type Event = {
  id: string
  title: string
  description: string | null
  eventType: string
  status: string
  startTime: string
  endTime: string
  partakeAttendeeCount: number | null
  attendanceCount: number | null
}

const EVENT_TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  PERFORMANCE: { bg: 'rgba(203,166,247,0.15)', color: '#cba6f7' },
  GAME_NIGHT:  { bg: 'rgba(137,180,250,0.15)', color: '#89b4fa' },
  SPECIAL:     { bg: 'rgba(249,226,175,0.15)', color: '#f9e2af' },
  SOCIAL:      { bg: 'rgba(166,227,161,0.15)', color: '#a6e3a1' },
  PRIVATE:     { bg: 'rgba(108,112,134,0.15)', color: '#6c7086' },
  OTHER:       { bg: 'rgba(166,173,200,0.15)', color: '#a6adc8' },
}

function getCountdown(startTime: string): string | null {
  const ms = new Date(startTime).getTime() - Date.now()
  if (ms <= 0 || ms > 24 * 60 * 60 * 1000) return null
  const h = Math.floor(ms / (60 * 60 * 1000))
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  return h > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${m}m`
}
```

- [ ] **Step 2: Replace the events render block**

Find the existing events block:

```tsx
{venue.events.length > 0 && (
  <YStack gap="$2">
    <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Events</Text>
    {venue.events.map((e) => (
      <YStack key={e.id} backgroundColor="$surface0" borderRadius="$2" padding="$3" gap="$1" borderWidth={1} borderColor="rgba(0,180,255,0.15)">
        <Text color="$text" fontSize={14} fontWeight="bold">{e.title}</Text>
        <Text color="$subtext0" fontSize={12}>
          {formatST(e.startTime, 'datetime')} ST
        </Text>
        {e.description && (
          <Text color="$subtext0" fontSize={13} numberOfLines={3}>{e.description}</Text>
        )}
      </YStack>
    ))}
  </YStack>
)}
```

Replace with:

```tsx
{venue.events.length > 0 && (
  <YStack gap="$2">
    <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Events</Text>
    {venue.events.map((e) => {
      const badge = EVENT_TYPE_STYLES[e.eventType] ?? EVENT_TYPE_STYLES.OTHER
      const count = e.partakeAttendeeCount ?? e.attendanceCount ?? null
      const countdown = getCountdown(e.startTime)
      return (
        <YStack key={e.id} backgroundColor="$surface0" borderRadius="$2" padding="$3" gap="$1" borderWidth={1} borderColor="rgba(0,180,255,0.15)">
          <XStack alignItems="center" justifyContent="space-between">
            <Text color="$text" fontSize={14} fontFamily="Outfit_600SemiBold" flex={1} numberOfLines={1}>
              {e.title}
            </Text>
            <XStack
              backgroundColor={badge.bg}
              borderRadius="$4"
              paddingHorizontal="$2"
              paddingVertical={2}
              marginLeft="$2"
            >
              <Text fontSize={10} style={{ color: badge.color }}>
                {e.eventType.replace('_', ' ')}
              </Text>
            </XStack>
          </XStack>
          <XStack gap="$3" alignItems="center">
            <Text color="$subtext0" fontSize={12}>
              {formatST(e.startTime, 'datetime')} ST
            </Text>
            {countdown && (
              <Text color="$primary" fontSize={11}>{countdown}</Text>
            )}
            {count != null && (
              <Text color="$subtext0" fontSize={11}>{count} attending</Text>
            )}
          </XStack>
          {e.description && (
            <Text color="$subtext0" fontSize={13} numberOfLines={3}>{e.description}</Text>
          )}
        </YStack>
      )
    })}
  </YStack>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/mobile exec tsc --noEmit 2>&1 | grep -v "node_modules\|WARN\|vector-icons\|process\|TamaguiCustomConfig\|TamaguiInternalConfig\|defaultConfig\|_layout" | grep "error" | head -10 || echo "clean"
```

Expected: `clean`

- [ ] **Step 4: Sync corpus and commit**

```bash
cp "/home/ehno/xiv-app/apps/mobile/app/venue/[id].tsx" \
   "/home/ehno/xiv-graphify-corpus/mobile/app/venue/[id].tsx"
git add "apps/mobile/app/venue/[id].tsx"
git commit -m "feat(mobile): richer event cards on venue detail (badge, countdown, attendees)"
```

---

### Task 5: Deploy web + trigger EAS build

- [ ] **Step 1: Push and deploy web**

```bash
git push && ssh server@192.168.1.122 "cd ~/xiv-app && git pull && docker compose build venue-manager && docker compose up -d venue-manager"
```

- [ ] **Step 2: Trigger mobile build**

Run in your terminal:
```
! cd ~/xiv-app/apps/mobile && eas build --platform android --profile preview
```
