import type { ShoutFields, TemplateId } from '../types'

export const SHOUT_CHAR_LIMIT = 500

export type SeparatorId = 'dot' | 'pipe' | 'bullet'
export type DecorId = 'none' | 'diamond' | 'star' | 'doubleStar' | 'heart' | 'wave' | 'arrow'

export const SEPARATORS: { id: SeparatorId; label: string; char: string }[] = [
  { id: 'dot',    label: '·',  char: ' · ' },
  { id: 'pipe',   label: '|',  char: ' | ' },
  { id: 'bullet', label: '•',  char: ' • ' },
]

export const DECORS: { id: DecorId; label: string; wrap: (n: string) => string }[] = [
  { id: 'none',       label: 'None',          wrap: n => n },
  { id: 'diamond',    label: '♦ Name ♦',      wrap: n => `♦ ${n} ♦` },
  { id: 'star',       label: '★ Name ★',      wrap: n => `★ ${n} ★` },
  { id: 'doubleStar', label: '✦ Name ✦',      wrap: n => `✦ ${n} ✦` },
  { id: 'heart',      label: '♥ Name ♥',      wrap: n => `♥ ${n} ♥` },
  { id: 'wave',       label: '～♡ Name ♡～',  wrap: n => `～～～♡ ${n} ♡～～～` },
  { id: 'arrow',      label: '» Name «',       wrap: n => `» ${n} «` },
]

export function buildShout(
  fields: ShoutFields,
  templateId: TemplateId,
  separatorId: SeparatorId = 'dot',
  decorId: DecorId = 'diamond',
): string {
  const { venueName, tagline, server, location, openTime, isAdult, djs, cta, extras, links } = fields
  const sep = SEPARATORS.find(s => s.id === separatorId)?.char ?? ' · '
  const decor = DECORS.find(d => d.id === decorId)?.wrap ?? (n => `♦ ${n} ♦`)

  const name = venueName?.trim() ? decor(venueName.trim()) : undefined
  const djSegment = djs.trim() ? `DJs: ${djs.trim()}` : undefined
  const age = isAdult ? '18+' : undefined
  const moreInfo = links.trim() ? `More Info: ${links.trim()}` : undefined

  const join = (...segments: (string | undefined)[]) =>
    segments.filter(Boolean).join(sep)

  switch (templateId) {
    case 'pre':
      return join(name, tagline, age, openTime, server, location, djSegment, cta, extras, moreInfo)
    case 'open':
      return join(name, tagline, age, server, location, djSegment, cta, extras, moreInfo)
    default:
      return ''
  }
}

export const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: 'pre',  label: 'Pre-Opening' },
  { id: 'open', label: 'Open Now' },
]
