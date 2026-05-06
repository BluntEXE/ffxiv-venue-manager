import { useEffect, useState, useCallback } from 'react'
import { ScrollView, Image, Switch } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { useRouter, useFocusEffect } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { loadTokens, clearTokens, isExpired, getValidToken } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { decodeJwtPayload } from '@/lib/jwt'
import { ScreenTop } from '@/components/ScreenContainer'

const DISCORD_AUTH_URL =
  `https://discord.com/oauth2/authorize` +
  `?client_id=${process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent('https://xivvenuemanager.com/api/mobile/auth/discord/callback')}` +
  `&response_type=code` +
  `&scope=identify%20email`

type Prefs = {
  shiftReminder: boolean
  venueOpenedNow: boolean
  eventReminder: boolean
  followVisibility: boolean
}

type UserInfo = { name: string | null; image: string | null; email: string | null }

function SettingRow({
  label,
  sublabel,
  value,
  onToggle,
  disabled,
}: {
  label: string
  sublabel?: string
  value: boolean
  onToggle: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <XStack alignItems="center" paddingVertical="$3" paddingHorizontal="$4" gap="$3">
      <YStack flex={1} gap="$1">
        <Text color="$text" fontSize={14} fontFamily="Inter">{label}</Text>
        {sublabel && <Text color="$subtext0" fontSize={12} lineHeight={16}>{sublabel}</Text>}
      </YStack>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: '#45475a', true: '#cba6f720' }}
        thumbColor={value ? '#cba6f7' : '#585b70'}
      />
    </XStack>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <YStack backgroundColor="$surface0" borderRadius="$3" overflow="hidden" marginBottom="$4">
      <XStack paddingHorizontal="$4" paddingTop="$3" paddingBottom="$2">
        <Text fontFamily="Outfit_600SemiBold" fontSize={12} color="$subtext0" letterSpacing={1}>
          {title.toUpperCase()}
        </Text>
      </XStack>
      {children}
    </YStack>
  )
}

function Divider() {
  return <XStack height={1} backgroundColor="$surface1" marginLeft="$4" />
}

export default function SettingsScreen() {
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [user, setUser] = useState<UserInfo>({ name: null, image: null, email: null })
  const [prefs, setPrefs] = useState<Prefs>({
    shiftReminder: true,
    venueOpenedNow: true,
    eventReminder: true,
    followVisibility: false,
  })
  const [prefsLoading, setPrefsLoading] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)

  useFocusEffect(useCallback(() => {
    loadTokens().then(async (tokens) => {
      if (!tokens || isExpired(tokens.expiresAt)) {
        setAuthed(false)
        return
      }
      setAuthed(true)
      const payload = decodeJwtPayload(tokens.token)
      setUser({
        name: (payload.name as string) || null,
        image: (payload.image as string) || null,
        email: (payload.email as string) || null,
      })
      setPrefsLoading(true)
      try {
        const res = await apiFetch('/api/mobile/notifications/preferences')
        if (res.ok) setPrefs(await res.json())
      } catch {}
      setPrefsLoading(false)
    })
  }, []))

  async function togglePref(key: keyof Prefs, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }))
    try {
      await apiFetch('/api/mobile/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      })
    } catch {
      setPrefs((p) => ({ ...p, [key]: !value })) // revert on error
    }
  }

  async function logout() {
    await clearTokens()
    setAuthed(false)
    setUser({ name: null, image: null, email: null })
  }

  async function startLogin() {
    setLoginLoading(true)
    await WebBrowser.openAuthSessionAsync(DISCORD_AUTH_URL, 'vmapp://')
    setLoginLoading(false)
  }

  if (authed === null) {
    return (
      <YStack flex={1} backgroundColor="$base" alignItems="center" justifyContent="center">
        <Spinner color="$primary" />
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor="$base">
      <ScreenTop gap="$1">
        <Text fontFamily="Outfit_700Bold" fontSize={24} color="$text">Settings</Text>
      </ScreenTop>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Account */}
        <SectionCard title="Account">
          {authed ? (
            <>
              <XStack padding="$4" alignItems="center" gap="$3">
                {user.image ? (
                  <Image
                    source={{ uri: user.image }}
                    style={{ width: 44, height: 44, borderRadius: 22 }}
                  />
                ) : (
                  <YStack
                    width={44} height={44} borderRadius={22}
                    backgroundColor="$surface1"
                    alignItems="center" justifyContent="center"
                  >
                    <Text fontSize={18}>👤</Text>
                  </YStack>
                )}
                <YStack flex={1} gap="$1">
                  <Text fontFamily="Outfit_600SemiBold" fontSize={15} color="$text">
                    {user.name ?? 'Discord User'}
                  </Text>
                  {user.email && (
                    <Text fontSize={12} color="$subtext0">{user.email}</Text>
                  )}
                </YStack>
              </XStack>
              <Divider />
              <XStack padding="$4">
                <Button
                  size="$3"
                  backgroundColor="$surface1"
                  color="$danger"
                  borderRadius="$3"
                  onPress={logout}
                  flex={1}
                >
                  Sign out
                </Button>
              </XStack>
            </>
          ) : (
            <YStack padding="$4" gap="$3">
              <Text color="$subtext0" fontSize={13} lineHeight={18}>
                Sign in to follow venues, view your shifts, and manage operator features.
              </Text>
              <Button
                size="$4"
                backgroundColor="$primary"
                color="$base"
                fontFamily="InterBold"
                fontSize={14}
                borderRadius="$3"
                onPress={startLogin}
                disabled={loginLoading}
                icon={loginLoading ? <Spinner color="$base" size="small" /> : undefined}
                pressStyle={{ opacity: 0.85, scale: 0.97 }}
              >
                {loginLoading ? 'Connecting...' : 'Sign in with Discord'}
              </Button>
            </YStack>
          )}
        </SectionCard>

        {/* Notifications */}
        {authed && (
          <SectionCard title="Notifications">
            {prefsLoading ? (
              <YStack padding="$4" alignItems="center">
                <Spinner color="$primary" size="small" />
              </YStack>
            ) : (
              <>
                <SettingRow
                  label="Shift reminder"
                  sublabel="1 hour before your scheduled shift starts"
                  value={prefs.shiftReminder}
                  onToggle={(v) => togglePref('shiftReminder', v)}
                />
                <Divider />
                <SettingRow
                  label="Venue opened"
                  sublabel="When a venue you follow opens for the night"
                  value={prefs.venueOpenedNow}
                  onToggle={(v) => togglePref('venueOpenedNow', v)}
                />
                <Divider />
                <SettingRow
                  label="Event reminder"
                  sublabel="30 minutes before an event at a followed venue"
                  value={prefs.eventReminder}
                  onToggle={(v) => togglePref('eventReminder', v)}
                />
              </>
            )}
          </SectionCard>
        )}

        {/* Privacy */}
        {authed && (
          <SectionCard title="Privacy">
            <SettingRow
              label="Show my name to venue operators"
              sublabel="When following a venue, operators can see your Discord name in their follower list"
              value={prefs.followVisibility}
              onToggle={(v) => togglePref('followVisibility', v)}
              disabled={prefsLoading}
            />
          </SectionCard>
        )}

        {/* About */}
        <SectionCard title="About">
          <XStack padding="$4" alignItems="center" justifyContent="space-between">
            <Text color="$subtext0" fontSize={13}>XIV Venue Manager</Text>
            <Text color="$overlay" fontSize={13}>v1.0.0</Text>
          </XStack>
          <Divider />
          <XStack
            padding="$4"
            alignItems="center"
            justifyContent="space-between"
            pressStyle={{ opacity: 0.7 }}
            onPress={() => WebBrowser.openBrowserAsync('https://xivvenuemanager.com')}
          >
            <Text color="$subtext0" fontSize={13}>Website</Text>
            <Text color="$primary" fontSize={13}>xivvenuemanager.com</Text>
          </XStack>
        </SectionCard>

      </ScrollView>
    </YStack>
  )
}
