import { useEffect, useState, useCallback } from 'react'
import * as SecureStore from 'expo-secure-store'
import { ScrollView, RefreshControl, Image, Alert } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import { loadTokens, isExpired } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { formatST, formatUntil, formatOpenSince } from '@/lib/server-time'
import { ScreenTop } from '@/components/ScreenContainer'
import { ShiftSkeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'

const DISCORD_AUTH_URL =
  `https://discord.com/oauth2/authorize` +
  `?client_id=${process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent('https://xivvenuemanager.com/api/mobile/auth/discord/callback')}` +
  `&response_type=code` +
  `&scope=identify%20email`

type Shift = {
  id: string
  status: 'ACTIVE' | 'SCHEDULED' | 'CLAIMED' | 'COMPLETED' | 'MISSED'
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
  venue: { id: string; name: string; dataCenter: string; world: string }
}

function canClockIn(scheduledStart: string): boolean {
  const start = new Date(scheduledStart).getTime()
  const now = Date.now()
  return now >= start - 30 * 60 * 1000 && now <= start + 60 * 60 * 1000
}

type FollowedVenue = {
  venueId: string
  venueName: string
  dataCenter: string
  world: string
  logoUrl: string | null
  isOpenNow: boolean
}

type OpenShift = {
  id: string
  venueId: string
  venueName: string
  scheduledStart: string
  scheduledEnd: string
  roleName: string | null
}

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

export default function HomeScreen() {
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [shiftsLoading, setShiftsLoading] = useState(false)
  const [follows, setFollows] = useState<FollowedVenue[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [clocking, setClocking] = useState<string | null>(null)
  const [openShifts, setOpenShifts] = useState<OpenShift[]>([])
  const [openShiftsExpanded, setOpenShiftsExpanded] = useState(true)
  const [eventsFeed, setEventsFeed] = useState<FeedEvent[]>([])
  const [eventsExpanded, setEventsExpanded] = useState(true)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimErrors, setClaimErrors] = useState<Record<string, string>>({})
  const [claimPending, setClaimPending] = useState<Record<string, boolean>>({})

  useEffect(() => {
    SecureStore.getItemAsync('@xivvm/openShiftsExpanded').then(val => {
      if (val !== null) setOpenShiftsExpanded(val === 'true')
    })
  }, [])

  useEffect(() => {
    SecureStore.getItemAsync('@xivvm/eventsFeedExpanded').then(val => {
      if (val !== null) setEventsExpanded(val === 'true')
    })
  }, [])

  async function checkAuth() {
    const tokens = await loadTokens()
    setAuthed(!!tokens && !isExpired(tokens.expiresAt))
  }

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

  function onRefresh() {
    setRefreshing(true)
    loadShifts(true)
  }

  function toggleOpenShifts() {
    const next = !openShiftsExpanded
    setOpenShiftsExpanded(next)
    SecureStore.setItemAsync('@xivvm/openShiftsExpanded', String(next))
  }

  function toggleEvents() {
    const next = !eventsExpanded
    setEventsExpanded(next)
    SecureStore.setItemAsync('@xivvm/eventsFeedExpanded', String(next))
  }

  async function doClaimShift(shiftId: string, venueId: string) {
    setClaiming(shiftId)
    setClaimErrors(e => { const n = { ...e }; delete n[shiftId]; return n })
    try {
      const res = await apiFetch(`/api/mobile/my/open-shifts/${shiftId}`, {
        method: 'POST',
        body: JSON.stringify({ venueId }),
      })
      if (res.status === 409) {
        setOpenShifts(s => s.filter(x => x.id !== shiftId))
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setClaimErrors(e => ({ ...e, [shiftId]: data.error || 'Failed to claim' }))
        return
      }
      setClaimPending(p => ({ ...p, [shiftId]: true }))
      setOpenShifts(s => s.filter(x => x.id !== shiftId))
    } catch {
      setClaimErrors(e => ({ ...e, [shiftId]: 'Network error' }))
    } finally {
      setClaiming(null)
    }
  }

  function claimShift(shiftId: string, venueId: string, label: string) {
    Alert.alert(
      'Claim this shift?',
      `${label}\n\nYour claim will be sent to a manager for approval.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Claim', onPress: () => doClaimShift(shiftId, venueId) },
      ]
    )
  }

  async function clockShift(shiftId: string, action: 'clock-in' | 'clock-out') {
    setClocking(shiftId)
    try {
      const res = await apiFetch(`/api/mobile/my/shifts/${shiftId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Something went wrong.')
        return
      }
      await loadShifts()
    } catch {
      alert('Network error.')
    } finally {
      setClocking(null)
    }
  }

  useFocusEffect(useCallback(() => {
    checkAuth().then(() => {
      loadTokens().then((t) => {
        if (t && !isExpired(t.expiresAt)) loadShifts()
      })
    })
  }, []))

  async function startLogin() {
    setLoading(true)
    await WebBrowser.openAuthSessionAsync(DISCORD_AUTH_URL, 'vmapp://')
    setLoading(false)
  }


  if (authed === null) {
    return (
      <YStack flex={1} backgroundColor="$base" alignItems="center" justifyContent="center">
        <Spinner color="$primary" />
      </YStack>
    )
  }

  if (!authed) {
    return (
      <YStack flex={1} backgroundColor="$base" alignItems="center" justifyContent="center" gap="$5" padding="$6">
        <YStack alignItems="center" gap="$2">
          <Text fontFamily="Outfit_700Bold" fontSize={24} color="$text">XIV Venue Manager</Text>
          <Text color="$subtext0" textAlign="center" fontSize={14}>
            Sign in to see your upcoming shifts, follow venues, and manage your own.
          </Text>
        </YStack>
        <Button
          size="$5"
          backgroundColor="$primary"
          color="$base"
          fontFamily="InterBold"
          fontSize={14}
          borderRadius="$3"
          onPress={startLogin}
          disabled={loading}
          icon={loading ? <Spinner color="$base" size="small" /> : undefined}
          pressStyle={{ opacity: 0.85, scale: 0.97 }}
        >
          {loading ? 'Connecting…' : 'Sign in with Discord'}
        </Button>
      </YStack>
    )
  }

  const activeShift = shifts.find((s) => s.status === 'ACTIVE')
  const upcoming = shifts.filter((s) => s.status === 'SCHEDULED' || s.status === 'CLAIMED')

  return (
    <YStack flex={1} backgroundColor="$base">
      <ScreenTop gap="$1">
        <Text fontFamily="Outfit_700Bold" fontSize={24} color="$text">Home</Text>
      </ScreenTop>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00b4ff"
            colors={['#00b4ff']}
            progressBackgroundColor="#0a0f1e"
          />
        }
      >
        {shiftsLoading ? (
          <YStack gap="$3" paddingTop="$2">
            <ShiftSkeleton />
            <ShiftSkeleton />
            <ShiftSkeleton />
          </YStack>
        ) : (
          <>
            {activeShift && (
              <YStack
                backgroundColor="$surface0"
                borderRadius="$3"
                padding="$4"
                gap="$2"
                borderLeftWidth={3}
                borderLeftColor="$success"
              >
                <XStack alignItems="center" gap="$2">
                  <XStack width={8} height={8} borderRadius="$4" backgroundColor="$success" />
                  <Text fontFamily="Outfit_600SemiBold" fontSize={14} color="$success">
                    Currently on shift
                  </Text>
                </XStack>
                <Text fontFamily="Outfit_700Bold" fontSize={18} color="$text">
                  {activeShift.venue.name}
                </Text>
                <Text color="$subtext0" fontSize={13}>
                  {activeShift.venue.world} · {activeShift.venue.dataCenter}
                </Text>
                <Text color="$subtext0" fontSize={12}>
                  {formatST(activeShift.scheduledStart)} – {formatST(activeShift.scheduledEnd)} ST
                  {activeShift.actualStart ? ` · Started ${formatOpenSince(activeShift.actualStart)}` : ''}
                </Text>
                <XStack gap="$2" marginTop="$2">
                  <Button
                    flex={1}
                    size="$3"
                    backgroundColor="$primary"
                    color="$base"
                    fontFamily="InterBold"
                    fontSize={13}
                    borderRadius="$2"
                    onPress={() => router.push({ pathname: '/log-sale', params: { venueId: activeShift.venue.id, venueName: activeShift.venue.name } } as any)}
                    pressStyle={{ opacity: 0.85, scale: 0.97 }}
                  >
                    Log Sale
                  </Button>
                  <Button
                    flex={1}
                    size="$3"
                    backgroundColor="$danger"
                    color="$base"
                    fontFamily="InterBold"
                    fontSize={13}
                    borderRadius="$2"
                    onPress={() => clockShift(activeShift.id, 'clock-out')}
                    disabled={clocking === activeShift.id}
                    pressStyle={{ opacity: 0.85, scale: 0.97 }}
                  >
                    {clocking === activeShift.id ? 'Clocking out…' : 'Clock Out'}
                  </Button>
                </XStack>
              </YStack>
            )}

            {upcoming.length > 0 ? (
              <YStack gap="$2">
                <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">
                  Upcoming Shifts
                </Text>
                {upcoming.map((s) => (
                  <XStack
                    key={s.id}
                    backgroundColor="$surface0"
                    borderRadius="$2"
                    padding="$3"
                    alignItems="center"
                    gap="$3"
                    borderWidth={1}
                    borderColor="rgba(0,180,255,0.15)"
                  >
                    <YStack flex={1} gap="$1">
                      <Text color="$text" fontSize={14} fontFamily="Outfit_600SemiBold" numberOfLines={1}>
                        {s.venue.name}
                      </Text>
                      <Text color="$subtext0" fontSize={12}>
                        {formatST(s.scheduledStart, 'datetime')} ST
                      </Text>
                    </YStack>
                    {s.status === 'CLAIMED' ? (
                      <XStack backgroundColor="rgba(0,180,255,0.08)" borderRadius="$4" paddingHorizontal="$2" paddingVertical={2}>
                        <Text fontSize={11} color="$primary">Pending approval</Text>
                      </XStack>
                    ) : canClockIn(s.scheduledStart) ? (
                      <Button
                        size="$3"
                        backgroundColor="$success"
                        color="$base"
                        fontFamily="InterBold"
                        fontSize={13}
                        borderRadius="$2"
                        onPress={() => clockShift(s.id, 'clock-in')}
                        disabled={clocking === s.id}
                        pressStyle={{ opacity: 0.85, scale: 0.97 }}
                      >
                        {clocking === s.id ? 'Clocking in…' : 'Clock In'}
                      </Button>
                    ) : (
                      <XStack
                        backgroundColor="rgba(0,180,255,0.12)"
                        borderRadius="$4"
                        paddingHorizontal="$2"
                        paddingVertical={2}
                      >
                        <Text fontSize={11} color="$primary">{formatUntil(s.scheduledStart)}</Text>
                      </XStack>
                    )}
                  </XStack>
                ))}
              </YStack>
            ) : !activeShift ? (
              <EmptyState
                icon="calendar-outline"
                title="No upcoming shifts"
                subtitle="Nothing scheduled in the next 7 days."
              />
            ) : null}
          </>
        )}

        {eventsFeed.length > 0 && (
          <YStack gap="$2" marginTop="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Upcoming Events</Text>
              <Button chromeless size="$3" onPress={toggleEvents} paddingHorizontal="$1">
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
                        <Text fontSize={11} style={{ color: badge.color }}>
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

        {openShifts.length > 0 && (
          <YStack gap="$2" marginTop="$2">
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Open Shifts</Text>
              <Button chromeless size="$3" onPress={toggleOpenShifts} paddingHorizontal="$1">
                <Ionicons name={openShiftsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#a6adc8" />
              </Button>
            </XStack>
            {openShiftsExpanded && openShifts.map((s) => (
              <XStack
                key={s.id}
                backgroundColor="$surface0"
                borderRadius="$2"
                padding="$3"
                alignItems="center"
                gap="$3"
                borderWidth={1}
                borderColor="rgba(0,180,255,0.15)"
              >
                <YStack flex={1} gap="$1">
                  <Text color="$text" fontSize={14} fontFamily="Outfit_600SemiBold" numberOfLines={1}>
                    {s.venueName}
                  </Text>
                  <Text color="$subtext0" fontSize={12}>
                    {formatST(s.scheduledStart, 'datetime')} – {formatST(s.scheduledEnd, 'datetime')} ST
                  </Text>
                  {s.roleName && (
                    <Text color="$subtext0" fontSize={11}>{s.roleName}</Text>
                  )}
                  {claimErrors[s.id] && (
                    <Text color="$danger" fontSize={11}>{claimErrors[s.id]}</Text>
                  )}
                </YStack>
                <Button
                  size="$3"
                  backgroundColor="$primary"
                  color="$base"
                  borderRadius="$2"
                  fontFamily="InterBold"
                  fontSize={12}
                  disabled={claiming === s.id}
                  onPress={() => claimShift(s.id, s.venueId, `${s.venueName}${s.roleName ? ` · ${s.roleName}` : ''}\n${formatST(s.scheduledStart, 'datetime')} – ${formatST(s.scheduledEnd, 'datetime')} ST`)}
                  pressStyle={{ opacity: 0.85 }}
                >
                  {claiming === s.id ? <Spinner size="small" color="$base" /> : 'Claim'}
                </Button>
              </XStack>
            ))}
          </YStack>
        )}

        {follows.length > 0 && (
          <YStack gap="$2" marginTop="$2">
            <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Following</Text>
            {follows.map((f) => (
              <XStack
                key={f.venueId}
                backgroundColor="$surface0"
                borderRadius="$2"
                padding="$3"
                alignItems="center"
                gap="$3"
                borderWidth={1}
                borderColor="rgba(0,180,255,0.15)"
                pressStyle={{ opacity: 0.85 }}
                onPress={() => router.push(`/venue/${f.venueId}` as any)}
              >
                <YStack
                  width={36}
                  height={36}
                  borderRadius="$2"
                  backgroundColor="$surface1"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                  overflow="hidden"
                >
                  {f.logoUrl ? (
                    <Image source={{ uri: f.logoUrl }} style={{ width: 36, height: 36, borderRadius: 8 }} resizeMode="cover" accessibilityLabel={`${f.venueName} logo`} />
                  ) : (
                    <Ionicons name="storefront-outline" size={18} color="#a6adc8" />
                  )}
                </YStack>
                <YStack flex={1} gap="$1">
                  <Text color="$text" fontSize={14} fontFamily="Outfit_600SemiBold" numberOfLines={1}>
                    {f.venueName}
                  </Text>
                  <Text color="$subtext0" fontSize={12}>{f.world} · {f.dataCenter}</Text>
                </YStack>
                {f.isOpenNow ? (
                  <XStack backgroundColor="#a6e3a120" borderRadius="$4" paddingHorizontal="$2" paddingVertical={2}>
                    <Text fontSize={11} color="$success">Open</Text>
                  </XStack>
                ) : (
                  <XStack backgroundColor="rgba(166,173,200,0.15)" borderRadius="$4" paddingHorizontal="$2" paddingVertical={2}>
                    <Text fontSize={11} color="$subtext0">Closed</Text>
                  </XStack>
                )}
                <Ionicons name="chevron-forward" size={16} color="#6c7086" />
              </XStack>
            ))}
          </YStack>
        )}

      </ScrollView>
    </YStack>
  )
}
