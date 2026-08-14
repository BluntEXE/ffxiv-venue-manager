import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateApiKey } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"
import { z } from "zod"
import { validators } from "@/lib/validation"

const linkCharacterSchema = z.object({
  characterName: validators.characterName,
  world: validators.world,
})

/**
 * POST /api/plugin/characters
 *
 * Links the calling API key's owner to an FFXIV character (name + world).
 * Unlike POST /api/user-characters (session-auth, manual web form), this is
 * x-api-key authenticated so a Dalamud plugin can push the locally-detected
 * character without the member re-logging into the website.
 *
 * Body: { characterName: string, world: string }
 */
export async function POST(request: NextRequest) {
  try {
    const ipLimited = await enforcePluginIpRateLimit(request)
    if (ipLimited) return ipLimited

    const apiKey = request.headers.get("x-api-key")
    if (!apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, "write")
    if (limited) return limited

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    let characterName: string
    let world: string
    try {
      const parsed = linkCharacterSchema.parse(body)
      characterName = parsed.characterName
      world = parsed.world
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      throw error
    }

    const existing = await prisma.userCharacter.findUnique({
      where: { characterName_world: { characterName, world } },
    })

    if (existing && existing.userId !== auth.userId) {
      return NextResponse.json(
        { error: "That character is already linked to a different account" },
        { status: 409 }
      )
    }

    if (existing) {
      // Already linked to this same user - idempotent no-op.
      return NextResponse.json({
        character: {
          id: existing.id,
          characterName: existing.characterName,
          world: existing.world,
          isPrimary: existing.isPrimary,
        },
      })
    }

    const created = await prisma.userCharacter.create({
      data: { userId: auth.userId, characterName, world },
      select: { id: true, characterName: true, world: true, isPrimary: true },
    })

    return NextResponse.json({ character: created }, { status: 201 })
  } catch (error) {
    console.error("Error linking character:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
