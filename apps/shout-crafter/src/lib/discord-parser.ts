import type { ParsedEvent } from '../types'
import { findWorld, ALL_DATACENTERS } from './worlds'

// Ward/plot: spaces, commas, bullets, hyphens, pipes, slashes
const WARD_PLOT = /(?:ward|w)\s*[-•·,|/]?\s*(\d{1,2})\s*[-•·,|/\s]+(?:plot|p)\s*[-•·,|/]?\s*(\d{1,2})/i

const AT_VENUE = /\bat\s+(?:the\s+)?([A-Z][A-Za-z\s'&-]{2,40}?)(?=[,\n.!│|]|$)/m

const PRESENTS = /presents?[:\s]+([^♥♡│|♦★☆\n]{3,60}?)(?=[♥♡│|♦★☆\n]|$)/i
const STARRED_NAME = /[★☆♦♥♡✦✧]{1,3}\s*([A-Z][A-Za-z0-9\s!&':.-]{3,60}?)\s*[★☆♦♥♡✦✧!]{1,3}/
const DECORATED_NAME = /[^\w\s]{2,}\s*([A-Z][A-Za-z\s'&-]{2,35}?)\s*[^\w\s]{2,}/

// Music section keywords - use [ \t] not \s to avoid consuming newlines
const MUSIC_KEYWORD = /(?:music|soundscape|sounds?track|set|dj\s*line[-\s]?up)\s*(?:curated\s+)?by[ \t]*:?[ \t]*\n?([^│|\n]{3,200})/i

// Time tokens
const TIME_TOKEN_SRC = '\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?'
// Slot range: supports - – and → as separators between start/end times
const SLOT_RE = new RegExp(
  `(${TIME_TOKEN_SRC})\\s*[-–→⟶]\\s*(${TIME_TOKEN_SRC})\\s*(?:st|server\\s*time)`,
  'gi'
)
const TIME_RANGE_ST = new RegExp(
  `(${TIME_TOKEN_SRC})\\s*[-–→⟶]\\s*(${TIME_TOKEN_SRC})\\s*(?:st|server\\s*time)`,
  'i'
)
const TIME_SINGLE_ST = new RegExp(
  `(${TIME_TOKEN_SRC})\\s*(?:st|server\\s*time)`,
  'i'
)

// Inline: "5-7 ST: Name" or "5-7 ST → Name"
const INLINE_SLOT_RE = /\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?\s*[-–→⟶]\s*\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?\s*(?:st|server\s*time)\s*[:\-→⟶]\s*([^│|\n,]{2,50})/gi

// "6 PM ST – 8 PM ST → DJ Name" - ST embedded between each time, arrow before name
const RANGE_WITH_ST_ARROW = /\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:st|gmt[+-]\d+)\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:st|gmt[+-]\d+)\s*[→⟶➤]\s*([^│|\n]{2,50})/gi

// "17:00 → 18:00 ST - Ti Beats" - arrow between times, dash before name
const ARROW_RANGE_NAME = /\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[→⟶➤]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:st|gmt[+-]\d+)?\s*[-:]\s*([^│|\n]{2,50})/gi

// "HH:MM - Name" single time after a DJ lineup header
const SINGLE_TIME_NAME = /^\d{1,2}:\d{2}\s*[-–]\s*([^\n]{2,50})$/gm

// "🎧 Name — time" - name comes before em/en dash (Ninja's Hideaway format)
// Matches any optional leading non-word char (emoji/bullet), then a name starting with a letter
const NAME_BEFORE_DASH = /^\s*\S?\s*([A-Za-z'][A-Za-z0-9\s']{1,38}?)\s*[—–]\s*\d{1,2}:\d{2}/gmu

// "Time: 7:00 PM - 11:00 PM GMT+1" - GMT offset time line
const GMT_TIME_LINE = /time[:\s]+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*gmt([+-]\d+)/i

// "HH:MM  Name" single time + 2+ spaces (no dash), used in some DJ lineup formats
const SINGLE_TIME_SPACE_NAME = /^\d{1,2}:\d{2}\s{2,}([^\n]{2,50})$/gm

// "time ST – time ST" range (ST after each time, not just at end)
const SLOT_INLINE_ST_RE = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:st|gmt[+-]\d+)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:st|gmt[+-]\d+)/gi

function cleanDJName(name: string): string {
  return name
    .replace(/:[a-zA-Z0-9_]+:/g, '')  // strip :discord_emoji:
    .replace(/\*+/g, '')               // strip markdown **
    .replace(/﻿/g, '')                 // strip zero-width non-breaking space
    .trim()
}

function gmtToST(timeStr: string, offset: number): string {
  const m = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!m) return timeStr
  let h = parseInt(m[1])
  const mins = m[2] ? parseInt(m[2]) : 0
  const ap = m[3].toLowerCase()
  if (ap === 'pm' && h !== 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  h = (h - offset + 24) % 24
  return `${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

function isLineupHeader(l: string): boolean {
  return /dj\s*line[-\s]?up|dj\s*line|lineup/i.test(l)
}

function isSection(l: string): boolean {
  return isLineupHeader(l) || /^(music|soundscape|dj)s?\s*(by|lineup|schedule)/i.test(l)
}

function stripCommand(text: string): string {
  return text.replace(/^\/sh\s+/i, '')
}

function extractEventName(text: string): string | undefined {
  const presents = text.match(PRESENTS)
  if (presents) return presents[1].trim()

  const starred = text.match(STARRED_NAME)
  if (starred && !/\d/.test(starred[1]) && !isLineupHeader(starred[1])) return starred[1].trim()

  const firstAllCaps = text.split(/[│|\n]/).map(s => s.trim()).find(s => {
    const clean = s.replace(/[^\w\s]/g, '').trim()
    return clean.length >= 6 && clean === clean.toUpperCase() && /[A-Z]{2,}/.test(clean) && !isSection(clean)
  })
  if (firstAllCaps) return firstAllCaps.replace(/^[^\w]+|[^\w!]+$/g, '').trim()

  return undefined
}

function extractVenueName(text: string): string | undefined {
  const atMatch = text.match(AT_VENUE)
  if (atMatch) return atMatch[1].trim()

  const bold = text.match(/\*\*([^*]{3,40})\*\*/)
  if (bold) return bold[1].trim()

  const decorated = text.match(DECORATED_NAME)
  if (decorated && !/\d/.test(decorated[1]) && !isLineupHeader(decorated[1])) return decorated[1].trim()

  const candidate = text.split('\n').find(l => {
    const t = l.trim()
    return t.length > 3 && t.length < 60 && !t.startsWith('http') && !/^[^\w]{3,}$/.test(t)
  })
  if (!candidate) return undefined
  return candidate.trim().replace(/\s+presents[\s…….]*/i, '').trim()
}

function extractTime(text: string): string | undefined {
  // Standard slots: "(time)-(time) ST"
  const slots = [...text.matchAll(SLOT_RE)]
  if (slots.length >= 2) return `${slots[0][1].trim()}-${slots[slots.length - 1][2].trim()} ST`
  if (slots.length === 1) return `${slots[0][1].trim()}-${slots[0][2].trim()} ST`

  // "time ST – time ST" (ST embedded after each time)
  const inlineStSlots = [...text.matchAll(SLOT_INLINE_ST_RE)]
  if (inlineStSlots.length >= 2) return `${inlineStSlots[0][1].trim()}-${inlineStSlots[inlineStSlots.length - 1][2].trim()} ST`
  if (inlineStSlots.length === 1) return `${inlineStSlots[0][1].trim()}-${inlineStSlots[0][2].trim()} ST`

  const rangeMatch = text.match(TIME_RANGE_ST)
  if (rangeMatch) return `${rangeMatch[1].trim()}-${rangeMatch[2].trim()} ST`

  const single = text.match(TIME_SINGLE_ST)
  if (single) return `${single[1].trim()} ST`

  // "Time: 7:00 PM - 11:00 PM GMT+1" — convert offset to ST
  const gmtLine = text.match(GMT_TIME_LINE)
  if (gmtLine) {
    const offset = parseInt(gmtLine[3])
    return `${gmtToST(gmtLine[1], offset)}-${gmtToST(gmtLine[2], offset)} ST`
  }

  // Derive range from DJ slot start times: "19:00  Name" / "18:00 - Name"
  const slotTimes = [...text.matchAll(/^(\d{1,2}:\d{2})\s*(?:[-–]\s*\S|\s{2,}\S)/gm)]
    .map(m => m[1])
  if (slotTimes.length >= 2) {
    return `${slotTimes[0]}-${slotTimes[slotTimes.length - 1]} ST`
  }

  return undefined
}

function extractDJs(text: string): string {
  // "Music by:", "Soundscape curated by:" etc. - skip if content looks like a schedule or emoji-only
  const musicBy = text.match(MUSIC_KEYWORD)
  if (musicBy) {
    const raw = musicBy[1].trim()
    // Skip if starts with a time, emoji, or markdown (e.g. "🎵**" after "Music By 🎵**")
    if (!/^\d{1,2}[:→]/.test(raw) && /[A-Za-z]/.test(raw)) {
      const names = raw.split(/[•·,|│]+/)
        .map(n => cleanDJName(n))
        .filter(n => n && !n.startsWith('http') && n.length < 60 && /[A-Za-z]/.test(n))
      if (names.length) return names.join(', ')
    }
  }

  const clean = (n: string) => cleanDJName(n)
  const validDJ = (n: string) => n && !n.startsWith('http') && n.length < 60 && /[A-Za-z]/.test(n)

  // "6 PM ST – 8 PM ST → DJ Name"
  const rangeStArrow = [...text.matchAll(RANGE_WITH_ST_ARROW)]
    .map(m => clean(m[1])).filter(validDJ)
  if (rangeStArrow.length) return rangeStArrow.join(', ')

  // "time ST: Name" or "5-7 ST → Name" inline
  const inlineSlots = [...text.matchAll(INLINE_SLOT_RE)]
    .map(m => clean(m[1])).filter(validDJ)
  if (inlineSlots.length) return inlineSlots.join(', ')

  // "17:00 → 18:00 ST - Ti Beats"
  const arrowNames = [...text.matchAll(ARROW_RANGE_NAME)]
    .map(m => clean(m[1])).filter(validDJ)
  if (arrowNames.length) return arrowNames.join(', ')

  // Multiline slot blocks: "5-7pm ST\nName\nurl"
  const slotNames = [...text.matchAll(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?[-–]\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*st\s*\n([^\n]+)/gi)]
    .map(m => clean(m[1])).filter(validDJ)
  if (slotNames.length) return slotNames.join(', ')

  // "HH:MM - Name" single-time with dash
  const singleDash = [...text.matchAll(SINGLE_TIME_NAME)]
    .map(m => clean(m[1])).filter(validDJ)
  if (singleDash.length) return singleDash.join(', ')

  // "HH:MM  Name" single-time with double space (no dash)
  const singleSpace = [...text.matchAll(SINGLE_TIME_SPACE_NAME)]
    .map(m => clean(m[1])).filter(validDJ)
  if (singleSpace.length) return singleSpace.join(', ')

  // Pipe/bullet segments containing ♪DJ
  const segments = text.split(/[│|•·]/)
  const djSegments = segments
    .map(s => s.trim())
    .filter(s => /^[♪♫🎵🎶]?\s*DJ\s+\w/i.test(s) && !isSection(s) && s.length < 60 && !s.startsWith('http'))
    .map(s => s.replace(/^[♪♫🎵🎶]\s*/u, '').trim())
  if (djSegments.length) return djSegments.join(', ')

  // "🎧 Name — time" (name before dash, Ninja's format)
  const nameFirst = [...text.matchAll(NAME_BEFORE_DASH)]
    .map(m => m[1].trim().replace(/^[🎧♪♫🎵🎶✦•\s]+/u, '').trim())
    .filter(n => n && !n.startsWith('http') && n.length < 60)
  if (nameFirst.length) return nameFirst.join(', ')

  // Fallback: lines starting with "DJ "
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => /^DJ\s+\w/i.test(l) && !isSection(l) && l.length < 60 && !l.startsWith('http'))
    .join(', ')
}

export function parseDiscordPost(rawText: string): ParsedEvent {
  const text = stripCommand(rawText)
  const result: ParsedEvent = {}

  const world = findWorld(text)
  // Find first DC that appears in the text AND is not just a DJ name (e.g. "DJ Gaia")
  const dc = ALL_DATACENTERS.find(dcName => {
    if (!text.toLowerCase().includes(dcName.toLowerCase())) return false
    return !new RegExp(`\\bDJ\\s+${dcName}\\b`, 'i').test(text)
  })
  if (world || dc) result.server = [dc, world].filter(Boolean).join(' ')

  const wardMatch = text.match(WARD_PLOT)
  if (wardMatch) result.location = `W${wardMatch[1]} P${wardMatch[2]}`

  const time = extractTime(text)
  if (time) result.openTime = time

  const eventName = extractEventName(text)
  if (eventName) result.tagline = eventName

  const venueName = extractVenueName(text)
  if (venueName && venueName !== eventName) result.venueName = venueName

  const djs = extractDJs(text)
  if (djs) result.djs = djs

  // Extract Discord + Partake links
  const discord = text.match(/discord\.gg\/\S+/i)?.[0]
  const partake = text.match(/partake\.gg\/events?\/\d+/i)?.[0]
  const linkParts = [partake, discord].filter(Boolean)
  if (linkParts.length) result.links = linkParts.join(' | ')

  return result
}
