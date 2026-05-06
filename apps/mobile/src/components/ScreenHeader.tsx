import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { XStack, XStackProps } from 'tamagui'

type Props = XStackProps & { children: React.ReactNode }

export function ScreenHeader({ children, ...props }: Props) {
  const insets = useSafeAreaInsets()
  return (
    <XStack
      paddingTop={insets.top + 8}
      paddingHorizontal="$4"
      paddingBottom="$3"
      backgroundColor="$base"
      borderBottomWidth={1}
      borderBottomColor="$surface0"
      alignItems="center"
      gap="$3"
      {...props}
    >
      {children}
    </XStack>
  )
}
