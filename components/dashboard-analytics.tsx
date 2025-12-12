"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { format } from "date-fns"
import { TrendingUp, CheckCircle2, Calendar } from "lucide-react"

interface DashboardAnalyticsProps {
  venueId: string
}

interface RevenueData {
  date: string
  amount: number
  eventTitle?: string
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

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background/95 p-3 shadow-xl backdrop-blur-sm ring-1 ring-black/5">
        <p className="mb-1 text-sm font-semibold">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="block h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-medium text-foreground">
              {entry.value.toLocaleString()} {entry.name === "amount" ? "gil" : "tasks"}
            </span>
            {entry.payload.eventTitle && <span className="text-muted-foreground">({entry.payload.eventTitle})</span>}
          </div>
        ))}
      </div>
    )
  }
  return null
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
  const completionRate = taskStats && taskStats.total > 0
    ? Math.round((taskStats.completed / taskStats.total) * 100)
    : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Revenue Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Revenue by Event (Last 7)
          </CardTitle>
          <CardDescription>
            Total: <span className="font-semibold text-foreground">{totalRevenue.toLocaleString()} gil</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                  fontSize={12}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  fontSize={12}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(value) => `${value / 1000}k`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#8b5cf6", strokeWidth: 1, strokeDasharray: "4 4" }} />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Task Completion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Task Completion
          </CardTitle>
          <CardDescription>
            {completionRate}% completion rate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "Completed", value: taskStats?.completed || 0, fill: "url(#colorCompleted)" },
                  { name: "In Progress", value: taskStats?.inProgress || 0, fill: "url(#colorProgress)" },
                  { name: "Pending", value: taskStats?.pending || 0, fill: "url(#colorPending)" },
                ]}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.4} />
                  </linearGradient>
                  <linearGradient id="colorProgress" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.4} />
                  </linearGradient>
                  <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                  fontSize={12}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  fontSize={12}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted)/0.2)" }}
                  content={<CustomTooltip />}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Events */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
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
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{event.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(event.startTime), "PPP 'at' p")}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {event.eventType}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
