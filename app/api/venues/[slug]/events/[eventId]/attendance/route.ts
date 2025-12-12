import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { addMinutes, format, isBefore, isAfter, startOfHour } from "date-fns"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string; eventId: string }> }
) {
    try {
        const { slug, eventId } = await params

        // 1. Get Event Details (Start/End time)
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            include: {
                venue: true,
            },
        })

        if (!event) {
            return new NextResponse("Event not found", { status: 404 })
        }

        // Verify ownership/access via slug
        if (event.venue.slug !== slug) {
            return new NextResponse("Unauthorized", { status: 403 })
        }

        // 2. Fetch all logs for this event
        const logs = await prisma.patronLog.findMany({
            where: {
                eventId: eventId,
            },
            orderBy: {
                timestamp: "asc",
            },
        })

        // 3. Generate Time Buckets (every 15 mins)
        const dataPoints = []
        let currentTime = new Date(event.startTime)
        const endTime = new Date(event.endTime) // Use event end time

        // If event is currently active/running, maybe cap at "now" vs end time?
        // For now, let's show the full scheduled duration + logs

        // Find the latest log to see if we went overtime
        const lastLog = logs[logs.length - 1]
        let effectiveEndTime = endTime
        if (lastLog && isAfter(new Date(lastLog.timestamp), endTime)) {
            effectiveEndTime = new Date(lastLog.timestamp)
        }
        // Round up to nearest 15m
        effectiveEndTime = addMinutes(effectiveEndTime, 15)


        let currentCount = 0
        let logIndex = 0

        while (isBefore(currentTime, effectiveEndTime) || currentTime.getTime() === effectiveEndTime.getTime()) {
            // Process all logs that happened BEFORE or AT this bucket time
            while (logIndex < logs.length) {
                const log = logs[logIndex]
                const logTime = new Date(log.timestamp)

                if (isAfter(logTime, currentTime)) {
                    break // Stop if log is in the future relative to our bucket
                }

                // Apply change
                currentCount += log.countChange
                logIndex++
            }

            // Ensure count doesn't drop below zero (data integrity safety)
            if (currentCount < 0) currentCount = 0

            dataPoints.push({
                time: format(currentTime, "HH:mm"), // 24h format for chart
                timestamp: currentTime.toISOString(),
                count: currentCount,
            })

            // Advance 15 mins
            currentTime = addMinutes(currentTime, 15)
        }

        return NextResponse.json(dataPoints)
    } catch (error) {
        console.error("Error fetching attendance data:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
