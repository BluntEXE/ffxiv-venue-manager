import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Spinner, Button } from 'tamagui'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { getValidToken } from '@/lib/auth'
import { formatST } from '@/lib/server-time'

const API = 'https://xivvenuemanager.com'

type Shift = {
  id: string
  status: 'ACTIVE' | 'SCHEDULED'
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
  membership: { user: { name: string | null; image: string | null } }
}

type Event = {
  id: string
  title: string
  description: string | null
  eventType: string
  status: string
  startTime: string
  endTime: string
}

type VenueDetail = {
  id: string
  name: string
  description: string | null
  dataCenter: string
  world: string
  location: string | null
  logoUrl: string | null
  bannerUrl: string | null
  currencyName: string
  shifts: Shift[]
  events: Event[]
}

export default function VenueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [venue, setVenue] = useState<VenueDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const token = await getValidToken()
        const res = await fetch(`${API}/api/mobile/venues/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Not found')
        setVenue(await res.json())
      } catch (e: any) {
        if (e?.message === 'session_expired' || e?.message === 'not_authenticated') {
          router.replace('/(auth)/login')
          return
        }
        setError('Could not load venue.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$base" alignItems="center" justifyContent="center">
        <Spinner color="$primary" size="large" />
      </YStack>
    )
  }

  if (error || !venue) {
    return (
      <YStack flex={1} backgroundColor="$base" alignItems="center" justifyContent="center" gap="$3">
        <Text color="$danger">{error ?? 'Venue not found.'}</Text>
        <Button size="$3" backgroundColor="$surface0" color="$text" onPress={() => router.back()}>
          Go back
        </Button>
      </YStack>
    )
  }

  const activeShifts = venue.shifts.filter(s => s.status === 'ACTIVE')
  const scheduledShifts = venue.shifts.filter(s => s.status === 'SCHEDULED')

  return (
    <YStack flex={1} backgroundColor="$base">
      <XStack
        padding="$4"
        paddingTop="$6"
        alignItems="center"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor="$surface0"
      >
        <Button
          size="$3"
          backgroundColor="$surface0"
          color="$text"
          borderRadius="$4"
          onPress={() => router.back()}
        >
          ‹ Back
        </Button>
        <Text fontFamily="Outfit_700Bold" fontSize={20} color="$text" flex={1} numberOfLines={1}>
          {venue.name}
        </Text>
      </XStack>

      <ScrollView style={{ flex: 1 }}>
        <YStack padding="$4" gap="$4">
          <YStack gap="$1">
            <Text color="$subtext0" fontSize={13}>{venue.world} · {venue.dataCenter}</Text>
            {venue.location && (
              <Text color="$subtext0" fontSize={13}>📍 {venue.location}</Text>
            )}
            {venue.description && (
              <Text color="$text" fontSize={14} marginTop="$2">{venue.description}</Text>
            )}
          </YStack>

          {activeShifts.length > 0 && (
            <YStack gap="$2">
              <XStack alignItems="center" gap="$2">
                <XStack width={8} height={8} borderRadius="$4" backgroundColor="$success" />
                <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">
                  Open Now
                </Text>
              </XStack>
              {activeShifts.map((s) => (
                <XStack key={s.id} backgroundColor="$surface0" borderRadius="$2" padding="$3" alignItems="center" gap="$2">
                  <Text color="$text" fontSize={14} flex={1}>
                    {s.membership.user.name ?? 'Staff'}
                  </Text>
                  <Text color="$subtext0" fontSize={12}>
                    until {formatST(s.scheduledEnd)} ST
                  </Text>
                </XStack>
              ))}
            </YStack>
          )}

          {scheduledShifts.length > 0 && (
            <YStack gap="$2">
              <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Upcoming Shifts</Text>
              {scheduledShifts.map((s) => (
                <XStack key={s.id} backgroundColor="$surface0" borderRadius="$2" padding="$3" alignItems="center" gap="$2">
                  <Text color="$text" fontSize={14} flex={1}>
                    {s.membership.user.name ?? 'Staff'}
                  </Text>
                  <Text color="$subtext0" fontSize={12}>
                    {formatST(s.scheduledStart)} ST
                  </Text>
                </XStack>
              ))}
            </YStack>
          )}

          {venue.events.length > 0 && (
            <YStack gap="$2">
              <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Events</Text>
              {venue.events.map((e) => (
                <YStack key={e.id} backgroundColor="$surface0" borderRadius="$2" padding="$3" gap="$1">
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

          {activeShifts.length === 0 && scheduledShifts.length === 0 && venue.events.length === 0 && (
            <YStack alignItems="center" padding="$6">
              <Text color="$subtext0" textAlign="center">Nothing scheduled right now.</Text>
            </YStack>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  )
}
