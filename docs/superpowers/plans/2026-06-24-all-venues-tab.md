# All Venues Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "All" tab to the mobile Discover screen showing every active venue with name search and DC chip filtering.

**Architecture:** New API route returns all active venues with their today-shift status (open/tonight/neither), sorted open-first. Client adds `'all'` to the Tab type, renders a search input + scrollable DC chips when active, and filters the fetched list client-side by name.

**Tech Stack:** Next.js 15 API route (Prisma), React Native / Tamagui, Expo Router, TypeScript.

---

## Files

| File | Action |
|------|--------|
| `apps/web/app/api/mobile/discover/all/route.ts` | Create — new API endpoint |
| `apps/mobile/app/(app)/discover.tsx` | Modify — add All tab, search, DC chips |

---

### Task 1: API route — all venues with shift status

**Files:**
- Create: `apps/web/app/api/mobile/discover/all/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// apps/web/app/api/mobile/discover/all/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const dc = req.nextUrl.searchParams.get("dc") ?? undefined
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      ...(dc ? { dataCenter: dc } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      dataCenter: true,
      world: true,
      location: true,
      logoUrl: true,
      shifts: {
        where: {
          OR: [
            {
              status: "ACTIVE",
              scheduledStart: { lte: now },
              scheduledEnd: { gte: now },
            },
            {
              status: "SCHEDULED",
              scheduledStart: { gt: now, lte: endOfDay },
            },
          ],
        },
        select: {
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
        },
      },
      _count: {
        select: {
          shifts: {
            where: {
              status: "ACTIVE",
              scheduledStart: { lte: now },
              scheduledEnd: { gte: now },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  })

  const mapped = venues.map((v) => {
    const activeShift = v.shifts.find((s) => s.status === "ACTIVE")
    const tonightShift = v.shifts.find((s) => s.status === "SCHEDULED")
    return {
      id: v.id,
      name: v.name,
      slug: v.slug,
      dataCenter: v.dataCenter,
      world: v.world,
      location: v.location,
      logoUrl: v.logoUrl,
      openSince: activeShift
        ? (activeShift.actualStart ?? activeShift.scheduledStart)
        : null,
      scheduledEnd:
        activeShift?.scheduledEnd ?? tonightShift?.scheduledEnd ?? null,
      staffOnShift: activeShift ? v._count.shifts : undefined,
      nextOpen: tonightShift?.scheduledStart ?? null,
    }
  })

  // Sort: open now first, tonight next, alphabetical last
  mapped.sort((a, b) => {
    const aOpen = a.openSince != null
    const bOpen = b.openSince != null
    const aTonight = a.nextOpen != null
    const bTonight = b.nextOpen != null
    if (aOpen && !bOpen) return -1
    if (!aOpen && bOpen) return 1
    if (aTonight && !bTonight) return -1
    if (!aTonight && bTonight) return 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json(mapped)
}
```

- [ ] **Step 2: Smoke-test the endpoint locally**

```bash
# From ~/xiv-app, start the web dev server if not running
cd apps/web && pnpm dev &
# Then test
curl -s "http://localhost:3000/api/mobile/discover/all" | python3 -m json.tool | head -40
curl -s "http://localhost:3000/api/mobile/discover/all?dc=Crystal" | python3 -m json.tool | head -20
```

Expected: JSON array. First items have `openSince` set (if any venues are open). `?dc=Crystal` returns only Crystal venues.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/mobile/discover/all/route.ts
git commit -m "feat(api): add /api/mobile/discover/all endpoint with DC filter"
```

---

### Task 2: Update discover.tsx — All tab with search + DC chips

**Files:**
- Modify: `apps/mobile/app/(app)/discover.tsx`

- [ ] **Step 1: Add `'all'` to Tab type and define DC constants**

Replace the top of the file (imports + constants through the `Tab` type and `fetchVenues` function):

```typescript
import { useState, useCallback, useEffect, useRef } from 'react'
import { FlashList } from '@shopify/flash-list'
import { RefreshControl, TextInput, ScrollView, StyleSheet } from 'react-native'
import { YStack, XStack, Text, Button } from 'tamagui'
import { useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { ScreenTop } from '@/components/ScreenContainer'
import { VenueSkeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { formatST, formatOpenSince, formatUntil } from '@/lib/server-time'

const API = 'https://xivvenuemanager.com'

const DATA_CENTRES = [
  'Aether', 'Crystal', 'Primal', 'Dynamis',
  'Chaos', 'Light',
  'Materia',
  'Elemental', 'Gaia', 'Mana', 'Meteor',
]

type Venue = {
  id: string
  name: string
  dataCenter: string
  world: string
  location: string | null
  logoUrl: string | null
  staffOnShift?: number
  staffScheduled?: number
  openSince?: string | null
  nextOpen?: string | null
  scheduledEnd?: string | null
}

type Tab = 'open' | 'tonight' | 'all'

async function fetchVenues(tab: Tab, dc?: string): Promise<Venue[]> {
  if (tab === 'open') {
    const res = await fetch(`${API}/api/mobile/discover/open-now`)
    if (!res.ok) throw new Error('Failed to fetch')
    return res.json()
  }
  if (tab === 'tonight') {
    const res = await fetch(`${API}/api/mobile/discover/tonight`)
    if (!res.ok) throw new Error('Failed to fetch')
    return res.json()
  }
  // tab === 'all'
  const url = dc
    ? `${API}/api/mobile/discover/all?dc=${encodeURIComponent(dc)}`
    : `${API}/api/mobile/discover/all`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}
```

- [ ] **Step 2: Update VenueRow to handle the 'all' tab**

Replace the `VenueRow` function:

```typescript
function VenueRow({ venue, tab, onPress }: { venue: Venue; tab: Tab; onPress: () => void }) {
  const isAll = tab === 'all'
  const isOpen = isAll ? venue.openSince != null : tab === 'open'
  const isTonight = isAll ? venue.nextOpen != null : tab === 'tonight'

  const staff = isOpen ? venue.staffOnShift : venue.staffScheduled

  let timeStr: string
  let badgeBg: string
  let badgeColor: string

  if (isOpen) {
    timeStr = venue.openSince ? `Open ${formatOpenSince(venue.openSince)}` : 'Open now'
    badgeBg = '#a6e3a120'
    badgeColor = '$success'
  } else if (isTonight) {
    timeStr = venue.nextOpen
      ? `Opens ${formatUntil(venue.nextOpen)} · ${formatST(venue.nextOpen)}`
      : 'Tonight'
    badgeBg = '#89b4fa20'
    badgeColor = '$info'
  } else {
    timeStr = 'No shifts scheduled'
    badgeBg = 'transparent'
    badgeColor = '$overlay'
  }

  return (
    <XStack
      backgroundColor="$surface0"
      borderRadius="$3"
      padding="$4"
      marginHorizontal="$4"
      marginBottom="$3"
      borderWidth={1}
      borderColor="rgba(0,180,255,0.15)"
      pressStyle={{ opacity: 0.85 }}
      onPress={onPress}
      alignItems="center"
      gap="$3"
    >
      <YStack
        width={44}
        height={44}
        borderRadius="$2"
        backgroundColor="$surface1"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        <Ionicons name="storefront-outline" size={22} color="#a6adc8" />
      </YStack>

      <YStack flex={1} gap="$1">
        <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text" numberOfLines={1}>
          {venue.name}
        </Text>
        <Text fontSize={12} color="$subtext0">
          {venue.world} · {venue.dataCenter}
        </Text>
        <XStack gap="$2" alignItems="center" marginTop="$1">
          {(isOpen || isTonight) ? (
            <XStack
              backgroundColor={badgeBg}
              borderRadius="$4"
              paddingHorizontal="$2"
              paddingVertical={2}
            >
              <Text fontSize={11} color={badgeColor}>{timeStr}</Text>
            </XStack>
          ) : (
            <Text fontSize={11} color="$overlay">{timeStr}</Text>
          )}
          {staff != null && staff > 0 && (
            <Text fontSize={11} color="$subtext0">{staff} staff</Text>
          )}
        </XStack>
      </YStack>

      <Text color="$overlay" fontSize={18}>›</Text>
    </XStack>
  )
}
```

- [ ] **Step 3: Update DiscoverScreen state and load logic**

Replace the `DiscoverScreen` component:

```typescript
export default function DiscoverScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('open')
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDC, setSelectedDC] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onSearchChange(text: string) {
    setSearch(text)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(text), 300)
  }

  const load = useCallback(async (t: Tab, dc: string | null = null, isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    setError(null)
    try {
      const data = await fetchVenues(t, dc ?? undefined)
      setVenues(data)
    } catch {
      setError('Could not load venues. Try again.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load(tab, selectedDC) }, [tab, selectedDC, load]))

  function switchTab(t: Tab) {
    setTab(t)
    setSearch('')
    setDebouncedSearch('')
    setSelectedDC(null)
    load(t, null)
  }

  function switchDC(dc: string | null) {
    setSelectedDC(dc)
    load(tab, dc)
  }

  function onRefresh() {
    setRefreshing(true)
    setSearch('')
    setDebouncedSearch('')
    load(tab, selectedDC, true)
  }

  const displayedVenues = tab === 'all' && debouncedSearch.trim()
    ? venues.filter(v => v.name.toLowerCase().includes(debouncedSearch.toLowerCase().trim()))
    : venues

  const tabLabel: Record<Tab, string> = {
    open: 'Open Now',
    tonight: 'Tonight',
    all: 'All',
  }

  const emptyTitle: Record<Tab, string> = {
    open: 'No venues open right now',
    tonight: 'Nothing scheduled tonight',
    all: 'No venues found',
  }

  const emptySubtitle: Record<Tab, string> = {
    open: 'Check back later or browse Tonight.',
    tonight: 'No shifts scheduled for the rest of today.',
    all: debouncedSearch || selectedDC
      ? 'Try a different name or data centre.'
      : 'No active venues.',
  }

  return (
    <YStack flex={1} backgroundColor="$base">
      <ScreenTop gap="$3">
        <Text fontFamily="Outfit_700Bold" fontSize={24} color="$text">Discover</Text>

        {/* Tab pills */}
        <XStack
          backgroundColor="rgba(0,180,255,0.06)"
          borderWidth={1}
          borderColor="rgba(0,180,255,0.12)"
          borderRadius="$4"
          padding="$1"
          gap="$1"
        >
          {(['open', 'tonight', 'all'] as Tab[]).map((t) => (
            <Button
              key={t}
              size="$3"
              borderRadius="$3"
              backgroundColor={tab === t ? 'rgba(0,180,255,0.12)' : 'transparent'}
              color={tab === t ? '$primary' : '$subtext0'}
              borderWidth={1}
              borderColor={tab === t ? 'rgba(0,180,255,0.3)' : 'transparent'}
              onPress={() => switchTab(t)}
              pressStyle={{ opacity: 0.85 }}
            >
              {tabLabel[t]}
            </Button>
          ))}
        </XStack>

        {/* All tab: search + DC chips */}
        {tab === 'all' && (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="Search venues by name..."
              placeholderTextColor="#6c7086"
              value={search}
              onChangeText={onSearchChange}
              clearButtonMode="while-editing"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <XStack gap="$2" paddingBottom="$1">
                {[null, ...DATA_CENTRES].map((dc) => {
                  const active = selectedDC === dc
                  const label = dc ?? 'All DCs'
                  return (
                    <Button
                      key={label}
                      size="$2"
                      borderRadius="$4"
                      backgroundColor={active ? 'rgba(0,180,255,0.12)' : 'transparent'}
                      color={active ? '$primary' : '$subtext0'}
                      borderWidth={1}
                      borderColor={active ? 'rgba(0,180,255,0.3)' : 'rgba(0,180,255,0.12)'}
                      onPress={() => switchDC(dc)}
                      pressStyle={{ opacity: 0.85 }}
                    >
                      {label}
                    </Button>
                  )
                })}
              </XStack>
            </ScrollView>
          </>
        )}
      </ScreenTop>

      {loading ? (
        <YStack flex={1} paddingTop="$2">
          {[1,2,3,4].map((i) => <VenueSkeleton key={i} />)}
        </YStack>
      ) : error ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load venues"
          subtitle={error}
        />
      ) : displayedVenues.length === 0 ? (
        <EmptyState
          icon={tab === 'open' ? 'moon-outline' : tab === 'tonight' ? 'moon-outline' : 'search-outline'}
          title={emptyTitle[tab]}
          subtitle={emptySubtitle[tab]}
        />
      ) : (
        <FlashList
          data={displayedVenues}
          estimatedItemSize={88}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => (
            <VenueRow
              venue={item}
              tab={tab}
              onPress={() => router.push(`/venue/${item.id}` as any)}
            />
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#00b4ff"
              colors={['#00b4ff']}
              progressBackgroundColor="#0a0f1e"
            />
          }
        />
      )}
    </YStack>
  )
}

const styles = StyleSheet.create({
  searchInput: {
    backgroundColor: '#0a0f1e',
    borderWidth: 1,
    borderColor: 'rgba(0,180,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#cdd6f4',
    fontFamily: 'Inter',
  },
})
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/mobile exec tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(app\)/discover.tsx
git commit -m "feat(mobile): add All tab to Discover with name search and DC filter"
```

---

### Task 3: Sync corpus and push

**Files:**
- Modify: `apps/mobile/app/(app)/discover.tsx` → copy to corpus

- [ ] **Step 1: Sync updated file to corpus**

```bash
cp "/home/ehno/xiv-app/apps/mobile/app/(app)/discover.tsx" \
   "/home/ehno/xiv-graphify-corpus/mobile/app/(app)/discover.tsx"
```

- [ ] **Step 2: Push to remote**

```bash
git push
```

Expected: branch updates on GitHub with both commits.
