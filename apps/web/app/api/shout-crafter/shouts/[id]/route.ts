import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const SHOUT_ORIGIN = "https://shout.xivvenuemanager.com"

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", SHOUT_ORIGIN)
  res.headers.set("Access-Control-Allow-Credentials", "true")
  res.headers.set("Access-Control-Allow-Methods", "DELETE, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

  const shout = await prisma.shoutTemplate.findUnique({ where: { id } })
  if (!shout || shout.userId !== session.user.id) {
    return cors(NextResponse.json({ error: "Not found." }, { status: 404 }))
  }

  await prisma.shoutTemplate.delete({ where: { id } })
  return cors(NextResponse.json({ ok: true }))
}
