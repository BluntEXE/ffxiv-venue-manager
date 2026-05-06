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
import { OfflineBanner } from '@/components/OfflineBanner'
import { setupErrorReporting } from '@/lib/error-reporter'

setupErrorReporting()

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

export default RootLayout
