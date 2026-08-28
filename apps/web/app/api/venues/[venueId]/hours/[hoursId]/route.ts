import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import { updateHours, deleteHours, XvmApiError, xvmErrorMessage } from "@/lib/api/xvm-api"

const updateHoursSchema = z
  .object({
    label: z.string().trim().max(100).nullable().optional(),
    enabled: z.boolean().nullable().optional(),
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

type Context = { params: Promise<{ venueId: string; hoursId: string }> }

export const PATCH = withRateLimit<Context>(
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

    const { venueId, hoursId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updateHoursSchema>
    try {
      data = updateHoursSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const hours = await updateHours(token, gate.xvmApiVenueId!, Number(hoursId), data)
      return NextResponse.json(hours)
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[hours] PATCH error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<Context>(
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

    const { venueId, hoursId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deleteHours(token, gate.xvmApiVenueId!, Number(hoursId))
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[hours] DELETE error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 30, window: "1 m" }
)
