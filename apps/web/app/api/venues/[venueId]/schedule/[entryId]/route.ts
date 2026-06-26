import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateSchema = z.object({
  day:            z.number().int().min(0).max(6).optional(),
  startHour:      z.number().int().min(0).max(23).optional(),
  startMin:       z.number().int().min(0).max(59).optional(),
  endHour:        z.number().int().min(0).max(23).nullable().optional(),
  endMin:         z.number().int().min(0).max(59).nullable().optional(),
  crossesMidnight:z.boolean().optional(),
  interval:       z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  weekOfMonth:    z.number().int().min(1).max(5).nullable().optional(),
  commencing:     z.string().datetime().nullable().optional(),
  label:          z.string().max(50).nullable().optional(),
})

async function requireManager(venueId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { venueId, userId, role: { in: ["OWNER", "MANAGER"] }, status: "active" },
  })
  return !!membership
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string; entryId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId, entryId } = await params
  if (!(await requireManager(venueId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = updateSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 })

  const existing = await prisma.venueScheduleEntry.findFirst({ where: { id: entryId, venueId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.venueScheduleEntry.update({
    where: { id: entryId },
    data: {
      ...body.data,
      commencing: body.data.commencing !== undefined
        ? (body.data.commencing ? new Date(body.data.commencing) : null)
        : undefined,
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ venueId: string; entryId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId, entryId } = await params
  if (!(await requireManager(venueId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const existing = await prisma.venueScheduleEntry.findFirst({ where: { id: entryId, venueId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.venueScheduleEntry.delete({ where: { id: entryId } })
  return new NextResponse(null, { status: 204 })
}
