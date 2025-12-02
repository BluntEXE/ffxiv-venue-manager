import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

// POST /api/feedback - Submit new feedback
export const POST = withRateLimit(
  async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const body = await request.json()
      const { category, subject, description, url } = body

      // Validate required fields
      if (!category || !subject || !description) {
        return NextResponse.json(
          { error: "Missing required fields: category, subject, description" },
          { status: 400 }
        )
      }

      // Validate category
      const validCategories = ["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"]
      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { error: "Invalid category. Must be one of: BUG_REPORT, FEATURE_REQUEST, IMPROVEMENT, GENERAL" },
          { status: 400 }
        )
      }

      // Get user agent for context
      const userAgent = request.headers.get("user-agent") || undefined

      // Create feedback entry
      const feedback = await prisma.feedback.create({
        data: {
          userId: session.user.id,
          category,
          subject,
          description,
          url,
          userAgent,
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
        },
      })

      // TODO: Optional - Send Discord webhook notification for new feedback
      // This can be added later to notify admins of new feedback

      return NextResponse.json(feedback, { status: 201 })
    } catch (error) {
      console.error("Error creating feedback:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 5, window: "1 m" } // Strict rate limiting to prevent spam
)

// GET /api/feedback - List all feedback (admin only - for future implementation)
export const GET = withRateLimit(
  async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      // TODO: Add admin role check here when admin system is implemented
      // For now, any authenticated user can view their own feedback

      const searchParams = request.nextUrl.searchParams
      const userId = searchParams.get("userId")

      const feedback = await prisma.feedback.findMany({
        where: {
          userId: userId || session.user.id,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
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
      console.error("Error fetching feedback:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 30, window: "1 m" }
)
