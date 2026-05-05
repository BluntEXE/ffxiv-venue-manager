import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

// GET /api/admin/feedback - List all feedback (admin only)
export const GET = withRateLimit(
  async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      // Check if user is admin
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true },
      })

      if (!user?.isAdmin) {
        return NextResponse.json(
          { error: "Forbidden - Admin access required" },
          { status: 403 }
        )
      }

      const searchParams = request.nextUrl.searchParams
      const status = searchParams.get("status")
      const category = searchParams.get("category")

      const feedback = await prisma.feedback.findMany({
        where: {
          ...(status && { status: status as any }),
          ...(category && { category: category as any }),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              email: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      })

      return NextResponse.json(feedback)
    } catch (error) {
      console.error("Error fetching admin feedback:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 60, window: "1 m" }
)
