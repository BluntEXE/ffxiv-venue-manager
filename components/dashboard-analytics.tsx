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
      // Fetch all events to get the last 7 with data
      const eventsResponse = await fetch(`/api/venues/${venueId}/events`)
      const allEvents = await eventsResponse.json()

      // Filter to completed/active events and sort by start time (most recent first)
      const relevantEvents = allEvents
        .filter((e: any) => e.status === "COMPLETED" || e.status === "ACTIVE")
        .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 7) // Last 7 events
        .reverse() // Oldest to newest for chart

      // Fetch revenue for each event
      const revenuePromises = relevantEvents.map(async (event: any) => {
        const response = await fetch(`/api/venues/${venueId}/transactions`)
        const data = await response.json()
        const transactions = data.transactions || []

        // Filter transactions for this event
        const eventTransactions = transactions.filter((t: any) => t.eventId === event.id)
        const total = eventTransactions.reduce((sum: number, t: any) => sum + Number(t.amount), 0)

        return {
          date: format(new Date(event.startTime), "MMM dd"),
          eventTitle: event.title,
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

      // Get upcoming events (using already-fetched events)
      const upcoming = allEvents
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
            Revenue by Event (Last 7)
          </CardTitle>
          <CardDescription>
            Total: {totalRevenue.toLocaleString()} gil
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                className="text-xs"
                tick={{ fill: "#6b7280" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "#6b7280" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                }}
                formatter={(value: number, name: string, props: any) => [
                  `${value.toLocaleString()} gil`,
                  props.payload.eventTitle || "Revenue"
                ]}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ fill: "#8b5cf6" }}
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
                { name: "Completed", value: taskStats?.completed || 0, fill: "#10b981" },
                { name: "In Progress", value: taskStats?.inProgress || 0, fill: "#f59e0b" },
                { name: "Pending", value: taskStats?.pending || 0, fill: "#6366f1" },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                className="text-xs"
                tick={{ fill: "#6b7280" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "#6b7280" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} />
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
