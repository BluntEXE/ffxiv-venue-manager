import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Spinner, Button } from 'tamagui'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { ScreenHeader } from '@/components/ScreenHeader'
import { formatST } from '@/lib/server-time'
import { loadTokens, isExpired, getValidToken } from '@/lib/auth'
import { setPendingAction } from '@/lib/pending-action'

const API = 'https://xivvenuemanager.com'

type Shift = {
  id: string
  status: 'ACTIVE' | 'SCHEDULED'
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
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
  const [following, setFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [venueRes] = await Promise.all([
          fetch(`${API}/api/mobile/venues/${id}`),
        ])
        if (!venueRes.ok) throw new Error('Not found')
        setVenue(await venueRes.json())

        const tokens = await loadTokens()
        if (tokens && !isExpired(tokens.expiresAt)) {
          setIsAuthed(true)
          const token = await getValidToken()
          const followRes = await fetch(`${API}/api/mobile/venues/${id}/follow`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (followRes.ok) {
            const data = await followRes.json()
            setFollowing(data.following)
          }
        }
      } catch {
        setError('Could not load venue.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function toggleFollow() {
    if (!isAuthed) {
      await setPendingAction({ type: 'follow_venue', venueId: id!, returnTo: `/venue/${id}` })
      router.push('/(auth)/login')
      return
    }
    setFollowLoading(true)
    try {
      const token = await getValidToken()
      const method = following ? 'DELETE' : 'POST'
      await fetch(`${API}/api/mobile/venues/${id}/follow`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({}) : undefined,
      })
      setFollowing(!following)
    } catch {}
    setFollowLoading(false)
  }

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
      <ScreenHeader>
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
        <Button
          size="$3"
          backgroundColor={following ? '#cba6f720' : '$surface0'}
          borderRadius="$4"
          onPress={toggleFollow}
          disabled={followLoading}
          icon={followLoading
            ? <Spinner size="small" color="$primary" />
            : <Ionicons name={following ? 'heart' : 'heart-outline'} size={18} color={following ? '#cba6f7' : '#a6adc8'} />
          }
        />
      </ScreenHeader>

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
              <XStack backgroundColor="$surface0" borderRadius="$2" padding="$3" alignItems="center" gap="$2">
                <Text color="$text" fontSize={14} flex={1}>
                  {activeShifts.length} staff on shift
                </Text>
                <Text color="$subtext0" fontSize={12}>
                  until {formatST(activeShifts[0].scheduledEnd)} ST
                </Text>
              </XStack>
            </YStack>
          )}

          {scheduledShifts.length > 0 && (
            <YStack gap="$2">
              <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Upcoming</Text>
              {Object.values(
                scheduledShifts.reduce<Record<string, { start: string; end: string; count: number }>>((acc, s) => {
                  const key = `${s.scheduledStart}|${s.scheduledEnd}`
                  if (!acc[key]) acc[key] = { start: s.scheduledStart, end: s.scheduledEnd, count: 0 }
                  acc[key].count++
                  return acc
                }, {})
              ).map((slot) => (
                <XStack
                  key={`${slot.start}|${slot.end}`}
                  backgroundColor="$surface0"
                  borderRadius="$2"
                  padding="$3"
                  alignItems="center"
                  gap="$2"
                >
                  <Text color="$subtext0" fontSize={13} flex={1}>
                    {formatST(slot.start)} – {formatST(slot.end)} ST
                  </Text>
                  <Text color="$subtext0" fontSize={12}>{slot.count} staff</Text>
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
