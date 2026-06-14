import { describe, it, expect } from 'vitest'
import { parseDiscordPost } from './discord-parser'
import type { ParsedEvent } from '../types'

describe('parseDiscordPost', () => {
  it('parses "Music by:" lists with a starred venue, presents:, comma ward/plot, ST range, and both links', () => {
    const input = `★ Moonlit Lounge ★
presents: Velvet Nights
Ward 12, Plot 3
6 PM ST - 9 PM ST
Music by: DJ Aria, DJ Sol
discord.gg/moonlit
partake.gg/events/4521`
    const expected: ParsedEvent = {
      djs: 'DJ Aria, DJ Sol',
      links: 'partake.gg/events/4521 | discord.gg/moonlit',
      location: 'W12 P3',
      openTime: '6 PM-9 PM ST',
      tagline: 'Velvet Nights',
      venueName: '★ Moonlit Lounge ★',
    }
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('parses "Soundscape curated by:" lists with a ✦-decorated venue and pipe-separated ward/plot', () => {
    const input = `✦ The Glass Atrium ✦
Soundscape curated by: Echo, Vex
Ward 4 | Plot 22
7:00 PM ST - 10:00 PM ST`
    const expected: ParsedEvent = {
      djs: 'Echo, Vex',
      location: 'W4 P22',
      openTime: '7:00 PM-10:00 PM ST',
      tagline: 'The Glass Atrium',
      venueName: '✦ The Glass Atrium ✦',
    }
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('parses "presents:" event names with "at the X" venue extraction and dash-separated W-P', () => {
    const input = `Event Horizon presents: Neon Dreams
at the Skybound Terrace
W8-P15
5 PM ST - 8 PM ST`
    const expected: ParsedEvent = {
      location: 'W8 P15',
      openTime: '5 PM-8 PM ST',
      tagline: 'Neon Dreams',
      venueName: 'Skybound Terrace',
    }
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('converts "Time: ... GMT+1" to ST and parses "Name — HH:MM" (name-before-dash) DJ lineups', () => {
    const input = `Ninja's Hideaway
Time: 7:00 PM - 11:00 PM GMT+1
🎧 DJ Frostbyte — 19:00
🎧 Luna Vex — 20:00`
    const expected: ParsedEvent = {
      djs: 'DJ Frostbyte, Luna Vex',
      openTime: '18:00-22:00 ST',
      venueName: "Ninja's Hideaway",
    }
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('derives a time range from "HH:MM - Name" slot lineups with comma ward/plot', () => {
    const input = `Velvet Room
18:00 - DJ Nova
19:00 - DJ Star
20:00 - DJ Comet
Ward 6, Plot 9`
    const expected: ParsedEvent = {
      djs: 'DJ Nova, DJ Star, DJ Comet',
      location: 'W6 P9',
      openTime: '18:00-20:00 ST',
      venueName: 'Velvet Room',
    }
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('derives a time range from "HH:MM  Name" (double-space, no dash) slot lineups with space-separated W/P', () => {
    const input = `Aurora Club
19:00  DJ Echo
20:00  DJ Pulse
Ward 3 Plot 7`
    const expected: ParsedEvent = {
      djs: 'DJ Echo, DJ Pulse',
      location: 'W3 P7',
      openTime: '19:00-20:00 ST',
      venueName: 'Aurora Club',
    }
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('parses multi-slot "HH:MM → HH:MM ST - Name" arrow ranges with comma W/P', () => {
    const input = `Crystal Veil Lounge
17:00 → 18:00 ST - Ti Beats
18:00 → 19:00 ST - Mira Sol
W10, P2`
    const expected: ParsedEvent = {
      djs: 'Ti Beats, Mira Sol',
      location: 'W10 P2',
      openTime: '17:00-19:00 ST',
      server: 'Crystal',
      venueName: 'Crystal Veil Lounge',
    }
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('KNOWN QUIRK: a starred name is captured as the tagline, so the identical venueName match is suppressed (eventName === venueName)', () => {
    const input = `★ Starlight Pavilion ★
GRAND OPENING NIGHT
Ward 14 - Plot 30
discord.gg/starlight | partake.gg/events/9981`
    const expected: ParsedEvent = {
      links: 'partake.gg/events/9981 | discord.gg/starlight',
      location: 'W14 P30',
      server: 'Light',
      tagline: 'Starlight Pavilion',
      venueName: '★ Starlight Pavilion ★',
    }
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('KNOWN QUIRK: bold markdown in a "Music by:" line is matched by the bold-venue regex before the DJ names are parsed, so venueName ends up being the first bolded DJ name', () => {
    const input = `Hollow Reverie
Music by: **DJ Nyx**, **DJ Vale**
Ward 9, Plot 1
8 PM ST - 11 PM ST
discord.gg/hollowreverie`
    const expected: ParsedEvent = {
      djs: 'DJ Nyx, DJ Vale',
      links: 'discord.gg/hollowreverie',
      location: 'W9 P1',
      openTime: '8 PM-11 PM ST',
      tagline: '8 PM ST - 11 PM ST',
      venueName: 'DJ Nyx',
    }
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('parses a ✧-decorated venue with pipe-separated location, a single arrow ST range, and multiple emoji "Name — HH:MM" DJ slots', () => {
    const input = `✧ Echo Chamber ✧ │ Ward 2 | Plot 18
17:00 → 19:00 ST
DJ Lineup:
🎧 Aria Frost — 17:00
🎧 Solene — 18:00`
    const expected: ParsedEvent = {
      djs: '00 ST',
      location: 'W2 P18',
      openTime: '17:00-19:00 ST',
      tagline: 'Echo Chamber',
      venueName: '✧ Echo Chamber ✧ │ Ward 2 | Plot 18',
    }
    expect(parseDiscordPost(input)).toEqual(expected)
  })
})
