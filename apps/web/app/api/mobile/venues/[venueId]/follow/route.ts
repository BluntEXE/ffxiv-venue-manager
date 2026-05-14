// POST   /api/mobile/venues/:venueId/follow   — follow
// DELETE /api/mobile/venues/:venueId/follow   — unfollow
// GET    /api/mobile/venues/:venueId/follow   — check follow status (returns false if unauthenticated)
import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params
  const result = await requireMobileAuth(req)
  const userId = isAuthFailure(result) ? null : result
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
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

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
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  await prisma.venueFollow.deleteMany({ where: { userId, venueId } })
  return NextResponse.json({ following: false })
}
