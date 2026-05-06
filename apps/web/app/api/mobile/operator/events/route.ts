// POST /api/mobile/operator/events — create event
import { NextResponse } from "next/server"
import { requireOperator, isOperatorContext } from "@/lib/mobile-operator-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const CreateSchema = z.object({
  venueId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  eventType: z.enum(["PERFORMANCE", "GAME_NIGHT", "SPECIAL", "SOCIAL", "PRIVATE", "OTHER"]),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
})

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const { venueId, title, description, eventType, startTime, endTime } = parsed.data
  const ctx = await requireOperator(req, venueId)
  if (!isOperatorContext(ctx)) return ctx

  const event = await prisma.event.create({
    data: {
      venueId,
      title,
      description: description ?? null,
      eventType,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: "PUBLISHED",
      timezone: "UTC",
      createdById: ctx.userId,
    },
    select: {
      id: true,
      title: true,
      eventType: true,
      status: true,
      startTime: true,
      endTime: true,
      description: true,
    },
  })

  return NextResponse.json(event, { status: 201 })
}
