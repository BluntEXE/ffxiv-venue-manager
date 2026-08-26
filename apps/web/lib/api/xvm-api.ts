const XVM_API_BASE_URL = process.env.XVM_API_BASE_URL
const XVM_API_DASHBOARD_SERVICE_TOKEN = process.env.XVM_API_DASHBOARD_SERVICE_TOKEN

// ── Types ──────────────────────────────────────────────────────

export interface Credential {
  id: number
  kind: string
  client: string
  name: string
  preview: string
  venue_id: string | null
  issued_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

export interface CredentialIssued {
  secret: string
  credential: Credential
}

export interface MePerson {
  id: number
  display_name: string
}

export interface MeMembership {
  venue_id: string
  tier: string
}

export interface Me {
  kind: string
  client: string
  name: string
  venue_narrow: string | null
  person: MePerson | null
  memberships: MeMembership[]
}

// ── Internal fetch helper ──────────────────────────────────────

async function xvmFetch<T>(path: string, options: RequestInit = {}, bearerToken?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (bearerToken) {
    headers["Authorization"] = `Bearer ${bearerToken}`
  }
  const res = await fetch(`${XVM_API_BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`xvm-api ${path} → ${res.status}: ${body}`)
  }
  return res.status === 204 ? (null as T) : res.json()
}

// ── Auth ───────────────────────────────────────────────────────

export async function exchangeToken(externalId: string, displayName: string): Promise<CredentialIssued> {
  return xvmFetch<CredentialIssued>(
    "/internal/tokens/exchange",
    {
      method: "POST",
      body: JSON.stringify({ provider: "discord", external_id: externalId, display_name: displayName }),
    },
    XVM_API_DASHBOARD_SERVICE_TOKEN
  )
}

// ── Person API ─────────────────────────────────────────────────

export async function getMe(personToken: string): Promise<Me> {
  return xvmFetch<Me>("/me", {}, personToken)
}

export async function listMyCredentials(personToken: string): Promise<Credential[]> {
  return xvmFetch<Credential[]>("/me/credentials", {}, personToken)
}

export async function revokeCredential(personToken: string, credentialId: number): Promise<Credential> {
  return xvmFetch<Credential>(`/me/credentials/${credentialId}/revoke`, { method: "POST" }, personToken)
}
