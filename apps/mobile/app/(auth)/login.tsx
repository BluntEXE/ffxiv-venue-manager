import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { useEffect, useRef, useState } from 'react'
import { saveTokens } from '@/lib/auth'

const API_BASE = 'https://xivvenuemanager.com'
const DISCORD_AUTH_URL =
  `https://discord.com/oauth2/authorize` +
  `?client_id=${process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(API_BASE + '/api/mobile/auth/discord/callback')}` +
  `&response_type=code` +
  `&scope=identify%20email`

export default function LoginScreen() {
  const router   = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const listener = useRef<ReturnType<typeof Linking.addEventListener> | null>(null)

  useEffect(() => {
    listener.current = Linking.addEventListener('url', handleDeepLink)
    return () => listener.current?.remove()
  }, [])

  async function handleDeepLink({ url }: { url: string }) {
    const parsed = Linking.parse(url)
    if (parsed.scheme !== 'vmapp') return

    if (parsed.path === 'auth/callback') {
      const { token, refresh, expiresAt } = parsed.queryParams as Record<string, string>
      if (token && refresh) {
        await saveTokens({ token, refreshToken: refresh, expiresAt })
        router.replace('/(app)/home')
      }
    } else if (parsed.path === 'auth/error') {
      const msg = (parsed.queryParams as any)?.message ?? 'Authentication failed'
      setError(decodeURIComponent(msg))
      setLoading(false)
    }
  }

  async function startLogin() {
    setError(null)
    setLoading(true)
    await WebBrowser.openAuthSessionAsync(DISCORD_AUTH_URL, 'vmapp://')
    // If user cancelled the browser without completing auth
    setLoading(false)
  }

  return (
    <YStack
      flex={1}
      backgroundColor="$base"
      alignItems="center"
      justifyContent="center"
      gap="$4"
      padding="$6"
    >
      <YStack alignItems="center" gap="$2">
        <Text fontSize={28} fontWeight="bold" color="$text" fontFamily="InterBold">
          XIV Venue Manager
        </Text>
        <Text fontSize={14} color="$subtext0">
          Off-game management for FFXIV venues
        </Text>
      </YStack>

      {error && (
        <YStack
          backgroundColor="$surface0"
          borderRadius="$2"
          padding="$3"
          borderLeftWidth={3}
          borderLeftColor="$danger"
        >
          <Text color="$danger" fontSize={13}>{error}</Text>
        </YStack>
      )}

      <Button
        size="$5"
        backgroundColor="$primary"
        color="$base"
        fontFamily="InterBold"
        borderRadius="$3"
        onPress={startLogin}
        disabled={loading}
        icon={loading ? <Spinner color="$base" /> : undefined}
        pressStyle={{ opacity: 0.85, scale: 0.97 }}
      >
        {loading ? 'Connecting…' : 'Sign in with Discord'}
      </Button>
    </YStack>
  )
}
