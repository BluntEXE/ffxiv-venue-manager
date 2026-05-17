import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const { venueId } = await params

  const membership = await prisma.membership.findFirst({
    where: { userId, venueId, status: "active" },
  })
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this venue" }, { status: 403 })
  }

  const services = await prisma.service.findMany({
    where: { venueId, isActive: true },
    select: { id: true, name: true, price: true },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(services)
}
