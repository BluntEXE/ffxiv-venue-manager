import { prisma } from "@/lib/prisma"
import type { CredentialIssued } from "@/lib/api/xvm-api"
import { getMe } from "@/lib/api/xvm-api"

const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000 // 1 day

export async function upsertXvmApiCredential(userId: string, issued: CredentialIssued): Promise<void> {
  if (!issued.credential.expires_at) {
    throw new Error("xvm-api credential is missing expires_at")
  }
  const expiresAt = new Date(issued.credential.expires_at)
  await prisma.xvmApiCredential.upsert({
    where: { userId },
    create: { userId, token: issued.secret, credentialId: issued.credential.id, expiresAt },
    update: { token: issued.secret, credentialId: issued.credential.id, expiresAt },
  })
}

export async function getValidXvmApiToken(userId: string): Promise<string | null> {
  const row = await prisma.xvmApiCredential.findUnique({ where: { userId } })
  if (!row) return null
  if (row.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) return null
  return row.token
}

export async function invalidateXvmApiCredential(userId: string): Promise<void> {
  await prisma.xvmApiCredential.deleteMany({ where: { userId } })
}

/**
 * The signed-in user's xvm-api person id, lazily fetched via /me and cached
 * alongside the token on first use — avoids adding an xvm-api call to the
 * login/token-refresh path in lib/auth.ts, which deliberately never fails
 * login on xvm-api being down. Returns null if there's no valid token,
 * matching getValidXvmApiToken's contract.
 */
export async function getValidXvmApiPersonId(userId: string): Promise<number | null> {
  const token = await getValidXvmApiToken(userId)
  if (!token) return null

  const row = await prisma.xvmApiCredential.findUnique({ where: { userId }, select: { personId: true } })
  if (row?.personId != null) return row.personId

  const me = await getMe(token)
  if (!me.person) return null

  await prisma.xvmApiCredential.update({ where: { userId }, data: { personId: me.person.id } })
  return me.person.id
}
