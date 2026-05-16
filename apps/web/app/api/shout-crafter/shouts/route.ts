import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const SHOUT_ORIGIN = "https://shout.xivvenuemanager.com"
const MAX_SHOUTS = 50

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", SHOUT_ORIGIN)
  res.headers.set("Access-Control-Allow-Credentials", "true")
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

  const shouts = await prisma.shoutTemplate.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, fields: true, templateId: true, separatorId: true, decorId: true, createdAt: true },
  })

  return cors(NextResponse.json(shouts))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

  const count = await prisma.shoutTemplate.count({ where: { userId: session.user.id } })
  if (count >= MAX_SHOUTS) return cors(NextResponse.json({ error: "Maximum saved shouts reached." }, { status: 400 }))

  const body = await req.json()
  const { label, fields, templateId, separatorId, decorId } = body
  if (!label?.trim() || !fields || !templateId) {
    return cors(NextResponse.json({ error: "Missing required fields." }, { status: 400 }))
  }

  const shout = await prisma.shoutTemplate.create({
    data: { userId: session.user.id, label: label.trim(), fields, templateId, separatorId: separatorId ?? "dot", decorId: decorId ?? "diamond" },
    select: { id: true, label: true, fields: true, templateId: true, separatorId: true, decorId: true, createdAt: true },
  })

  return cors(NextResponse.json(shout, { status: 201 }))
}
