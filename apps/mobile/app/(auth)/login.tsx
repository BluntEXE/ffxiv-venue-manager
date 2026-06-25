import { YStack, Text, Button, Spinner } from 'tamagui'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useState } from 'react'

const API_BASE = 'https://xivvenuemanager.com'
const DISCORD_AUTH_URL =
  `https://discord.com/oauth2/authorize` +
  `?client_id=${process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(API_BASE + '/api/mobile/auth/discord/callback')}` +
  `&response_type=code` +
  `&scope=identify%20email`

export default function LoginScreen() {
  const router = useRouter()
  const { error: routeError } = useLocalSearchParams<{ error?: string }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(routeError ?? null)

  async function startLogin() {
    setError(null)
    setLoading(true)
    await WebBrowser.openAuthSessionAsync(DISCORD_AUTH_URL, 'vmapp://')
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
        <Text fontSize={24} color="$text" fontFamily="Outfit_700Bold">
          XIV Venue Manager
        </Text>
        <Text fontSize={14} color="$subtext0" textAlign="center">
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
        fontSize={14}
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
