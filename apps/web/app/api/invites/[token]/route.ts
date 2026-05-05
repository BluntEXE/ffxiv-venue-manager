import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    // Find membership by invite token
    const membership = await prisma.membership.findUnique({
      where: { inviteToken: token },
      include: {
        venue: {
          select: {
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
        user: {
          select: {
            name: true,
          },
        },
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: "Invalid invite link" },
        { status: 404 }
      )
    }

    // Check if invite has expired
    if (membership.inviteExpiresAt && membership.inviteExpiresAt < new Date()) {
      return NextResponse.json(
        { error: "This invite has expired" },
        { status: 410 }
      )
    }

    // Check if invite has already been accepted
    if (membership.status === "active" && membership.userId) {
      return NextResponse.json(
        { error: "This invite has already been accepted" },
        { status: 410 }
      )
    }

    // Get who invited them (the invitedBy user)
    let invitedByUser = null
    if (membership.invitedBy) {
      invitedByUser = await prisma.user.findUnique({
        where: { id: membership.invitedBy },
        select: { name: true },
      })
    }

    return NextResponse.json({
      invite: {
        venue: membership.venue,
        role: membership.role,
        invitedName: membership.invitedName,
        expiresAt: membership.inviteExpiresAt,
        invitedBy: invitedByUser || {},
      },
    })
  } catch (error) {
    console.error("Error fetching invite:", error)
    return NextResponse.json(
      { error: "Failed to fetch invite details" },
      { status: 500 }
    )
  }
}
