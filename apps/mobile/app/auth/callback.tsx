import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { YStack, Spinner } from 'tamagui'
import { saveTokens } from '@/lib/auth'

export default function AuthCallback() {
  const { token, refresh, expiresAt } = useLocalSearchParams<{
    token: string
    refresh: string
    expiresAt: string
  }>()
  const router = useRouter()

  useEffect(() => {
    if (token && refresh && expiresAt) {
      saveTokens({
        token: decodeURIComponent(token),
        refreshToken: decodeURIComponent(refresh),
        expiresAt: decodeURIComponent(expiresAt),
      }).then(() => {
        router.replace('/(app)/home')
      })
    } else {
      router.replace('/(auth)/login')
    }
  }, [token, refresh, expiresAt])

  return (
    <YStack flex={1} backgroundColor="$base" alignItems="center" justifyContent="center">
      <Spinner color="$primary" size="large" />
    </YStack>
  )
}
