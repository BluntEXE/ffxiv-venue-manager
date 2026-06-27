import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
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
      district: true,
      ward: true,
      plot: true,
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
    district: v.district,
    ward: v.ward,
    plot: v.plot,
    location: v.location,
    logoUrl: v.logoUrl,
    bannerUrl: v.bannerUrl,
    openSince: v.shifts[0]?.actualStart ?? v.shifts[0]?.scheduledStart ?? null,
    scheduledEnd: v.shifts[0]?.scheduledEnd ?? null,
    staffOnShift: v._count.shifts,
  }))

  return NextResponse.json(result)
}
