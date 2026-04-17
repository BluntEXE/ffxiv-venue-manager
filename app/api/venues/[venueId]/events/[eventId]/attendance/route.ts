import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { format } from "date-fns"

/**
 * GET - Get attendance data for a specific event formatted for charts
 * Returns time-series data of patron count over the event duration
 */
export const GET = withRateLimit<{ params: Promise<{ venueId: string; eventId: string }> }>(
    async (request, context) => {
        if (!context?.params) {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 })
        }

        try {
            const session = await getServerSession(authOptions)
            if (!session?.user?.id) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
            }

            const { params } = context
            const { venueId, eventId } = await params

            // Check permissions
            const membership = await prisma.membership.findFirst({
                where: {
                    userId: session.user.id,
                    venueId,
        status: "active",
                },
            })

            if (!membership) {
                return NextResponse.json(
                    { error: "You don't have access to this venue" },
                    { status: 403 }
                )
            }

            // Verify the event exists and belongs to this venue
            const event = await prisma.event.findFirst({
                where: {
                    id: eventId,
                    venueId,
                },
                select: {
                    id: true,
                    startTime: true,
                    endTime: true,
                },
            })

            if (!event) {
                return NextResponse.json(
                    { error: "Event not found" },
                    { status: 404 }
                )
            }

            // Get all patron logs for this event
            const logs = await prisma.patronLog.findMany({
                where: {
                    venueId,
                    eventId,
                },
                orderBy: { timestamp: "asc" },
                select: {
                    timestamp: true,
                    countChange: true,
                    action: true,
                },
            })

            // If no logs, return empty array
            if (logs.length === 0) {
                return NextResponse.json([])
            }

            // Build time-series data showing cumulative count at each log point
            let runningCount = 0
            const attendanceData = logs.map((log) => {
                runningCount += (log.countChange ?? 0)
                return {
                    time: format(new Date(log.timestamp), "HH:mm"),
                    timestamp: log.timestamp.toISOString(),
                    count: Math.max(0, runningCount), // Never show negative
                }
            })

            return NextResponse.json(attendanceData)
        } catch (error) {
            console.error("Error fetching event attendance:", error)
            return NextResponse.json({ error: "Internal server error" }, { status: 500 })
        }
    },
    { requests: 60, window: "1 m" }
)
