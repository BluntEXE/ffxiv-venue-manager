import { NextRequest, NextResponse } from "next/server"
import { pluginAuthGate } from "@/lib/api/plugin-auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const gate = await pluginAuthGate(request, "read")
    if (!gate.ok) return gate.response
    const { auth } = gate

    const memberships = await prisma.membership.findMany({
      where: { userId: auth.userId, status: "active" },
      include: {
        venue: { select: { id: true, name: true, slug: true, froggeToken: true } },
      },
    })

    let venues = memberships
      .filter((m) => auth.venues.includes(m.venue.id))
      .map((m) => ({
        id: m.venue.id,
        name: m.venue.name,
        slug: m.venue.slug,
        role: m.role,
        froggeConnected: !!m.venue.froggeToken,
      }))

    if (auth.venues.length === 1) {
      venues = venues.filter((v) => v.id === auth.venues[0])
    }

    return NextResponse.json({ venues })
  } catch (error) {
    console.error("[Plugin API] Error fetching venues:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
