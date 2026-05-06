// Persists a one-shot action to execute after auth completes
import * as SecureStore from 'expo-secure-store'

const KEY = 'pending_post_auth_action'

export type PendingAction = {
  type: 'follow_venue'
  venueId: string
  returnTo: string
}

export async function setPendingAction(action: PendingAction) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(action))
}

export async function getPendingAction(): Promise<PendingAction | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function clearPendingAction() {
  await SecureStore.deleteItemAsync(KEY)
}
