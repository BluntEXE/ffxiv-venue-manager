import { SignJWT, jwtVerify } from "jose"
import { nanoid } from "nanoid"
import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"

const secret = new TextEncoder().encode(process.env.MOBILE_JWT_SECRET!)
const REFRESH_EXPIRY_DAYS = 30

export type MobileJwtPayload = {
  sub: string
  email: string | null
  name: string | null
  image: string | null
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export async function signMobileJwt(payload: MobileJwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret)
}

export async function verifyMobileJwt(token: string): Promise<MobileJwtPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as unknown as MobileJwtPayload
}

export async function issueRefreshToken(
  userId: string,
  deviceLabel?: string
): Promise<string> {
  const raw = nanoid(64)
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 86_400_000)

  await prisma.refreshToken.create({
    data: { id: nanoid(), userId, tokenHash: hashToken(raw), deviceLabel, expiresAt },
  })

  return raw
}

export async function rotateRefreshToken(
  raw: string,
  deviceLabel?: string
): Promise<{ userId: string; newRaw: string } | null> {
  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  })

  if (!token || token.revokedAt || token.expiresAt < new Date()) return null

  await prisma.refreshToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date() },
  })

  const newRaw = await issueRefreshToken(token.userId, deviceLabel)
  return { userId: token.userId, newRaw }
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
