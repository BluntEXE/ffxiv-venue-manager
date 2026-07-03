import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyBotAuth } from "@/lib/bot-auth"
import { checkPermission } from "@/lib/api/plugin-auth"
import { logShiftAudit } from "@/lib/shift-audit"
import { postShiftXp } from "@/lib/discord-feed"
import { syncVenueOpenStatus } from "@/lib/venue-status"

/**
 * POST /api/bot/shifts/clock-out
 *
 * Called by Aetherlink's /clockout command. Body: { discordId: string }.
 * Finds the caller's one ACTIVE shift (at most one, since shifts can't
 * overlap) and completes it.
 */
export async function POST(request: Request) {
  const authError = verifyBotAuth(request)
  if (authError) return authError

  const body = await request.json().catch(() => ({}))
  const discordId = typeof body.discordId === "string" ? body.discordId : null
  if (!discordId) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { discordId } })
  if (!user) {
    return NextResponse.json({ ok: false, code: "NOT_LINKED" })
  }

  const shift = await prisma.shift.findFirst({
    where: { membership: { userId: user.id }, status: "ACTIVE" },
    include: { venue: { select: { id: true, name: true } } },
  })

  if (!shift) {
    return NextResponse.json({ ok: false, code: "NO_SHIFT" })
  }

  const canClock = await checkPermission(user.id, shift.venueId, "clock_shift")
  if (!canClock) {
    return NextResponse.json({ ok: false, code: "FORBIDDEN" })
  }

  const now = new Date()
  const calculatedHours = shift.actualStart
    ? Math.round(((now.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)) * 100) / 100
    : null

  const writeResult = await prisma.shift.updateMany({
    where: { id: shift.id, status: "ACTIVE" },
    data: { actualEnd: now, status: "COMPLETED", hoursWorked: calculatedHours },
  })
  if (writeResult.count === 0) {
    return NextResponse.json({ ok: false, code: "CONFLICT" }, { status: 409 })
  }

  await logShiftAudit(shift.id, "CLOCK_OUT", user.id, "discord")
  postShiftXp(user.id, shift.venueId)
  syncVenueOpenStatus(shift.venueId).catch(() => {})

  return NextResponse.json({
    ok: true,
    venueName: shift.venue.name,
    hoursWorked: calculatedHours,
  })
}
