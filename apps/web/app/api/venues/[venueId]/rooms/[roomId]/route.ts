import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential } from "@/lib/api/xvm-api-store"
import { getRoom, updateRoom, deleteRoom, XvmApiError, xvmErrorMessage } from "@/lib/api/xvm-api"

const updateRoomSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  roomNumber: z.number().int().min(0).max(999).nullable().optional(),
  locked: z.boolean().optional(),
  disabled: z.boolean().optional(),
})

async function requireToken(userId: string) {
  const token = await getValidXvmApiToken(userId)
  if (!token) {
    return { error: NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }) }
  }
  return { token }
}

function parseRoomId(roomId: string) {
  const id = Number(roomId)
  return Number.isInteger(id) ? id : null
}

export const GET = withRateLimit<{
  params: Promise<{ venueId: string; roomId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const gate = await requireToken(session.user.id)
    if (gate.error) return gate.error

    const { venueId, roomId } = await context.params
    const id = parseRoomId(roomId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid room id" }, { status: 400 })
    }

    try {
      const room = await getRoom(gate.token!, venueId, id)
      return NextResponse.json(room)
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[rooms/:id] GET error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PATCH = withRateLimit<{
  params: Promise<{ venueId: string; roomId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const gate = await requireToken(session.user.id)
    if (gate.error) return gate.error

    const { venueId, roomId } = await context.params
    const id = parseRoomId(roomId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid room id" }, { status: 400 })
    }

    let data: Parameters<typeof updateRoom>[3]
    try {
      const body = await request.json()
      const parsed = updateRoomSchema.parse(body)
      data = {
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.notes !== undefined && { notes: parsed.notes }),
        ...(parsed.roomNumber !== undefined && { room_number: parsed.roomNumber }),
        ...(parsed.locked !== undefined && { locked: parsed.locked }),
        ...(parsed.disabled !== undefined && { disabled: parsed.disabled }),
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const room = await updateRoom(gate.token!, venueId, id, data)
      return NextResponse.json(room)
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[rooms/:id] PATCH error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<{
  params: Promise<{ venueId: string; roomId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const gate = await requireToken(session.user.id)
    if (gate.error) return gate.error

    const { venueId, roomId } = await context.params
    const id = parseRoomId(roomId)
    if (id === null) {
      return NextResponse.json({ error: "Invalid room id" }, { status: 400 })
    }

    try {
      await deleteRoom(gate.token!, venueId, id)
      return NextResponse.json({ success: true })
    } catch (err) {
      if (err instanceof XvmApiError && err.status !== 401) {
        return NextResponse.json({ error: xvmErrorMessage(err) }, { status: err.status })
      }
      console.error("[rooms/:id] DELETE error:", err)
      await invalidateXvmApiCredential(session.user.id)
      return NextResponse.json({ error: "xvm-api link needs to be refreshed" }, { status: 503 })
    }
  },
  { requests: 30, window: "1 m" }
)
