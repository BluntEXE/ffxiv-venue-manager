import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { validateApiKey, checkPermission } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"

/**
 * GET /api/plugin/shifts?venueId=X
 *
 * Return the authenticated user's upcoming and active shifts at the given
 * venue. Sorted by scheduledStart ascending so the next shift is first.
 * Includes shifts from the past 24 hours so the plugin can show a
 * "recent" section (useful if staff forgot to clock out).
 */
const querySchema = z.object({
  venueId: z.string().min(1),
})

export async function GET(request: NextRequest) {
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

    const limited = await enforcePluginRateLimit(apiKey, "read")
    if (limited) return limited

    const params = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = querySchema.safeParse(params)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "venueId query param is required" },
        { status: 400 }
      )
    }

    const { venueId } = parsed.data

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    const canView = await checkPermission(auth.userId, venueId, "view_shifts")
    if (!canView) {
      return NextResponse.json(
        { error: "You do not have permission to view shifts" },
        { status: 403 }
      )
    }

    // Find the user's membership at this venue to filter shifts
    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, venueId, status: "active" },
    })

    if (!membership) {
      return NextResponse.json({ error: "No active membership" }, { status: 403 })
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [shifts, openShifts] = await Promise.all([
      prisma.shift.findMany({
        where: {
          venueId,
          membershipId: membership.id,
          scheduledStart: { gte: oneDayAgo },
          status: { not: "CANCELLED" },
        },
        orderBy: { scheduledStart: "asc" },
        take: 20,
      }),
      prisma.shift.findMany({
        where: {
          venueId,
          status: "OPEN",
          scheduledEnd: { gte: new Date() },
        },
        include: { role: { select: { name: true } } },
        orderBy: { scheduledStart: "asc" },
        take: 50,
      }),
    ])

    return NextResponse.json({
      shifts: shifts.map((s) => ({
        id: s.id,
        scheduledStart: s.scheduledStart.toISOString(),
        scheduledEnd: s.scheduledEnd.toISOString(),
        actualStart: s.actualStart?.toISOString() ?? null,
        actualEnd: s.actualEnd?.toISOString() ?? null,
        status: s.status,
        notes: s.notes,
      })),
      openShifts: openShifts.map((s) => ({
        id: s.id,
        scheduledStart: s.scheduledStart.toISOString(),
        scheduledEnd: s.scheduledEnd.toISOString(),
        roleName: s.role?.name ?? null,
      })),
    })
  } catch (error) {
    console.error("[Plugin API] Error fetching shifts:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
