"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock } from "lucide-react"

interface AverageAttendanceData {
    time: string
    avgCount: number
}

interface AttendanceOverviewProps {
    data: AverageAttendanceData[]
}

export function AttendanceOverview({ data }: AttendanceOverviewProps) {
    if (!data || data.length === 0) return null

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-[var(--xiv-blue)]" />
                    Average Hourly Traffic
                </CardTitle>
                <CardDescription>
                    Typical patron volume by time of day (based on last 20 events)
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#00b4ff" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#00b4ff" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#313244" />
                            <XAxis
                                dataKey="time"
                                stroke="#9399b2"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="#9399b2"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="rounded-lg border bg-[#0a0f1e] p-2 shadow-lg border-[rgba(0,180,255,0.25)]">
                                                <div className="flex flex-col">
                                                    <span className="text-[0.70rem] uppercase text-muted-foreground mb-1">
                                                        {label}
                                                    </span>
                                                    <span className="font-bold text-[var(--xiv-blue)]">
                                                        ~{payload[0].value} Patrons
                                                    </span>
                                                </div>
                                            </div>
                                        )
                                    }
                                    return null
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="avgCount"
                                stroke="#00b4ff"
                                strokeWidth={2}
                                fill="url(#colorAvg)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
