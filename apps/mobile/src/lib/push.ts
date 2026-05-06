import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

const API = 'https://xivvenuemanager.com'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

// Request permission and register Expo push token with the server.
// Silently no-ops if FCM isn't configured yet (pre-Play Console verification).
export async function registerPushToken(jwtToken: string): Promise<void> {
  if (Platform.OS !== 'android') return

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync()
    await fetch(`${API}/api/mobile/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ token: tokenData.data, platform: 'android' }),
    })
  } catch {
    // FCM not configured yet or network error — safe to ignore
  }
}
