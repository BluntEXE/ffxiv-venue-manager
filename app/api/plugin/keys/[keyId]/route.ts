import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { keyId } = await params

  const apiKey = await prisma.apiKey.findUnique({
    where: { id: keyId },
  })

  if (!apiKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Users can always revoke their own keys
  const isOwnKey = apiKey.userId === session.user.id

  // Venue owners can revoke any key scoped to their venue
  let isVenueOwner = false
  if (!isOwnKey && apiKey.venueId) {
    const venue = await prisma.venue.findUnique({
      where: { id: apiKey.venueId },
      include: {
        memberships: {
          where: { userId: session.user.id, status: "active", role: "OWNER" },
        },
      },
    })
    isVenueOwner = (venue?.memberships.length ?? 0) > 0
  }

  if (!isOwnKey && !isVenueOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Revoke the API key
  await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}