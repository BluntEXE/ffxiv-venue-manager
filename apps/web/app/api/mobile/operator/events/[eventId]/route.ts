// GET    /api/mobile/operator/events/:eventId — fetch for editing
// PATCH  /api/mobile/operator/events/:eventId — edit
// DELETE /api/mobile/operator/events/:eventId — cancel
import { NextResponse } from "next/server"
import { requireOperator, isOperatorContext } from "@/lib/mobile-operator-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, venueId: true, title: true, description: true, eventType: true, status: true, startTime: true, endTime: true },
  })
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const ctx = await requireOperator(req, event.venueId)
  if (!isOperatorContext(ctx)) return ctx

  return NextResponse.json(event)
}

const EditSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { venueId: true, status: true },
  })
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (event.status === "CANCELLED") {
    return NextResponse.json({ error: "Cannot edit a cancelled event" }, { status: 400 })
  }

  const ctx = await requireOperator(req, event.venueId)
  if (!isOperatorContext(ctx)) return ctx

  const body = await req.json()
  const parsed = EditSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) data.title = parsed.data.title
  if (parsed.data.description !== undefined) data.description = parsed.data.description
  if (parsed.data.startTime !== undefined) data.startTime = new Date(parsed.data.startTime)
  if (parsed.data.endTime !== undefined) data.endTime = new Date(parsed.data.endTime)
  if (parsed.data.status !== undefined) data.status = parsed.data.status

  const updated = await prisma.event.update({
    where: { id: eventId },
    data,
    select: {
      id: true, title: true, eventType: true, status: true,
      startTime: true, endTime: true, description: true,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { venueId: true, status: true },
  })
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const ctx = await requireOperator(req, event.venueId)
  if (!isOperatorContext(ctx)) return ctx

  await prisma.event.update({
    where: { id: eventId },
    data: { status: "CANCELLED" },
  })

  return NextResponse.json({ ok: true })
}
