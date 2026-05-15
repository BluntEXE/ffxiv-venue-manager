import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { nanoid } from "nanoid"
import { hashApiKey } from "@/lib/api/plugin-auth"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get all API keys for the user (both account-wide and venue-scoped)
  const keys = await prisma.apiKey.findMany({
    where: {
      userId: session.user.id,
      revokedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      keyPreview: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
      venue: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  })

  // Plaintext keys are no longer stored; the keyPreview column holds
  // a pre-computed mask shown in the dashboard listing.
  const maskedKeys = keys.map((k) => ({ ...k, key: k.keyPreview }))

  return NextResponse.json({ keys: maskedKeys })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { venueId, name } = await request.json()

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  let venueResponse: { id: string; name: string; slug: string } | null = null

  if (venueId) {
    // Venue-scoped key: user must be OWNER of that specific venue
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: {
        memberships: {
          where: { userId: session.user.id, status: "active" },
        },
      },
    })

    if (
      !venue ||
      venue.memberships.length === 0 ||
      !["OWNER", "MANAGER", "STAFF"].includes(venue.memberships[0].role)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    venueResponse = { id: venue.id, name: venue.name, slug: venue.slug }
  } else {
    // Account-wide key: user must own at least one venue. This prevents
    // a freshly-signed-up user with zero venues from creating a key that
    // would match nothing at validate time.
    const ownerCount = await prisma.membership.count({
      where: {
        userId: session.user.id,
        status: "active",
        role: "OWNER",
      },
    })

    if (ownerCount === 0) {
      return NextResponse.json(
        { error: "You must own at least one venue to create an API key" },
        { status: 403 }
      )
    }
  }

  // Generate new API key. The plaintext key is returned to the user once
  // here and never again - we persist only the SHA-256 hash plus a
  // truncated keyPreview for the dashboard listing.
  const key = "vm_" + nanoid(32)
  const keyHash = hashApiKey(key)
  const keyPreview = key.substring(0, 8) + "..." + key.substring(key.length - 4)

  const apiKey = await prisma.apiKey.create({
    data: {
      id: nanoid(),
      keyHash,
      keyPreview,
      name: name.trim(),
      userId: session.user.id,
      venueId: venueId ?? null,
    },
  })

  return NextResponse.json({
    id: apiKey.id,
    key,
    name: apiKey.name,
    venue: venueResponse,
    createdAt: apiKey.createdAt.toISOString(),
  })
}
