import { useEffect, useState, useCallback } from 'react'
import { ScrollView, RefreshControl } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import { loadTokens, clearTokens, isExpired } from '@/lib/auth'
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
  status: 'ACTIVE' | 'SCHEDULED' | 'COMPLETED' | 'MISSED'
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
  venue: { id: string; name: string; dataCenter: string; world: string }
}

export default function HomeScreen() {
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [shiftsLoading, setShiftsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function checkAuth() {
    const tokens = await loadTokens()
    setAuthed(!!tokens && !isExpired(tokens.expiresAt))
  }

  async function loadShifts(isRefresh = false) {
    if (!isRefresh) setShiftsLoading(true)
    try {
      const res = await apiFetch('/api/mobile/my/shifts')
      if (res.ok) setShifts(await res.json())
    } catch {}
    setShiftsLoading(false)
    setRefreshing(false)
  }

  function onRefresh() {
    setRefreshing(true)
    loadShifts(true)
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

  async function logout() {
    await clearTokens()
    setShifts([])
    setAuthed(false)
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
  const upcoming = shifts.filter((s) => s.status === 'SCHEDULED')

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
            tintColor="#cba6f7"
            colors={['#cba6f7']}
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
                  >
                    <YStack flex={1} gap="$1">
                      <Text color="$text" fontSize={14} fontFamily="Outfit_600SemiBold" numberOfLines={1}>
                        {s.venue.name}
                      </Text>
                      <Text color="$subtext0" fontSize={12}>
                        {formatST(s.scheduledStart, 'datetime')} ST
                      </Text>
                    </YStack>
                    <XStack
                      backgroundColor="#cba6f720"
                      borderRadius="$4"
                      paddingHorizontal="$2"
                      paddingVertical={2}
                    >
                      <Text fontSize={11} color="$primary">{formatUntil(s.scheduledStart)}</Text>
                    </XStack>
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

        <Button
          size="$3"
          backgroundColor="$surface0"
          color="$subtext0"
          borderRadius="$3"
          onPress={logout}
          marginTop="$4"
          alignSelf="center"
        >
          Sign out
        </Button>
      </ScrollView>
    </YStack>
  )
}
