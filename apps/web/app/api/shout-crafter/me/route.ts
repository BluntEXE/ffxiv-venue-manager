import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getPublicVenuesForIds } from "@/lib/api/xvm-api"

const SHOUT_ORIGIN = "https://shout.xivvenuemanager.com"

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", SHOUT_ORIGIN)
  res.headers.set("Access-Control-Allow-Credentials", "true")
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return cors(NextResponse.json({ user: null }, { status: 200 }))
  }

  const venues = await prisma.venue.findMany({
    where: { ownerId: session.user.id, isActive: true },
    select: { id: true, slug: true, xvmApiVenueId: true },
    orderBy: { slug: "asc" },
  })

  const xvmVenueIds = venues.map((v) => v.xvmApiVenueId).filter((id): id is string => id !== null)
  const profileByVenue = xvmVenueIds.length > 0 ? await getPublicVenuesForIds(xvmVenueIds) : {}

  const namedVenues = venues
    .map((v) => ({
      id: v.id,
      slug: v.slug,
      name: (v.xvmApiVenueId ? profileByVenue[v.xvmApiVenueId]?.name : undefined) ?? v.slug,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return cors(
    NextResponse.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        image: session.user.image,
      },
      venues: namedVenues,
    })
  )
}
