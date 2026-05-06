import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

// No auth gate here -- Discover is public. Home handles its own auth check.
export default function AppLayout() {
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
