import { useState, useCallback, useRef, useEffect } from 'react'
import { FlashList } from '@shopify/flash-list'
import { RefreshControl, TextInput, ScrollView, StyleSheet, Image } from 'react-native'
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
  staffOnShift?: number | null
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
  const url = dc
    ? `${API}/api/mobile/discover/all?dc=${encodeURIComponent(dc)}`
    : `${API}/api/mobile/discover/all`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

function VenueRow({ venue, tab, onPress }: { venue: Venue; tab: Tab; onPress: () => void }) {
  const isAll = tab === 'all'
  const isOpen = isAll ? venue.openSince != null : tab === 'open'
  const isTonight = isAll ? venue.nextOpen != null : tab === 'tonight'

  const staff = isOpen ? venue.staffOnShift : venue.staffScheduled

  let timeStr: string
  let badgeBg: string
  let badgeColor: '$success' | '$info' | '$overlay'

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
        overflow="hidden"
      >
        {venue.logoUrl ? (
          <Image
            source={{ uri: venue.logoUrl }}
            style={{ width: 44, height: 44, borderRadius: 8 }}
            resizeMode="cover"
            accessibilityLabel={`${venue.name} logo`}
          />
        ) : (
          <Ionicons name="storefront-outline" size={22} color="#a6adc8" />
        )}
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
            <Text fontSize={11} color="$subtext0">{timeStr}</Text>
          )}
          {staff != null && staff > 0 && (
            <Text fontSize={11} color="$subtext0">{staff} staff</Text>
          )}
        </XStack>
      </YStack>

      <Text color="$subtext0" fontSize={18}>›</Text>
    </XStack>
  )
}

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

  useEffect(() => {
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [])

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
    // useFocusEffect picks up tab + selectedDC changes and fetches
  }

  function switchDC(dc: string | null) {
    setSelectedDC(dc)
    // useFocusEffect picks up selectedDC change and fetches
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
                {([null, ...DATA_CENTRES] as Array<string | null>).map((dc) => {
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
          icon={tab === 'all' ? 'search-outline' : 'moon-outline'}
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
