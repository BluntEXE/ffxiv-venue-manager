import { useEffect, useState } from 'react'
import { XStack, Text } from 'tamagui'
import * as Network from 'expo-network'
import { Ionicons } from '@expo/vector-icons'

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    async function check() {
      try {
        const state = await Network.getNetworkStateAsync()
        setOffline(!state.isConnected || !state.isInternetReachable)
      } catch {
        setOffline(false)
      }
    }

    check()
    interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  if (!offline) return null

  return (
    <XStack
      backgroundColor="#f9e2af"
      paddingHorizontal="$4"
      paddingVertical="$2"
      alignItems="center"
      gap="$2"
    >
      <Ionicons name="cloud-offline-outline" size={16} color="#070b14" />
      <Text color="#070b14" fontSize={13} fontFamily="Inter">
        No internet connection
      </Text>
    </XStack>
  )
}
