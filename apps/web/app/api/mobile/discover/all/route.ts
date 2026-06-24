// apps/web/app/api/mobile/discover/all/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const dc = req.nextUrl.searchParams.get("dc") ?? undefined
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      ...(dc ? { dataCenter: dc } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      dataCenter: true,
      world: true,
      location: true,
      logoUrl: true,
      bannerUrl: true,
      shifts: {
        where: {
          OR: [
            {
              status: "ACTIVE",
              scheduledStart: { lte: now },
              scheduledEnd: { gte: now },
            },
            {
              status: "SCHEDULED",
              scheduledStart: { gt: now, lte: endOfDay },
            },
          ],
        },
        select: {
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
        },
      },
      _count: {
        select: {
          shifts: {
            where: {
              status: "ACTIVE",
              scheduledStart: { lte: now },
              scheduledEnd: { gte: now },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  })

  const mapped = venues.map((v) => {
    const activeShift = v.shifts.find((s) => s.status === "ACTIVE")
    const tonightShift = v.shifts.find((s) => s.status === "SCHEDULED")
    return {
      id: v.id,
      name: v.name,
      slug: v.slug,
      dataCenter: v.dataCenter,
      world: v.world,
      location: v.location,
      logoUrl: v.logoUrl,
      bannerUrl: v.bannerUrl,
      openSince: activeShift
        ? (activeShift.actualStart ?? activeShift.scheduledStart)
        : null,
      scheduledEnd:
        activeShift?.scheduledEnd ?? tonightShift?.scheduledEnd ?? null,
      staffOnShift: activeShift ? v._count.shifts : null,
      nextOpen: tonightShift?.scheduledStart ?? null,
    }
  })

  // Sort: open now first, tonight next, alphabetical last
  mapped.sort((a, b) => {
    const aOpen = a.openSince != null
    const bOpen = b.openSince != null
    const aTonight = a.nextOpen != null
    const bTonight = b.nextOpen != null
    if (aOpen && !bOpen) return -1
    if (!aOpen && bOpen) return 1
    if (aTonight && !bTonight) return -1
    if (!aTonight && bTonight) return 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json(mapped)
}
