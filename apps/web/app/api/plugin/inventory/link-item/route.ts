import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"

const linkItemSchema = z.object({
  venueId: z.string().min(1, "venueId is required"),
  serviceId: z.string().min(1, "serviceId is required"),
  itemId: z.number().int().positive("itemId must be a positive integer"),
  itemName: z.string().min(1, "itemName is required").max(200, "Item name too long (max 200 characters)"),
  iconId: z.number().int().min(0).optional().nullable(),
})

/**
 * POST /api/plugin/inventory/link-item
 *
 * Link a Service to a real FFXIV item ID from the plugin's Inventory tab
 * (local Lumina search). OWNER/MANAGER only, same tier as editing a
 * Service from the dashboard.
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "write")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const body = await request.json()
    const { venueId, serviceId, itemId, itemName, iconId } = linkItemSchema.parse(body)

    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: auth.userId, venueId, status: "active" },
    })
    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "Owner or Manager role required" }, { status: 403 })
    }

    const service = await prisma.service.findFirst({ where: { id: serviceId, venueId } })
    if (!service) {
      return NextResponse.json({ error: "Service not found in this venue" }, { status: 404 })
    }

    await prisma.service.update({
      where: { id: serviceId },
      data: { linkedItemId: itemId, linkedItemName: itemName, linkedItemIcon: iconId ?? null },
    })

    await invalidateCache(cacheKeys.venueServices(venueId))

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    console.error("[Plugin API] Error linking item:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
