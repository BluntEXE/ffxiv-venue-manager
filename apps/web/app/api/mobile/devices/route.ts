import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const { token, platform = "android" } = await req.json()
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token required" }, { status: 400 })
  }

  await prisma.deviceToken.upsert({
    where: { token },
    update: { userId, platform, updatedAt: new Date() },
    create: { userId, token, platform },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const { token } = await req.json()
  await prisma.deviceToken.deleteMany({ where: { token, userId } })

  return NextResponse.json({ ok: true })
}
