import { useEffect, useState } from 'react'
import { YStack, Text, Button, Spinner } from 'tamagui'
import { useRouter } from 'expo-router'
import { loadTokens, clearTokens, isExpired } from '@/lib/auth'

export default function HomeScreen() {
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    loadTokens().then((tokens) => {
      setAuthed(!!tokens && !isExpired(tokens.expiresAt))
    })
  }, [])

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
          onPress={() => router.push('/(auth)/login')}
          pressStyle={{ opacity: 0.85, scale: 0.97 }}
        >
          Sign in with Discord
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
