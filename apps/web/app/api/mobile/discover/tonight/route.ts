import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      shifts: {
        some: {
          status: "SCHEDULED",
          scheduledStart: { gt: now, lte: endOfDay },
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      dataCenter: true,
      world: true,
      district: true,
      ward: true,
      plot: true,
      location: true,
      logoUrl: true,
      bannerUrl: true,
      shifts: {
        where: {
          status: "SCHEDULED",
          scheduledStart: { gt: now, lte: endOfDay },
        },
        select: {
          scheduledStart: true,
          scheduledEnd: true,
        },
        orderBy: { scheduledStart: "asc" },
        take: 1,
      },
      _count: {
        select: {
          shifts: {
            where: {
              status: "SCHEDULED",
              scheduledStart: { gt: now, lte: endOfDay },
            },
          },
        },
      },
    },
    orderBy: [
      { shifts: { _count: "desc" } },
      { name: "asc" },
    ],
  })

  const result = venues.map((v) => ({
    id: v.id,
    name: v.name,
    slug: v.slug,
    dataCenter: v.dataCenter,
    world: v.world,
    district: v.district,
    ward: v.ward,
    plot: v.plot,
    location: v.location,
    logoUrl: v.logoUrl,
    bannerUrl: v.bannerUrl,
    nextOpen: v.shifts[0]?.scheduledStart ?? null,
    scheduledEnd: v.shifts[0]?.scheduledEnd ?? null,
    staffScheduled: v._count.shifts,
  }))

  return NextResponse.json(result)
}
