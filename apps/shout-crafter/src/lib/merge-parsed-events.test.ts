import { describe, it, expect } from 'vitest'
import { mergeParsedEvents } from './discord-parser'
import type { ParsedEvent } from '../types'

describe('mergeParsedEvents', () => {
  it('keeps regex-derived values when present', () => {
    const regex: ParsedEvent = { venueName: 'Velvet Room', openTime: '18:00-20:00 ST' }
    const llm: ParsedEvent = { venueName: 'Wrong Name', openTime: '19:00-21:00 ST', djs: 'DJ Echo' }
    expect(mergeParsedEvents(regex, llm)).toEqual({
      venueName: 'Velvet Room',
      openTime: '18:00-20:00 ST',
      djs: 'DJ Echo',
    })
  })

  it('fills in fields the regex left empty or undefined', () => {
    const regex: ParsedEvent = { venueName: '', tagline: undefined, location: 'W6 P9' }
    const llm: ParsedEvent = { venueName: 'Aurora Club', tagline: 'Glow Night', location: 'W1 P1' }
    expect(mergeParsedEvents(regex, llm)).toEqual({
      venueName: 'Aurora Club',
      tagline: 'Glow Night',
      location: 'W6 P9',
    })
  })

  it('does not overwrite a present field with an empty LLM value', () => {
    const regex: ParsedEvent = { djs: 'DJ Echo' }
    const llm: ParsedEvent = { djs: '' }
    expect(mergeParsedEvents(regex, llm)).toEqual({ djs: 'DJ Echo' })
  })

  it('returns the regex result unchanged when the LLM result is empty', () => {
    const regex: ParsedEvent = { venueName: 'Aurora Club', openTime: '19:00-20:00 ST' }
    expect(mergeParsedEvents(regex, {})).toEqual(regex)
  })

  it('merges isAdult only when the regex result did not set it', () => {
    const regex: ParsedEvent = { venueName: 'Aurora Club' }
    const llm: ParsedEvent = { isAdult: true }
    expect(mergeParsedEvents(regex, llm)).toEqual({ venueName: 'Aurora Club', isAdult: true })
  })
})
