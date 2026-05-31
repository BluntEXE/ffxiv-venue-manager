import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function getVenue(venueId: string) {
  return prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }], isActive: true },
    select: { id: true },
  })
}

export async function POST(_req: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  const venue = await getVenue(venueId)
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.venueFollow.upsert({
    where: { userId_venueId: { userId: session.user.id, venueId: venue.id } },
    create: { userId: session.user.id, venueId: venue.id },
    update: {},
  })

  return NextResponse.json({ following: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ venueId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  const venue = await getVenue(venueId)
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.venueFollow.deleteMany({
    where: { userId: session.user.id, venueId: venue.id },
  })

  return NextResponse.json({ following: false })
}
