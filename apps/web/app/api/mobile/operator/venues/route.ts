// GET /api/mobile/operator/venues
// Returns all venues where the authenticated user is OWNER or MANAGER
import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

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
