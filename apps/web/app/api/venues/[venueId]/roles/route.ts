import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import { listPositions, createPosition, XvmApiError, xvmErrorMessage, type PositionRow } from "@/lib/api/xvm-api"
import { hexColorToInt, intColorToHex, dollarsToMinorUnits, minorUnitsToDollars } from "@/lib/api/position-convert"
import { validators } from "@/lib/validation"

const createRoleSchema = z.object({
  name: validators.roleName,
  responsibilities: validators.roleDescription,
  color: z.string().optional(),
  hourlyRate: z.number().positive().nullable().optional(),
})

// Matches the shape staff/roles/page.tsx already expects, so the page needs
// no logic changes — just its TypeScript types (id: string -> number).
function toRoleShape(position: PositionRow) {
  return {
    id: position.id,
    name: position.name,
    color: intColorToHex(position.color),
    responsibilities: position.responsibilities,
    hourlyRate: minorUnitsToDollars(position.hourly_rate_minor),
    potPayoutMode: position.pot_payout_mode,
    contractorSharesPot: position.contractor_shares_pot,
    permissions: null,
    _count: { memberships: position.member_ids.length },
  }
}

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const positions = await listPositions(token, gate.xvmApiVenueId!)
      return NextResponse.json(positions.map(toRoleShape))
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[roles] GET error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof createRoleSchema>
    try {
      data = createRoleSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const position = await createPosition(token, gate.xvmApiVenueId!, {
        name: data.name,
        color: data.color ? hexColorToInt(data.color) : null,
        responsibilities: data.responsibilities ?? null,
        hourly_rate_minor: dollarsToMinorUnits(data.hourlyRate ?? null),
      })
      return NextResponse.json(toRoleShape(position), { status: 201 })
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[roles] POST error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 10, window: "1 m" }
)
