import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { displayName } = await req.json()
  if (!displayName || typeof displayName !== "string" || displayName.trim().length < 1) {
    return NextResponse.json({ error: "Display name is required" }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { displayName: displayName.trim() },
    select: { id: true, displayName: true },
  })

  return NextResponse.json(user)
}
