import { useEffect } from 'react'
import { useFonts } from 'expo-font'
import { SplashScreen, Stack } from 'expo-router'
import { TamaguiProvider } from 'tamagui'
import { tamaguiConfig } from '../tamagui.config'
import {
  Outfit_400Regular,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit'
import { loadTokens, isExpired, getValidToken } from '@/lib/auth'
import { registerPushToken } from '@/lib/push'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter:              require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold:          require('@tamagui/font-inter/otf/Inter-Bold.otf'),
    Outfit_400Regular,
    Outfit_600SemiBold,
    Outfit_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  useEffect(() => {
    // Register push token on startup if signed in (best-effort, no-op if FCM not ready)
    loadTokens().then(async (tokens) => {
      if (!tokens || isExpired(tokens.expiresAt)) return
      try {
        const jwt = await getValidToken()
        await registerPushToken(jwt)
      } catch {
        // ignore
      }
    })
  }, [])

  if (!fontsLoaded) return null

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <Stack screenOptions={{ headerShown: false }} />
    </TamaguiProvider>
  )
}
