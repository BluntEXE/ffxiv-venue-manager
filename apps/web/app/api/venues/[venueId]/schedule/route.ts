import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const entrySchema = z.object({
  day:             z.number().int().min(0).max(6),
  startHour:       z.number().int().min(0).max(23),
  startMin:        z.number().int().min(0).max(59),
  endHour:         z.number().int().min(0).max(23).nullable().optional(),
  endMin:          z.number().int().min(0).max(59).nullable().optional(),
  crossesMidnight: z.boolean().default(false),
  interval:        z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).default("WEEKLY"),
  weekOfMonth:     z.number().int().min(1).max(5).nullable().optional(),
  commencing:      z.string().datetime().nullable().optional(),
  label:           z.string().max(50).nullable().optional(),
})

async function requireManager(venueId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { venueId, userId, role: { in: ["OWNER", "MANAGER"] }, status: "active" },
  })
  return !!membership
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params
  const entries = await prisma.venueScheduleEntry.findMany({
    where: { venueId },
    orderBy: [{ day: "asc" }, { startHour: "asc" }, { startMin: "asc" }],
  })
  return NextResponse.json(entries)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  if (!(await requireManager(venueId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = entrySchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 })

  const entry = await prisma.venueScheduleEntry.create({
    data: {
      venueId,
      ...body.data,
      commencing: body.data.commencing ? new Date(body.data.commencing) : null,
    },
  })
  return NextResponse.json(entry, { status: 201 })
}
