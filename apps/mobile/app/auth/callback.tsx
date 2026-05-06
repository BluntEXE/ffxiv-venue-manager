import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { YStack, Spinner } from 'tamagui'
import { saveTokens } from '@/lib/auth'
import { getPendingAction, clearPendingAction } from '@/lib/pending-action'

const API = 'https://xivvenuemanager.com'

export default function AuthCallback() {
  const { token, refresh, expiresAt } = useLocalSearchParams<{
    token: string
    refresh: string
    expiresAt: string
  }>()
  const router = useRouter()

  useEffect(() => {
    if (token && refresh && expiresAt) {
      const jwt = decodeURIComponent(token)
      saveTokens({
        token: jwt,
        refreshToken: decodeURIComponent(refresh),
        expiresAt: decodeURIComponent(expiresAt),
      }).then(async () => {
        const action = await getPendingAction()
        await clearPendingAction()

        if (action?.type === 'follow_venue') {
          try {
            await fetch(`${API}/api/mobile/venues/${action.venueId}/follow`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${jwt}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
            })
          } catch {}
          router.replace(action.returnTo as any)
        } else {
          router.replace('/(app)/home')
        }
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
