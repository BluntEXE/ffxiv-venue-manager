import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { validateApiKey, checkPermission } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"

/**
 * POST /api/plugin/shifts/clock-out
 *
 * Clock out of an active shift. Sets actualEnd to now and status to
 * COMPLETED. Only the assigned staff member can clock out.
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
      return NextResponse.json(
        { error: "shiftId is required" },
        { status: 400 }
      )
    }

    const shift = await prisma.shift.findUnique({
      where: { id: parsed.data.shiftId },
      include: { membership: true },
    })

    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 })
    }

    if (!auth.venues.includes(shift.venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    if (shift.membership?.userId !== auth.userId) {
      return NextResponse.json(
        { error: "This shift is not assigned to you" },
        { status: 403 }
      )
    }

    const canClock = await checkPermission(
      auth.userId,
      shift.venueId,
      "clock_shift"
    )
    if (!canClock) {
      return NextResponse.json(
        { error: "You do not have permission to clock shifts" },
        { status: 403 }
      )
    }

    if (shift.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Cannot clock out — shift is already ${shift.status.toLowerCase()}` },
        { status: 400 }
      )
    }

    const now = new Date()

    // Calculate hours worked from actual timestamps
    const calculatedHours = shift.actualStart
      ? (now.getTime() - shift.actualStart.getTime()) / (1000 * 60 * 60)
      : null
    const roundedHours = calculatedHours !== null
      ? Math.round(calculatedHours * 100) / 100
      : null

    const writeResult = await prisma.shift.updateMany({
      where: { id: shift.id, status: "ACTIVE" },
      data: { actualEnd: now, status: "COMPLETED", hoursWorked: roundedHours },
    })

    if (writeResult.count === 0) {
      const current = await prisma.shift.findUnique({ where: { id: shift.id } })
      return NextResponse.json(
        { error: `Cannot clock out — shift is already ${current?.status.toLowerCase() ?? "unknown"}` },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      shift: {
        id: shift.id,
        actualStart: shift.actualStart?.toISOString() ?? null,
        actualEnd: now.toISOString(),
        status: "COMPLETED",
        hoursWorked: roundedHours,
      },
    })
  } catch (error) {
    console.error("[Plugin API] Error clocking out:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
