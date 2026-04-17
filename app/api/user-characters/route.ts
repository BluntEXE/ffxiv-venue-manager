import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { nanoid } from "nanoid"

/**
 * GET /api/user-characters
 *
 * List the signed-in user's linked FFXIV characters. Used by the account
 * settings page and (indirectly) by logPatronVisit to classify staff vs
 * patron by active-shift state.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const characters = await prisma.userCharacter.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      characterName: true,
      world: true,
      isPrimary: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ characters })
}

/**
 * POST /api/user-characters
 * body: { characterName, world, isPrimary? }
 *
 * Link a character to the signed-in user. (characterName, world) is unique
 * across the whole table — if another user already claimed it, return 409
 * with a clear message instead of leaking Prisma error details.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const characterName = (body.characterName ?? "").trim()
  const world = (body.world ?? "").trim()
  const isPrimary = Boolean(body.isPrimary)

  if (!characterName || !world) {
    return NextResponse.json(
      { error: "characterName and world are required" },
      { status: 400 }
    )
  }

  // If marking this character as primary, demote any existing primary for
  // this user first. Done in a transaction so we can't end up with two
  // primaries if the create fails.
  try {
    const created = await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.userCharacter.updateMany({
          where: { userId: session.user.id, isPrimary: true },
          data: { isPrimary: false },
        })
      }
      return tx.userCharacter.create({
        data: {
          id: nanoid(),
          userId: session.user.id,
          characterName,
          world,
          isPrimary,
        },
        select: {
          id: true,
          characterName: true,
          world: true,
          isPrimary: true,
          createdAt: true,
        },
      })
    })

    return NextResponse.json({ character: created })
  } catch (err: any) {
    // P2002 = unique constraint violation on (characterName, world)
    if (err?.code === "P2002") {
      return NextResponse.json(
        {
          error:
            "That character is already linked to an account. If this is your character, contact support.",
        },
        { status: 409 }
      )
    }
    console.error("[user-characters POST] Error:", err)
    return NextResponse.json(
      { error: "Failed to link character" },
      { status: 500 }
    )
  }
}
