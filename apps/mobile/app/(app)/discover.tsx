import { useState, useCallback } from 'react'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Spinner, Button } from 'tamagui'
import { useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { ScreenTop } from '@/components/ScreenContainer'
// No auth import needed — discover is public
import { formatST, formatOpenSince, formatUntil } from '@/lib/server-time'

const API = 'https://xivvenuemanager.com'

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

type Tab = 'open' | 'tonight'

async function fetchVenues(tab: Tab): Promise<Venue[]> {
  const path = tab === 'open' ? 'open-now' : 'tonight'
  const res = await fetch(`${API}/api/mobile/discover/${path}`)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

function VenueRow({ venue, tab, onPress }: { venue: Venue; tab: Tab; onPress: () => void }) {
  const staff = tab === 'open' ? venue.staffOnShift : venue.staffScheduled
  const timeStr = tab === 'open'
    ? (venue.openSince ? `Open ${formatOpenSince(venue.openSince)}` : 'Open now')
    : (venue.nextOpen ? `Opens ${formatUntil(venue.nextOpen)} · ${formatST(venue.nextOpen)}` : 'Tonight')

  return (
    <XStack
      backgroundColor="$surface0"
      borderRadius="$3"
      padding="$4"
      marginHorizontal="$4"
      marginBottom="$3"
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
        <Text fontSize={20}>🏠</Text>
      </YStack>

      <YStack flex={1} gap="$1">
        <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text" numberOfLines={1}>
          {venue.name}
        </Text>
        <Text fontSize={12} color="$subtext0">
          {venue.world} · {venue.dataCenter}
        </Text>
        <XStack gap="$2" alignItems="center" marginTop="$1">
          <XStack
            backgroundColor={tab === 'open' ? '#a6e3a120' : '#89b4fa20'}
            borderRadius="$4"
            paddingHorizontal="$2"
            paddingVertical={2}
          >
            <Text fontSize={11} color={tab === 'open' ? '$success' : '$info'}>
              {timeStr}
            </Text>
          </XStack>
          {staff != null && staff > 0 && (
            <Text fontSize={11} color="$subtext0">{staff} staff</Text>
          )}
        </XStack>
      </YStack>

      <Text color="$overlay" fontSize={18}>›</Text>
    </XStack>
  )
}

export default function DiscoverScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('open')
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (t: Tab) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchVenues(t)
      setVenues(data)
    } catch {
      setError('Could not load venues. Try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load(tab) }, [tab, load]))

  function switchTab(t: Tab) {
    setTab(t)
    load(t)
  }

  return (
    <YStack flex={1} backgroundColor="$base">
      <ScreenTop gap="$3">
        <Text fontFamily="Outfit_700Bold" fontSize={24} color="$text">Discover</Text>

        <XStack gap="$2">
          {(['open', 'tonight'] as Tab[]).map((t) => (
            <Button
              key={t}
              size="$3"
              borderRadius="$4"
              backgroundColor={tab === t ? '$primary' : '$surface0'}
              color={tab === t ? '$base' : '$subtext0'}
              onPress={() => switchTab(t)}
              pressStyle={{ opacity: 0.85 }}
            >
              {t === 'open' ? 'Open Now' : 'Tonight'}
            </Button>
          ))}
        </XStack>
      </ScreenTop>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner color="$primary" size="large" />
        </YStack>
      ) : error ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3" padding="$6">
          <Text color="$danger" textAlign="center">{error}</Text>
          <Button size="$3" backgroundColor="$surface0" color="$text" onPress={() => load(tab)}>
            Retry
          </Button>
        </YStack>
      ) : venues.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$2" padding="$6">
          <Text fontSize={32}>🌙</Text>
          <Text color="$subtext0" textAlign="center">
            {tab === 'open' ? 'No venues open right now.' : 'No venues scheduled for tonight.'}
          </Text>
        </YStack>
      ) : (
        <FlashList
          data={venues}
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
        />
      )}
    </YStack>
  )
}
