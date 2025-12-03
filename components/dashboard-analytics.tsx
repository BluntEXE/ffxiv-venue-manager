"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { format, subDays, startOfDay } from "date-fns"
import { TrendingUp, CheckCircle2, Calendar } from "lucide-react"

interface DashboardAnalyticsProps {
  venueId: string
}

interface RevenueData {
  date: string
  amount: number
}

interface TaskStats {
  total: number
  completed: number
  pending: number
  inProgress: number
}

interface UpcomingEvent {
  id: string
  title: string
  startTime: string
  eventType: string
}

export function DashboardAnalytics({ venueId }: DashboardAnalyticsProps) {
  const [revenueData, setRevenueData] = useState<RevenueData[]>([])
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [venueId])

  const fetchAnalytics = async () => {
    try {
      // Fetch last 7 days of revenue
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i)
        return startOfDay(date)
      })

      const revenuePromises = last7Days.map(async (date) => {
        const nextDay = new Date(date)
        nextDay.setDate(nextDay.getDate() + 1)

        const transactions = await fetch(
          `/api/venues/${venueId}/transactions?` +
            new URLSearchParams({
              from: date.toISOString(),
              to: nextDay.toISOString(),
            })
        )
        const data = await transactions.json()
        const total = data.reduce((sum: number, t: any) => sum + Number(t.amount), 0)

        return {
          date: format(date, "MMM dd"),
          amount: total,
        }
      })

      const revenue = await Promise.all(revenuePromises)
      setRevenueData(revenue)

      // Fetch task statistics
      const tasksResponse = await fetch(`/api/venues/${venueId}/tasks`)
      const tasks = await tasksResponse.json()

      setTaskStats({
        total: tasks.length,
        completed: tasks.filter((t: any) => t.status === "COMPLETED").length,
        pending: tasks.filter((t: any) => t.status === "PENDING").length,
        inProgress: tasks.filter((t: any) => t.status === "IN_PROGRESS").length,
      })

      // Fetch upcoming events
      const eventsResponse = await fetch(`/api/venues/${venueId}/events`)
      const events = await eventsResponse.json()

      const upcoming = events
        .filter((e: any) => new Date(e.startTime) > new Date())
        .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 5)

      setUpcomingEvents(upcoming)
    } catch (error) {
      console.error("Failed to fetch analytics:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">Loading analytics...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalRevenue = revenueData.reduce((sum, day) => sum + day.amount, 0)
  const completionRate = taskStats ? Math.round((taskStats.completed / taskStats.total) * 100) : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Revenue Trend (7 Days)
          </CardTitle>
          <CardDescription>
            Total: {totalRevenue.toLocaleString()} gil
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                }}
                formatter={(value: number) => [`${value.toLocaleString()} gil`, "Revenue"]}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Task Completion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Task Completion
          </CardTitle>
          <CardDescription>
            {completionRate}% completion rate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={[
                { name: "Completed", value: taskStats?.completed || 0, fill: "hsl(var(--chart-2))" },
                { name: "In Progress", value: taskStats?.inProgress || 0, fill: "hsl(var(--chart-3))" },
                { name: "Pending", value: taskStats?.pending || 0, fill: "hsl(var(--chart-4))" },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="name"
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                }}
              />
              <Bar dataKey="value" fill="fill" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Upcoming Events */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Upcoming Events
          </CardTitle>
          <CardDescription>
            Next {upcomingEvents.length} scheduled events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No upcoming events scheduled
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(event.startTime), "PPP 'at' p")}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">{event.eventType}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
