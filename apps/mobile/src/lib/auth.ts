import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY   = 'mobile_jwt'
const REFRESH_KEY = 'mobile_refresh'
const EXPIRES_KEY = 'mobile_expires'

export type AuthTokens = {
  token:        string
  refreshToken: string
  expiresAt:    string
}

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY,   tokens.token)
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken)
  await SecureStore.setItemAsync(EXPIRES_KEY, tokens.expiresAt)
}

export async function loadTokens(): Promise<AuthTokens | null> {
  const [token, refreshToken, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
    SecureStore.getItemAsync(EXPIRES_KEY),
  ])
  if (!token || !refreshToken || !expiresAt) return null
  return { token, refreshToken, expiresAt }
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(EXPIRES_KEY),
  ])
}

export function isExpired(expiresAt: string): boolean {
  return Date.now() >= new Date(expiresAt).getTime() - 30_000 // 30s buffer
}
