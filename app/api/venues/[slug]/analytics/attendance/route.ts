import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { addMinutes, format, isBefore, isAfter, startOfDay, endOfDay } from "date-fns"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params

        const venue = await prisma.venue.findUnique({
            where: { slug }
        })

        if (!venue) {
            return new NextResponse("Venue not found", { status: 404 })
        }

        // Fetch last 20 events to calculate "Average Traffic Flow"
        const events = await prisma.event.findMany({
            where: {
                venueId: venue.id,
                status: { in: ["COMPLETED", "ACTIVE"] }
            },
            include: {
                patronLogs: {
                    orderBy: { timestamp: "asc" }
                }
            },
            orderBy: { startTime: "desc" },
            take: 20
        })

        // Helper: Calculate 15m interval time series for a single event
        const getEventTimeSeries = (event: any) => {
            const points = []
            let currentTime = new Date(event.startTime)
            let endTime = new Date(event.endTime)

            // Find last log to maybe extend end time
            const lastLog = event.patronLogs[event.patronLogs.length - 1]
            if (lastLog && isAfter(new Date(lastLog.timestamp), endTime)) {
                endTime = new Date(lastLog.timestamp)
            }
            endTime = addMinutes(endTime, 15) // buff

            let currentCount = 0
            let logIndex = 0
            const logs = event.patronLogs

            // We only care about "Hours from Start" or actual Time of Day?
            // Let's do Time of Day (00:00 - 23:59) to find "Venue's Critical Hours"
            // But events span different days...
            // Let's normalize everything to a single 24h timeline

            while (isBefore(currentTime, endTime)) {
                // ... calculate count ...
                while (logIndex < logs.length && isBefore(new Date(logs[logIndex].timestamp), currentTime)) {
                    currentCount += logs[logIndex].countChange
                    logIndex++
                }
                if (currentCount < 0) currentCount = 0;

                // Key: HH:mm (e.g., "19:15")
                const timeKey = format(currentTime, "HH:mm")
                points.push({ time: timeKey, count: currentCount })

                currentTime = addMinutes(currentTime, 15)
            }
            return points;
        }

        // Map to accumulate counts by time bucket
        // "19:00": { total: 50, occurrences: 5 } -> Avg = 10
        const buckets: Record<string, { total: number, occurrences: number }> = {}

        // Initialize buckets for 24 hours (optional, or just spare)
        // Let's just fill dynamically

        events.forEach(event => {
            const series = getEventTimeSeries(event)
            series.forEach(pt => {
                if (!buckets[pt.time]) {
                    buckets[pt.time] = { total: 0, occurrences: 0 }
                }
                buckets[pt.time].total += pt.count
                buckets[pt.time].occurrences += 1
            })
        })

        // Convert to array and sort
        const averageData = Object.entries(buckets).map(([time, data]) => ({
            time,
            avgCount: Math.round(data.total / data.occurrences)
        })).sort((a, b) => a.time.localeCompare(b.time))

        // Filter to only show hours where we actually have data (active hours)
        // or maybe show 'common opening hours'

        return NextResponse.json(averageData)

    } catch (error) {
        console.error("Error fetching attendance analytics:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
