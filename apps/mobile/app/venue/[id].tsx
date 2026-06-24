import { useEffect, useState } from 'react'
import { ScrollView, Image } from 'react-native'
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
          backgroundColor={following ? 'rgba(0,180,255,0.12)' : '$surface0'}
          borderRadius="$4"
          onPress={toggleFollow}
          disabled={followLoading}
          icon={followLoading
            ? <Spinner size="small" color="$primary" />
            : <Ionicons name={following ? 'heart' : 'heart-outline'} size={18} color={following ? '#00b4ff' : '#a6adc8'} />
          }
        />
      </ScreenHeader>

      {!isAuthed && !following && (
        <XStack
          backgroundColor="rgba(0,180,255,0.08)"
          borderBottomWidth={1}
          borderBottomColor="rgba(0,180,255,0.18)"
          padding="$3"
          paddingHorizontal="$4"
          alignItems="center"
          gap="$3"
          pressStyle={{ opacity: 0.85 }}
          onPress={toggleFollow}
        >
          <Ionicons name="heart-outline" size={16} color="#00b4ff" />
          <Text color="$primary" fontSize={13} fontFamily="Inter" flex={1}>
            Sign in with Discord to follow this venue and get notified when it opens.
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#00b4ff" />
        </XStack>
      )}

      <ScrollView style={{ flex: 1 }}>
        {/* Banner + logo header */}
        {(venue.bannerUrl || venue.logoUrl) && (
          <YStack>
            {venue.bannerUrl ? (
              <Image
                source={{ uri: venue.bannerUrl }}
                style={{ width: '100%', height: 140 }}
                resizeMode="cover"
              />
            ) : (
              <YStack height={60} backgroundColor="$surface0" />
            )}
            {venue.logoUrl && (
              <YStack
                position="absolute"
                bottom={-20}
                left={16}
                width={48}
                height={48}
                borderRadius="$2"
                backgroundColor="$surface0"
                borderWidth={2}
                borderColor="$base"
                overflow="hidden"
              >
                <Image source={{ uri: venue.logoUrl }} style={{ width: 48, height: 48 }} resizeMode="cover" />
              </YStack>
            )}
          </YStack>
        )}
        <YStack padding="$4" gap="$4" paddingTop={venue.logoUrl ? '$7' : '$4'}>
          <YStack gap="$1">
            <Text color="$subtext0" fontSize={13}>{venue.world} · {venue.dataCenter}</Text>
            {venue.location && (
              <XStack alignItems="center" gap="$1">
                <Ionicons name="location-outline" size={13} color="#a6adc8" />
                <Text color="$subtext0" fontSize={13}>{venue.location}</Text>
              </XStack>
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
              <XStack backgroundColor="$surface0" borderRadius="$2" padding="$3" alignItems="center" gap="$2" borderWidth={1} borderColor="rgba(0,180,255,0.15)">
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
                  borderWidth={1}
                  borderColor="rgba(0,180,255,0.15)"
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
