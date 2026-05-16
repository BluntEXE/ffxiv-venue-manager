import type { SavedShout } from '../types'

const KEY = 'shout-crafter:saved'
const MAX = 20

export function loadSaved(): SavedShout[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveShout(shout: SavedShout): void {
  const existing = loadSaved().filter(s => s.id !== shout.id)
  const updated = [shout, ...existing].slice(0, MAX)
  localStorage.setItem(KEY, JSON.stringify(updated))
}

export function deleteShout(id: string): void {
  const updated = loadSaved().filter(s => s.id !== id)
  localStorage.setItem(KEY, JSON.stringify(updated))
}
