import type { ParsedEvent } from '../types'

const PARTAKE_API = 'https://api.partake.gg/'

const QUERY = `
  query getEvent($id: Int!) {
    event(id: $id) {
      id
      title
      description
      tags
      ageRating
      location
      locationData {
        server { name }
        dataCenter { name }
      }
      startsAt
      endsAt
      team {
        name
      }
    }
  }
`

interface PartakeEventResponse {
  data?: {
    event?: {
      id: number
      title: string
      description: string | null
      tags: string[]
      ageRating: string
      location: string
      locationData: {
        server: { name: string }
        dataCenter: { name: string }
      }
      startsAt: string
      endsAt: string
      team: { name: string } | null
    }
  }
  errors?: Array<{ message: string }>
}

export function extractEventId(url: string): number | null {
  const match = url.match(/partake\.gg\/(?:events?|e)\/(\d+)/i)
  return match ? parseInt(match[1], 10) : null
}

function parseWardPlot(location: string): string {
  // "Ward 7...Plot 5" - allows any non-alphanumeric between keyword and number
  const match = location.match(/ward\s*[^a-zA-Z0-9]*(\d{1,2})[^a-zA-Z0-9]+plot\s*[^a-zA-Z0-9]*(\d{1,2})/i)
    // "W12 / P33", "W06 P30", "W7 P58" etc.
    ?? location.match(/\bw\s*(\d{1,2})\s*[,\s|/\-•·☆★♦]+\s*p\s*(\d{1,2})/i)
  if (match) return `W${match[1]} P${match[2]}`
  return location
}

function extractDJs(description: string | null): string {
  if (!description) return ''
  const text = description.replace(/!\[.*?\]\(.*?\)/g, '').trim()
  if (!text) return ''

  // Time-slot blocks: "5-7pm ST\nName\nurl" - catches names with or without DJ prefix
  const slotNames = [...text.matchAll(/\d{1,2}(?::\d{2})?\s*(?:am|pm)?[-–]\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:st)?\s*\n([^\n]+)/gi)]
    .map(m => m[1].trim())
    .filter(n => n && !n.startsWith('http') && n.length < 60)

  if (slotNames.length) return slotNames.join(', ')

  // Fallback: lines explicitly starting with DJ
  const djLines = text.split('\n').map(l => l.trim()).filter(l =>
    /^[♪♫🎵]?\s*DJ\s+\w/i.test(l) && l.length < 60 && !l.startsWith('http')
  )
  return djLines.map(l => l.replace(/^[♪♫🎵]\s*/u, '').trim()).join(', ')
}

function formatTime(startsAt: string, endsAt: string): string {
  const toST = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  }
  return `${toST(startsAt)}-${toST(endsAt)} ST`
}

export async function fetchPartakeEvent(eventId: number): Promise<ParsedEvent> {
  const res = await fetch(PARTAKE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { id: eventId } }),
  })

  if (!res.ok) throw new Error(`Partake API error: ${res.status}`)

  const json: PartakeEventResponse = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)

  const ev = json.data?.event
  if (!ev) throw new Error('Event not found')

  const djs = extractDJs(ev.description)
  const teamName = ev.team?.name ?? ''

  // Build links: always include Partake URL, add Discord if found in description
  const partakeUrl = `partake.gg/events/${ev.id}`
  const discordMatch = ev.description?.match(/discord\.gg\/\S+/i)?.[0]
  const links = [partakeUrl, discordMatch].filter(Boolean).join(' | ')

  // Strip venue name prefix from event title: "Ignite: Slasher Night" → "Slasher Night"
  let tagline = ev.title
  if (teamName && tagline.toLowerCase().startsWith(teamName.toLowerCase())) {
    tagline = tagline.slice(teamName.length).replace(/^[\s:–\-|•]+/, '').trim()
  }

  return {
    venueName: teamName,
    tagline,
    server: [ev.locationData?.dataCenter?.name, ev.locationData?.server?.name].filter(Boolean).join(' '),
    location: parseWardPlot(ev.location ?? ''),
    openTime: ev.startsAt ? formatTime(ev.startsAt, ev.endsAt) : '',
    isAdult: ev.ageRating?.toLowerCase().includes('18') ?? false,
    ...(djs && { djs }),
    links,
  }
}
