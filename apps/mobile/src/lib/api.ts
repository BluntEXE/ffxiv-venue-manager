// Shared authenticated fetch helper
import { getValidToken } from './auth'

const API = 'https://xivvenuemanager.com'

export async function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  const token = await getValidToken()
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  })
}
