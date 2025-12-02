import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  sendDiscordWebhook,
  formatStaffJoinedEmbed,
  getWebhookUrlForType,
  type VenueWebhookConfig,
} from "@/lib/discord-webhook"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "You must be signed in to accept an invite" },
        { status: 401 }
      )
    }

    const { token } = await params

    // Find membership by invite token
    const membership = await prisma.membership.findUnique({
      where: { inviteToken: token },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            slug: true,
            discordWebhookUrl: true,
            settings: true,
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

    // Check if user is already a member of this venue
    const existingMembership = await prisma.membership.findFirst({
      where: {
        userId: session.user.id,
        venueId: membership.venueId,
        status: "active",
      },
    })

    if (existingMembership) {
      return NextResponse.json(
        { error: "You are already a member of this venue" },
        { status: 409 }
      )
    }

    // Update membership: link user and activate
    const updatedMembership = await prisma.membership.update({
      where: { id: membership.id },
      data: {
        userId: session.user.id,
        status: "active",
        inviteToken: null, // Clear token after use
      },
      include: {
        venue: {
          select: {
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            name: true,
          },
        },
      },
    })

    // Send Discord webhook notification if configured
    const webhookConfig: VenueWebhookConfig = {
      discordWebhooks: (membership.venue.settings as any)?.discordWebhooks,
      webhooks: (membership.venue.settings as any)?.webhooks,
      discordWebhookUrl: membership.venue.discordWebhookUrl,
    }

    const webhookUrl = getWebhookUrlForType(webhookConfig, "staffJoined")
    if (webhookUrl) {
      const embed = formatStaffJoinedEmbed({
        name: session.user.name || null,
        role: membership.role,
      })

      // Send webhook asynchronously (don't wait for response)
      sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch(
        (error) => console.error("Failed to send Discord webhook:", error)
      )
    }

    return NextResponse.json({
      success: true,
      membership: {
        id: updatedMembership.id,
        role: updatedMembership.role,
      },
      venue: updatedMembership.venue,
    })
  } catch (error) {
    console.error("Error accepting invite:", error)
    return NextResponse.json(
      { error: "Failed to accept invite" },
      { status: 500 }
    )
  }
}
