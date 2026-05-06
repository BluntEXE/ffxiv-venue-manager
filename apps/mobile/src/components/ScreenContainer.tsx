import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { YStack, YStackProps } from 'tamagui'

type Props = YStackProps & { children: React.ReactNode }

// Top section of a tab screen -- respects status bar
export function ScreenTop({ children, ...props }: Props) {
  const insets = useSafeAreaInsets()
  return (
    <YStack paddingTop={insets.top + 8} paddingHorizontal="$4" paddingBottom="$3" {...props}>
      {children}
    </YStack>
  )
}
