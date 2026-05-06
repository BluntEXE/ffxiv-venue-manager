import { NextResponse } from "next/server"
import { verifyMobileJwt } from "@/lib/auth/mobile-auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    await verifyMobileJwt(auth)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      shifts: {
        some: {
          status: "ACTIVE",
          scheduledStart: { lte: now },
          scheduledEnd: { gte: now },
        },
      },
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
          status: "ACTIVE",
          scheduledStart: { lte: now },
          scheduledEnd: { gte: now },
        },
        select: {
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
        },
        orderBy: { scheduledStart: "asc" },
        take: 1,
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

  const result = venues.map((v) => ({
    id: v.id,
    name: v.name,
    slug: v.slug,
    dataCenter: v.dataCenter,
    world: v.world,
    location: v.location,
    logoUrl: v.logoUrl,
    bannerUrl: v.bannerUrl,
    openSince: v.shifts[0]?.actualStart ?? v.shifts[0]?.scheduledStart ?? null,
    scheduledEnd: v.shifts[0]?.scheduledEnd ?? null,
    staffOnShift: v._count.shifts,
  }))

  return NextResponse.json(result)
}
