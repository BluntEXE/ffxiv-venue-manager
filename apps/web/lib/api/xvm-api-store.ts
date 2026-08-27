import { prisma } from "@/lib/prisma"
import type { CredentialIssued } from "@/lib/api/xvm-api"

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
