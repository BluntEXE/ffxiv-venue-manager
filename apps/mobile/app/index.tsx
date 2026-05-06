import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { loadTokens, isExpired } from '@/lib/auth'

export default function Index() {
  const [dest, setDest] = useState<string | null>(null)

  useEffect(() => {
    loadTokens().then((tokens) => {
      // Authed users land on home, everyone else goes straight to Discover
      if (tokens && !isExpired(tokens.expiresAt)) {
        setDest('/(app)/home')
      } else {
        setDest('/(app)/discover')
      }
    })
  }, [])

  if (!dest) return null
  return <Redirect href={dest as any} />
}
