import { defaultConfig } from '@tamagui/config/v3'
import { createTamagui, createTokens } from 'tamagui'
import { createAnimations } from '@tamagui/animations-css'

// XIV blue design system -- matches xivvenuemanager.com post-2026-05-29 redesign
const xivTokens = createTokens({
  color: {
    base:        '#070b14',  // deep navy bg
    mantle:      '#050810',  // darker layer
    crust:       '#030609',  // deepest
    text:        '#cdd6f4',
    subtext0:    '#a6adc8',
    surface0:    '#0a0f1e',  // card bg
    surface1:    '#0d1525',  // elevated surface
    surface2:    '#111827',  // more elevated
    primary:     '#00b4ff',  // XIV blue
    success:     '#a6e3a1',  // emerald
    danger:      '#f38ba8',  // red
    warning:     '#f9e2af',  // yellow
    info:        '#89b4fa',  // soft blue (distinct from primary)
    overlay:     '#6c7086',
    border:      'rgba(0,180,255,0.15)',
    borderHover: 'rgba(0,180,255,0.25)',
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
  tokens: xivTokens,
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig
declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
