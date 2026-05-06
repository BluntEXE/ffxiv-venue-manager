import { useState, useCallback } from 'react'
import { ScrollView, RefreshControl } from 'react-native'
import { YStack, XStack, Text, Spinner, Button } from 'tamagui'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { ScreenTop } from '@/components/ScreenContainer'
import { EmptyState } from '@/components/EmptyState'
import { loadTokens, isExpired } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { formatST, formatUntil, formatOpenSince } from '@/lib/server-time'

type ManagedVenue = {
  id: string
  name: string
  logoUrl: string | null
  dataCenter: string
  world: string
  role: 'OWNER' | 'MANAGER'
}

type Event = {
  id: string
  title: string
  eventType: string
  status: string
  startTime: string
  endTime: string
  attendanceCount: number | null
  partakeAttendeeCount: number | null
}

type Shift = {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
  membership: { user: { name: string | null; image: string | null }; role: string }
}

type Dashboard = {
  events: Event[]
  shifts: Shift[]
  summary: { totalEvents: number; activeShifts: number; scheduledShifts: number; totalStaff: number }
}

export default function ManageScreen() {
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [venues, setVenues] = useState<ManagedVenue[]>([])
  const [selectedVenue, setSelectedVenue] = useState<ManagedVenue | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [dashLoading, setDashLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadVenues = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const tokens = await loadTokens()
      if (!tokens || isExpired(tokens.expiresAt)) { setAuthed(false); return }
      setAuthed(true)
      const res = await apiFetch('/api/mobile/operator/venues')
      if (!res.ok) throw new Error('fetch failed')
      const data: ManagedVenue[] = await res.json()
      setVenues(data)
      if (data.length > 0) loadDashboard(data[0], true)
    } catch {
      setError('Could not load venues.')
    } finally {
      setLoading(false)
    }
  }, [])

  async function loadDashboard(venue: ManagedVenue, initial = false) {
    if (!initial) setDashLoading(true)
    setSelectedVenue(venue)
    try {
      const res = await apiFetch(`/api/mobile/operator/venues/${venue.id}/dashboard`)
      if (!res.ok) throw new Error('fetch failed')
      setDashboard(await res.json())
    } catch {
      setDashboard(null)
    } finally {
      setDashLoading(false)
    }
  }

  useFocusEffect(useCallback(() => { loadVenues() }, [loadVenues]))

  function onRefresh() {
    setRefreshing(true)
    if (selectedVenue) {
      loadDashboard(selectedVenue).finally(() => setRefreshing(false))
    } else {
      loadVenues().finally(() => setRefreshing(false))
    }
  }

  if (authed === false) {
    return (
      <YStack flex={1} backgroundColor="$base" alignItems="center" justifyContent="center" gap="$4" padding="$6">
        <Text fontFamily="Outfit_700Bold" fontSize={24} color="$text">Manage</Text>
        <Text color="$subtext0" textAlign="center">Sign in to manage your venues.</Text>
      </YStack>
    )
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$base" alignItems="center" justifyContent="center">
        <Spinner color="$primary" size="large" />
      </YStack>
    )
  }

  if (venues.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$base">
        <EmptyState
          icon="business-outline"
          title="No venues to manage"
          subtitle="You're not listed as owner or manager of any venue yet."
        />
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor="$base">
      <ScreenTop gap="$3">
        <Text fontFamily="Outfit_700Bold" fontSize={24} color="$text">Manage</Text>

        {venues.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <XStack gap="$2">
              {venues.map((v) => (
                <Button
                  key={v.id}
                  size="$3"
                  borderRadius="$4"
                  backgroundColor={selectedVenue?.id === v.id ? '$primary' : '$surface0'}
                  color={selectedVenue?.id === v.id ? '$base' : '$subtext0'}
                  onPress={() => loadDashboard(v)}
                >
                  {v.name}
                </Button>
              ))}
            </XStack>
          </ScrollView>
        )}
      </ScreenTop>

      {dashLoading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner color="$primary" />
        </YStack>
      ) : dashboard ? (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#cba6f7"
              colors={['#cba6f7']}
            />
          }
        >
          <YStack padding="$4" gap="$4" paddingBottom={32}>
            {/* Summary row */}
            <XStack gap="$3">
              {[
                { label: 'Events', value: dashboard.summary.totalEvents, color: '$info' },
                { label: 'On shift', value: dashboard.summary.activeShifts, color: '$success' },
                { label: 'Scheduled', value: dashboard.summary.scheduledShifts, color: '$primary' },
              ].map((s) => (
                <YStack key={s.label} flex={1} backgroundColor="$surface0" borderRadius="$3" padding="$3" alignItems="center" gap="$1">
                  <Text fontSize={24} fontFamily="Outfit_700Bold" color={s.color}>{s.value}</Text>
                  <Text fontSize={11} color="$subtext0">{s.label}</Text>
                </YStack>
              ))}
            </XStack>

            {/* Events section */}
            <YStack gap="$2">
              <XStack alignItems="center" justifyContent="space-between">
                <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Today's Events</Text>
                <Button
                  size="$2"
                  backgroundColor="$primary"
                  color="$base"
                  borderRadius="$3"
                  onPress={() => router.push({ pathname: '/event/new', params: { venueId: selectedVenue!.id } } as any)}
                >
                  + New
                </Button>
              </XStack>

              {dashboard.events.length === 0 ? (
                <XStack alignItems="center" gap="$2" paddingVertical="$2">
                <Ionicons name="calendar-outline" size={16} color="#6c7086" />
                <Text color="$overlay" fontSize={13}>No events today</Text>
              </XStack>
              ) : (
                dashboard.events.map((e) => (
                  <XStack
                    key={e.id}
                    backgroundColor="$surface0"
                    borderRadius="$2"
                    padding="$3"
                    alignItems="center"
                    gap="$3"
                    pressStyle={{ opacity: 0.85 }}
                    onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } } as any)}
                  >
                    <YStack flex={1} gap="$1">
                      <Text color="$text" fontSize={14} fontFamily="Outfit_600SemiBold" numberOfLines={1}>{e.title}</Text>
                      <Text color="$subtext0" fontSize={12}>
                        {formatST(e.startTime)} – {formatST(e.endTime)} ST
                      </Text>
                    </YStack>
                    <XStack
                      backgroundColor={e.status === 'ACTIVE' ? '#a6e3a120' : '#89b4fa20'}
                      borderRadius="$4"
                      paddingHorizontal="$2"
                      paddingVertical={2}
                    >
                      <Text fontSize={11} color={e.status === 'ACTIVE' ? '$success' : '$info'}>{e.status}</Text>
                    </XStack>
                    <Text color="$overlay" fontSize={16}>›</Text>
                  </XStack>
                ))
              )}
            </YStack>

            {/* Staff section */}
            <YStack gap="$2">
              <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Today's Staff</Text>
              {dashboard.shifts.length === 0 ? (
                <XStack alignItems="center" gap="$2" paddingVertical="$2">
                <Ionicons name="people-outline" size={16} color="#6c7086" />
                <Text color="$overlay" fontSize={13}>No shifts scheduled today</Text>
              </XStack>
              ) : (
                dashboard.shifts.map((s) => (
                  <XStack key={s.id} backgroundColor="$surface0" borderRadius="$2" padding="$3" alignItems="center" gap="$3">
                    <YStack
                      width={8} height={8} borderRadius="$4"
                      backgroundColor={s.status === 'ACTIVE' ? '$success' : '$surface2'}
                    />
                    <Text color="$text" fontSize={14} flex={1}>
                      {s.membership.user.name ?? 'Staff'}
                    </Text>
                    <Text color="$subtext0" fontSize={12}>
                      {formatST(s.scheduledStart)} – {formatST(s.scheduledEnd)}
                    </Text>
                  </XStack>
                ))
              )}
            </YStack>
          </YStack>
        </ScrollView>
      ) : (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color="$danger">Could not load dashboard.</Text>
        </YStack>
      )}
    </YStack>
  )
}
