import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

async function requireAdmin(session: any) {
  if (!session?.user?.id) return false
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })
  return user?.isAdmin ?? false
}

export const DELETE = withRateLimit<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    try {
      const session = await getServerSession(authOptions)
      if (!await requireAdmin(session)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      const { id } = await context!.params
      await prisma.announcement.delete({ where: { id } })
      return NextResponse.json({ success: true })
    } catch (error) {
      console.error("Error deleting announcement:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)
