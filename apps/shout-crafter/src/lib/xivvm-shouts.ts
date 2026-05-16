import type { ShoutFields, TemplateId } from '../types'
import type { SeparatorId, DecorId } from './shout-templates'

const API = 'https://xivvenuemanager.com/api/shout-crafter/shouts'

export interface SavedShout {
  id: string
  label: string
  fields: ShoutFields
  templateId: TemplateId
  separatorId: SeparatorId
  decorId: DecorId
  createdAt: string
}

export async function fetchShouts(): Promise<SavedShout[]> {
  const res = await fetch(API, { credentials: 'include' })
  if (!res.ok) return []
  return res.json()
}

export async function saveShout(data: Omit<SavedShout, 'id' | 'createdAt'>): Promise<SavedShout | null> {
  const res = await fetch(API, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) return null
  return res.json()
}

export async function deleteShout(id: string): Promise<boolean> {
  const res = await fetch(`${API}/${id}`, { method: 'DELETE', credentials: 'include' })
  return res.ok
}
