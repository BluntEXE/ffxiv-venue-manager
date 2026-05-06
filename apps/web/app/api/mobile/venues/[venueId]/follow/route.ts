// POST   /api/mobile/venues/:venueId/follow   — follow
// DELETE /api/mobile/venues/:venueId/follow   — unfollow
// GET    /api/mobile/venues/:venueId/follow   — check follow status
import { NextResponse } from "next/server"
import { verifyMobileJwt } from "@/lib/auth/mobile-auth"
import { prisma } from "@/lib/prisma"

async function getUserId(req: Request) {
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!auth) return null
  try {
    const p = await verifyMobileJwt(auth)
    return p.sub
  } catch {
    return null
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ following: false })

  const follow = await prisma.venueFollow.findUnique({
    where: { userId_venueId: { userId, venueId } },
    select: { id: true, visibleToOperators: true },
  })

  return NextResponse.json({ following: !!follow, visibleToOperators: follow?.visibleToOperators ?? false })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Use global follow visibility preference as the default
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: { followVisibility: true },
  })
  const visibleToOperators = prefs?.followVisibility ?? false

  await prisma.venueFollow.upsert({
    where: { userId_venueId: { userId, venueId } },
    update: { visibleToOperators },
    create: { userId, venueId, visibleToOperators },
  })

  return NextResponse.json({ following: true })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params
  const userId = await getUserId(req)
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await prisma.venueFollow.deleteMany({ where: { userId, venueId } })
  return NextResponse.json({ following: false })
}
