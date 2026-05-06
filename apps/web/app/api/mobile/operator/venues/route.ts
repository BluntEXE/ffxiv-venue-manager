// GET /api/mobile/operator/venues
// Returns all venues where the authenticated user is OWNER or MANAGER
import { NextResponse } from "next/server"
import { verifyMobileJwt } from "@/lib/auth/mobile-auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "")
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let userId: string
  try {
    const payload = await verifyMobileJwt(auth)
    userId = payload.sub
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      status: "active",
      role: { in: ["OWNER", "MANAGER"] },
    },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          dataCenter: true,
          world: true,
        },
      },
    },
  })

  return NextResponse.json(
    memberships.map((m) => ({ ...m.venue, role: m.role }))
  )
}
