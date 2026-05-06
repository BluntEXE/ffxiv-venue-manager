import { useEffect, useState } from 'react'
import { YStack, Text, Button, Spinner } from 'tamagui'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { loadTokens, clearTokens, isExpired } from '@/lib/auth'

const API_BASE = 'https://xivvenuemanager.com'
const DISCORD_AUTH_URL =
  `https://discord.com/oauth2/authorize` +
  `?client_id=${process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(API_BASE + '/api/mobile/auth/discord/callback')}` +
  `&response_type=code` +
  `&scope=identify%20email`

export default function HomeScreen() {
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadTokens().then((tokens) => {
      setAuthed(!!tokens && !isExpired(tokens.expiresAt))
    })
  }, [])

  async function startLogin() {
    setLoading(true)
    await WebBrowser.openAuthSessionAsync(DISCORD_AUTH_URL, 'vmapp://')
    setLoading(false)
    // auth/callback route handles the token save and navigation
  }

  async function logout() {
    await clearTokens()
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
      <YStack
        flex={1}
        backgroundColor="$base"
        alignItems="center"
        justifyContent="center"
        gap="$5"
        padding="$6"
      >
        <YStack alignItems="center" gap="$2">
          <Text fontFamily="Outfit_700Bold" fontSize={24} color="$text">
            XIV Venue Manager
          </Text>
          <Text color="$subtext0" textAlign="center" fontSize={14}>
            Sign in to get notified when your favourite venues open, follow venues, and manage your own.
          </Text>
        </YStack>

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

  return (
    <YStack
      flex={1}
      backgroundColor="$base"
      alignItems="center"
      justifyContent="center"
      gap="$5"
      padding="$6"
    >
      <Text fontFamily="Outfit_700Bold" fontSize={22} color="$text">
        You're signed in
      </Text>
      <Text color="$subtext0" textAlign="center">
        Operator features coming in Phase 6.{'\n'}Use Discover to browse open venues.
      </Text>
      <Button
        size="$4"
        backgroundColor="$surface1"
        color="$text"
        borderRadius="$3"
        onPress={logout}
      >
        Sign out
      </Button>
    </YStack>
  )
}
