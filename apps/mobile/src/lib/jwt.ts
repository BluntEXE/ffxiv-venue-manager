// Decode JWT payload client-side (payload is not secret, just base64url)
export function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1]
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return {}
  }
}
