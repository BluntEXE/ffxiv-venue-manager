import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listHours, createHours } from "@/lib/api/xvm-api"

const createHoursSchema = z
  .object({
    label: z.string().trim().max(100).nullable().optional(),
    interval: z.enum(["weekly", "biweekly", "monthly_by_date", "monthly_by_weekday"]),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    day_of_month: z.number().int().min(1).max(31).nullable().optional(),
    week_of_month: z.number().int().min(-1).max(5).nullable().optional(),
    start_minute_of_day: z.number().int().min(0).max(1439),
    duration_minutes: z.number().int().min(1),
    timezone: z.string().trim().max(64).nullable().optional(),
    anchor_date: z.string(),
    ends_on: z.string().nullable().optional(),
    ends_after_count: z.number().int().min(1).max(5000).nullable().optional(),
  })
  .strict()

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
      const hours = await listHours(token, gate.xvmApiVenueId!)
      return NextResponse.json(hours)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[hours] GET error")
    }
  },
  { requests: 30, window: "1 m" }
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

    let data: z.infer<typeof createHoursSchema>
    try {
      data = createHoursSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const hours = await createHours(token, gate.xvmApiVenueId!, data)
      return NextResponse.json(hours)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[hours] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
