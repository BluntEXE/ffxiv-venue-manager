import { NextResponse } from "next/server"
import { verifyMobileJwt } from "@/lib/auth/mobile-auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let userId: string
  try {
    const payload = await verifyMobileJwt(auth)
    userId = payload.sub
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let userId: string
  try {
    const payload = await verifyMobileJwt(auth)
    userId = payload.sub
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { token } = await req.json()
  await prisma.deviceToken.deleteMany({ where: { token, userId } })

  return NextResponse.json({ ok: true })
}
