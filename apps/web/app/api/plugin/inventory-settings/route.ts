import { NextRequest, NextResponse } from "next/server"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/plugin/inventory-settings?venueId=…
 *
 * Read-only enabled flag for the plugin's Inventory tab nav icon.
 * Any active staff can read this (no OWNER/MANAGER gate) — same tier
 * as GET /api/plugin/services, which any active member can call.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get("venueId")
    if (!venueId || !auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    const settings = await prisma.venueInventorySettings.findUnique({
      where: { venueId },
      select: { enabled: true },
    })

    return NextResponse.json({ enabled: settings?.enabled ?? false })
  } catch (error) {
    console.error("[Plugin API] Error fetching inventory settings:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
