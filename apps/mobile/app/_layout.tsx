import { useEffect } from 'react'
import { useFonts } from 'expo-font'
import { SplashScreen, Stack } from 'expo-router'
import { TamaguiProvider, YStack } from 'tamagui'
import { tamaguiConfig } from '../tamagui.config'
import {
  Outfit_400Regular,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit'
import * as Sentry from '@sentry/react-native'
import { OfflineBanner } from '@/components/OfflineBanner'

Sentry.init({
  dsn: 'https://0361538a2d1e42a8934f4d255890ad8d@errors.xivvenuemanager.com/1',
  tracesSampleRate: 0,         // no perf tracing — error capture only
  enabled: process.env.NODE_ENV !== 'development',
})

SplashScreen.preventAutoHideAsync()

function RootLayout() {
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

  if (!fontsLoaded) return null

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <YStack flex={1} backgroundColor="$base">
        <OfflineBanner />
        <Stack screenOptions={{ headerShown: false }} />
      </YStack>
    </TamaguiProvider>
  )
}

export default Sentry.wrap(RootLayout)
