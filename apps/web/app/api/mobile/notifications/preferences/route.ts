import { NextResponse } from "next/server"
import { verifyMobileJwt } from "@/lib/auth/mobile-auth"
import { prisma } from "@/lib/prisma"

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!auth) return null
  try {
    return await verifyMobileJwt(auth)
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const payload = await getUser(req)
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: payload.sub },
    update: {},
    create: { userId: payload.sub },
  })

  return NextResponse.json(prefs)
}

export async function PATCH(req: Request) {
  const payload = await getUser(req)
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const allowed = ["shiftReminder", "venueOpenedNow", "eventReminder"] as const
  const data: Partial<Record<(typeof allowed)[number], boolean>> = {}
  for (const key of allowed) {
    if (typeof body[key] === "boolean") data[key] = body[key]
  }

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: payload.sub },
    update: data,
    create: { userId: payload.sub, ...data },
  })

  return NextResponse.json(prefs)
}
