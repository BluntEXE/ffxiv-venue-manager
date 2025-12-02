import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

// PATCH /api/admin/feedback/[feedbackId] - Update feedback status/notes (admin only)
export const PATCH = withRateLimit<{ params: Promise<{ feedbackId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const { params } = context
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

      const { feedbackId } = await params
      const body = await request.json()
      const { status, adminNotes } = body

      // Validate status if provided
      const validStatuses = ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "COMPLETED", "WONT_FIX"]
      if (status && !validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        )
      }

      // Update the feedback
      const updateData: any = {}
      if (status) {
        updateData.status = status
        updateData.reviewedBy = session.user.id
        updateData.reviewedAt = new Date()
      }
      if (adminNotes !== undefined) {
        updateData.adminNotes = adminNotes
      }

      const updatedFeedback = await prisma.feedback.update({
        where: { id: feedbackId },
        data: updateData,
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
      })

      return NextResponse.json(updatedFeedback)
    } catch (error) {
      console.error("Error updating feedback:", error)
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      )
    }
  },
  { requests: 30, window: "1 m" }
)
