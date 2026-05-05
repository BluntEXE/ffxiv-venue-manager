import { Stack, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { loadTokens } from '@/lib/auth'

export default function AppLayout() {
  const router  = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadTokens().then((tokens) => {
      if (!tokens) router.replace('/(auth)/login')
      else setReady(true)
    })
  }, [])

  if (!ready) return null

  return <Stack screenOptions={{ headerShown: false }} />
}
