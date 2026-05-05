import { YStack, Text, Button } from 'tamagui'
import { useRouter } from 'expo-router'
import { clearTokens } from '@/lib/auth'

export default function HomeScreen() {
  const router = useRouter()

  async function logout() {
    await clearTokens()
    router.replace('/(auth)/login')
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
      <Text fontSize={22} fontWeight="bold" color="$text" fontFamily="InterBold">
        You're in! 🎉
      </Text>
      <Text color="$subtext0" textAlign="center">
        Phase 2 complete — auth working.{'
'}Phase 3 (Discover) coming next.
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
