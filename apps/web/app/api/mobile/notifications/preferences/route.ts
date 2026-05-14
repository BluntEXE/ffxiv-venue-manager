import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })

  return NextResponse.json(prefs)
}

export async function PATCH(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const body = await req.json()
  const allowed = ["shiftReminder", "venueOpenedNow", "eventReminder", "followVisibility"] as const
  const data: Partial<Record<(typeof allowed)[number], boolean>> = {}
  for (const key of allowed) {
    if (typeof body[key] === "boolean") data[key] = body[key]
  }

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  })

  return NextResponse.json(prefs)
}
