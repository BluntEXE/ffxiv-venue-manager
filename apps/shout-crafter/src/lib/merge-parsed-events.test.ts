import { describe, it, expect } from 'vitest'
import { mergeParsedEvents } from './discord-parser'
import type { ParsedEvent } from '../types'

describe('mergeParsedEvents', () => {
  it('keeps regex-derived values when present, for fields the LLM is not preferred on', () => {
    const regex: ParsedEvent = { openTime: '18:00-20:00 ST', location: 'W6 P9' }
    const llm: ParsedEvent = { openTime: '19:00-21:00 ST', location: 'W1 P1' }
    expect(mergeParsedEvents(regex, llm)).toEqual({
      openTime: '18:00-20:00 ST',
      location: 'W6 P9',
    })
  })

  it('prefers the LLM value for venueName, tagline, and djs even when regex has a value', () => {
    const regex: ParsedEvent = { venueName: 'Wrong Name', tagline: 'Wrong Tagline', djs: 'Wrong DJ List', openTime: '18:00-20:00 ST' }
    const llm: ParsedEvent = { venueName: 'Project XIV', tagline: 'Divine', djs: 'DJ Echo' }
    expect(mergeParsedEvents(regex, llm)).toEqual({
      venueName: 'Project XIV',
      tagline: 'Divine',
      djs: 'DJ Echo',
      openTime: '18:00-20:00 ST',
    })
  })

  it('keeps the regex value for LLM-preferred fields when the LLM has none', () => {
    const regex: ParsedEvent = { venueName: 'Velvet Room', tagline: 'Glow Night', djs: 'DJ Echo' }
    expect(mergeParsedEvents(regex, {})).toEqual(regex)
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
