import { YStack, Text } from 'tamagui'
import { Ionicons } from '@expo/vector-icons'

type Props = {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  subtitle?: string
}

export function EmptyState({ icon, title, subtitle }: Props) {
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" gap="$3" padding="$8">
      <Ionicons name={icon} size={48} color="#585b70" />
      <YStack alignItems="center" gap="$1">
        <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$subtext0" textAlign="center">
          {title}
        </Text>
        {subtitle && (
          <Text fontSize={13} color="$overlay" textAlign="center" lineHeight={18}>
            {subtitle}
          </Text>
        )}
      </YStack>
    </YStack>
  )
}
