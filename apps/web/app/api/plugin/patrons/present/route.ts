import { NextRequest, NextResponse } from "next/server"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"

// ponytail: a plugin crash/log-out without an EXIT event would otherwise
// leave a character "present" forever. 12h bounds that - real venue
// sessions don't run longer. Revisit if that assumption breaks.
const STALE_CUTOFF_HOURS = 12

/**
 * GET /api/plugin/patrons/present?venueId=xxx
 *
 * Currently-present patrons, derived from PatronLog: for each character,
 * their latest ENTER/LEAVE/PRESENT row within the last 12h decides
 * whether they're still in. Same "currentlyIn" rule as logPatronVisit's
 * dedupe check in lib/api/plugin-auth.ts - keep both in sync if it changes.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get("venueId")
    if (!venueId) {
      return NextResponse.json({ error: "venueId is required" }, { status: 400 })
    }
    if (!auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Access denied to this venue" }, { status: 403 })
    }

    const cutoff = new Date(Date.now() - STALE_CUTOFF_HOURS * 60 * 60 * 1000)
    const rows = await prisma.patronLog.findMany({
      where: {
        venueId,
        action: { in: ["ENTER", "LEAVE", "PRESENT"] },
        timestamp: { gte: cutoff },
        characterName: { not: null },
        world: { not: null },
      },
      orderBy: { timestamp: "desc" },
      select: { characterName: true, world: true, action: true, timestamp: true, wasWorking: true },
    })

    const latestByCharacter = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      const key = `${row.characterName}::${row.world}`
      if (!latestByCharacter.has(key)) latestByCharacter.set(key, row)
    }

    const present = [...latestByCharacter.values()]
      .filter((row) => row.action === "ENTER" || row.action === "PRESENT")
      .map((row) => ({
        characterName: row.characterName as string,
        world: row.world as string,
        wasWorking: row.wasWorking,
        since: row.timestamp,
      }))

    return NextResponse.json({ venueId, count: present.length, present })
  } catch (error) {
    console.error("[Plugin API] Error fetching present patrons:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
