export interface ShoutFields {
  venueName: string
  tagline: string
  server: string
  location: string
  openTime: string
  isAdult: boolean
  djs: string
  cta: string
  extras: string
  links: string
}

export type TemplateId = 'pre' | 'open'

export interface ParsedEvent {
  venueName?: string
  tagline?: string
  server?: string
  location?: string
  openTime?: string
  isAdult?: boolean
  djs?: string
  links?: string
}
