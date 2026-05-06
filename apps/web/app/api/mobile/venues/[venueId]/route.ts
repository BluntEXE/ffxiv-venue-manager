import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {

  const { venueId } = await params
  const now = new Date()

  const venue = await prisma.venue.findUnique({
    where: { id: venueId, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      dataCenter: true,
      world: true,
      location: true,
      logoUrl: true,
      bannerUrl: true,
      currencyName: true,
      shifts: {
        where: {
          status: { in: ["ACTIVE", "SCHEDULED"] },
          scheduledStart: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
          scheduledEnd: { gte: now },
        },
        select: {
          id: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
        },
        orderBy: { scheduledStart: "asc" },
        take: 20,
      },
      events: {
        where: {
          status: { in: ["PUBLISHED", "ACTIVE"] },
          endTime: { gte: now },
          startTime: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
        },
        select: {
          id: true,
          title: true,
          description: true,
          eventType: true,
          status: true,
          startTime: true,
          endTime: true,
        },
        orderBy: { startTime: "asc" },
        take: 10,
      },
    },
  })

  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(venue)
}
