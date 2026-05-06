import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

export default function AuthError() {
  const { message } = useLocalSearchParams<{ message: string }>()
  const router = useRouter()

  useEffect(() => {
    const decoded = message ? decodeURIComponent(message) : 'Authentication failed'
    router.replace({ pathname: '/(auth)/login', params: { error: decoded } } as any)
  }, [message])

  return null
}
