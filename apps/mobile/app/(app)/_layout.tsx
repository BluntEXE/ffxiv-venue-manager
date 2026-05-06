import { Tabs, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { loadTokens } from '@/lib/auth'
import { Ionicons } from '@expo/vector-icons'

export default function AppLayout() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadTokens().then((tokens) => {
      if (!tokens) router.replace('/(auth)/login')
      else setReady(true)
    })
  }, [])

  if (!ready) return null

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#181825',
          borderTopColor: '#313244',
        },
        tabBarActiveTintColor: '#cba6f7',
        tabBarInactiveTintColor: '#6c7086',
        tabBarLabelStyle: { fontFamily: 'Inter', fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
