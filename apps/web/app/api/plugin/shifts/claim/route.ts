import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { validateApiKey } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"
import { hasOverlappingShift } from "@/lib/shift-overlap"

/**
 * POST /api/plugin/shifts/claim
 *
 * Claim an open shift. Any active member of the venue can claim an OPEN shift.
 * Uses optimistic locking — returns 409 if the shift was claimed concurrently.
 */
const bodySchema = z.object({
  shiftId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get("x-api-key")
    if (!apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, "write")
    if (limited) return limited

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "shiftId is required" }, { status: 400 })
    }

    const shift = await prisma.shift.findUnique({
      where: { id: parsed.data.shiftId },
    })

    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 })
    }

    if (!auth.venues.includes(shift.venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    if (shift.status !== "OPEN") {
      return NextResponse.json(
        { error: `Shift is already ${shift.status.toLowerCase()}` },
        { status: 400 }
      )
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, venueId: shift.venueId, status: "active" },
    })
    if (!membership) {
      return NextResponse.json({ error: "No active membership at this venue" }, { status: 403 })
    }

    if (await hasOverlappingShift(membership.id, shift.scheduledStart, shift.scheduledEnd, shift.id)) {
      return NextResponse.json(
        { error: "You already have a shift that overlaps this time" },
        { status: 400 }
      )
    }

    const result = await prisma.shift.updateMany({
      where: { id: shift.id, status: "OPEN" },
      data: { membershipId: membership.id, status: "CLAIMED" },
    })

    if (result.count === 0) {
      return NextResponse.json(
        { error: "This shift was just claimed by someone else" },
        { status: 409 }
      )
    }

    // Notify managers (best-effort)
    Promise.all([
      prisma.membership.findMany({
        where: { venueId: shift.venueId, status: "active", role: { in: ["OWNER", "MANAGER"] } },
        select: { userId: true },
      }),
      prisma.user.findUnique({
        where: { id: auth.userId },
        select: { displayName: true, name: true },
      }),
      prisma.venue.findUnique({
        where: { id: shift.venueId },
        select: { name: true },
      }),
    ]).then(([managers, claimant, venue]) => {
      const staffName = claimant?.displayName ?? claimant?.name ?? "A staff member"
      const venueName = venue?.name ?? "your venue"
      const shiftDate = shift.scheduledStart.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
      return prisma.pendingNotification.createMany({
        data: managers.filter(m => m.userId).map((m) => ({
          userId: m.userId!,
          type: "SHIFT_CLAIM_SUBMITTED" as const,
          title: "Shift claim pending",
          body: `${staffName} claimed the ${shiftDate} shift at ${venueName}.`,
          data: { venueId: shift.venueId, shiftId: shift.id },
          scheduledFor: new Date(),
        })),
      })
    }).catch(() => {})

    return NextResponse.json({ success: true, shift: { id: shift.id, status: "CLAIMED" } })
  } catch (error) {
    console.error("[Plugin API] Error claiming shift:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
