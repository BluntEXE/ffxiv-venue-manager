import { defaultConfig } from '@tamagui/config/v3'
import { createTamagui, createTokens } from 'tamagui'
import { createAnimations } from '@tamagui/animations-css'

// Catppuccin Mocha palette
const mocha = createTokens({
  color: {
    base:     '#1e1e2e',
    mantle:   '#181825',
    crust:    '#11111b',
    text:     '#cdd6f4',
    subtext0: '#a6adc8',
    surface0: '#313244',
    surface1: '#45475a',
    surface2: '#585b70',
    primary:  '#cba6f7',  // mauve
    success:  '#a6e3a1',  // green
    danger:   '#f38ba8',  // red
    warning:  '#f9e2af',  // yellow
    info:     '#89b4fa',  // blue
    overlay:  '#6c7086',
  },
  space:  { true: 16, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 },
  size:   { true: 44, 1: 16, 2: 20, 3: 28, 4: 36, 5: 44 },
  radius: { true: 8, 1: 4, 2: 8, 3: 12, 4: 16, full: 9999 },
  zIndex: { 1: 100, 2: 200, 3: 300 },
})

const animations = createAnimations({
  fast:   'ease-in 150ms',
  medium: 'ease-in 300ms',
  slow:   'ease-in 450ms',
})

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
  tokens: mocha,
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig
declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
