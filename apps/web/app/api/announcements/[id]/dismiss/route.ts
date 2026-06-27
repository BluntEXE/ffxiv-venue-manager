import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

export const POST = withRateLimit<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { id } = await context!.params

      await prisma.announcementDismissal.upsert({
        where: { userId_announcementId: { userId: session.user.id, announcementId: id } },
        create: { userId: session.user.id, announcementId: id },
        update: {},
      })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error("Error dismissing announcement:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)
