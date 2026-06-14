import type { ParsedEvent } from '../types'

const API = 'https://xivvenuemanager.com/api/shout-crafter/parse'

export async function fetchAiParse(text: string): Promise<ParsedEvent> {
  try {
    const res = await fetch(API, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}
