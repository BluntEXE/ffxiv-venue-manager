import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { loadTokens, isExpired } from '@/lib/auth'

export default function Index() {
  const [dest, setDest] = useState<string | null>(null)

  useEffect(() => {
    loadTokens().then((tokens) => {
      if (tokens && !isExpired(tokens.expiresAt)) {
        setDest('/(app)/home')
      } else {
        setDest('/(auth)/login')
      }
    })
  }, [])

  if (!dest) return null
  return <Redirect href={dest as any} />
}
