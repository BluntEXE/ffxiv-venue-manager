const API = 'https://xivvenuemanager.com/api/shout-crafter/me'

interface XivVMUser {
  id: string
  name: string | null
  image: string | null
}

interface XivVMVenue {
  id: string
  name: string
  slug: string
}

export interface XivVMSession {
  user: XivVMUser | null
  venues: XivVMVenue[]
}

export async function fetchSession(): Promise<XivVMSession> {
  try {
    const res = await fetch(API, { credentials: 'include' })
    if (!res.ok) return { user: null, venues: [] }
    return await res.json()
  } catch {
    return { user: null, venues: [] }
  }
}
