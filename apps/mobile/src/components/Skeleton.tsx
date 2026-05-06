import { useEffect, useRef } from 'react'
import { Animated, View, StyleSheet } from 'react-native'

type Props = { width?: number | string; height?: number; radius?: number; style?: object }

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: Props) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  return (
    <Animated.View
      style={[
        styles.base,
        { width: width as any, height, borderRadius: radius, opacity },
        style,
      ]}
    />
  )
}

export function ShiftSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton width="60%" height={16} radius={6} />
      <Skeleton width="40%" height={12} radius={4} style={{ marginTop: 6 }} />
    </View>
  )
}

export function VenueSkeleton() {
  return (
    <View style={styles.venueCard}>
      <View style={styles.venueIcon} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="70%" height={16} radius={6} />
        <Skeleton width="40%" height={12} radius={4} />
        <Skeleton width="55%" height={20} radius={10} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  base: { backgroundColor: '#45475a' },
  card: {
    backgroundColor: '#313244',
    borderRadius: 8,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  venueCard: {
    flexDirection: 'row',
    backgroundColor: '#313244',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    alignItems: 'center',
    gap: 12,
  },
  venueIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#45475a',
    flexShrink: 0,
  },
})
