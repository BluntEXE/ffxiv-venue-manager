"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { format } from "date-fns"
import { TrendingUp, CheckCircle2, Calendar } from "lucide-react"

interface DashboardAnalyticsProps {
  venueId: string
}

interface FinancialData {
  date: string
  netProfit: number
  revenue: number
  payroll: number
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

const TooltipBox = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-[rgba(0,180,255,0.25)] bg-[#0a0f1e] p-3 shadow-xl">
    {children}
  </div>
)

export function DashboardAnalytics({ venueId }: DashboardAnalyticsProps) {
  const [financialData, setFinancialData] = useState<FinancialData[]>([])
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [venueId])

  const fetchAnalytics = async () => {
    try {
      const analyticsResponse = await fetch(`/api/venues/${venueId}/analytics`)
      const analyticsData = await analyticsResponse.json()

      const last7Events = analyticsData.revenueByEvent.slice(-7)
      const financial = last7Events.map((event: any) => ({
        date: format(new Date(event.startTime), "MMM dd"),
        eventTitle: event.eventTitle,
        netProfit: event.netProfit,
        revenue: event.revenue,
        payroll: event.payroll,
      }))

      setFinancialData(financial)

      const eventsResponse = await fetch(`/api/venues/${venueId}/events`)
      const allEvents = await eventsResponse.json()

      const tasksResponse = await fetch(`/api/venues/${venueId}/tasks`)
      const tasks = await tasksResponse.json()

      setTaskStats({
        total: tasks.length,
        completed: tasks.filter((t: any) => t.status === "COMPLETED").length,
        pending: tasks.filter((t: any) => t.status === "PENDING").length,
        inProgress: tasks.filter((t: any) => t.status === "IN_PROGRESS").length,
      })

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

  const totalNetProfit = financialData.reduce((sum, day) => sum + day.netProfit, 0)
  const completionRate = taskStats && taskStats.total > 0
    ? Math.round((taskStats.completed / taskStats.total) * 100)
    : 0

  const taskBarData = [
    { name: "Completed", value: taskStats?.completed || 0, color: "#10b981" },
    { name: "In Progress", value: taskStats?.inProgress || 0, color: "#00b4ff" },
    { name: "Pending", value: taskStats?.pending || 0, color: "#f59e0b" },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Net Profit/Loss Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--xiv-blue)]" />
            Net Profit/Loss (Last 7 Events)
          </CardTitle>
          <CardDescription>
            Total: <span className={`font-semibold ${totalNetProfit >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
              {totalNetProfit >= 0 ? '+' : ''}{totalNetProfit.toLocaleString()} gil
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financialData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashColorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#313244" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={10} fontSize={12} tick={{ fill: "#9399b2" }} stroke="#9399b2" />
                <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: "#9399b2" }} stroke="#9399b2" tickFormatter={(v) => `${v >= 0 ? '' : '-'}${Math.abs(v) / 1000}k`} />
                <Tooltip
                  cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "4 4" }}
                  content={({ active, payload, label }: any) => {
                    if (active && payload && payload.length) {
                      const netProfit = payload[0].payload.netProfit
                      return (
                        <TooltipBox>
                          <p className="mb-1 text-sm font-semibold">{label}</p>
                          <p className="text-xs text-muted-foreground mb-1">{payload[0].payload.eventTitle}</p>
                          <span className={`text-xs font-medium ${netProfit >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                            {netProfit >= 0 ? 'Profit' : 'Loss'}: {Math.abs(netProfit).toLocaleString()} gil
                          </span>
                        </TooltipBox>
                      )
                    }
                    return null
                  }}
                />
                <Area type="monotone" dataKey="netProfit" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#dashColorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Task Completion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Task Completion
          </CardTitle>
          <CardDescription>
            {completionRate}% completion rate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={taskBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#313244" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={10} fontSize={12} tick={{ fill: "#9399b2" }} stroke="#9399b2" />
                <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: "#9399b2" }} stroke="#9399b2" allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(0,180,255,0.06)" }}
                  content={({ active, payload, label }: any) => {
                    if (active && payload && payload.length) {
                      return (
                        <TooltipBox>
                          <p className="text-sm font-semibold mb-1">{label}</p>
                          <span className="text-xs font-medium" style={{ color: payload[0].payload.color }}>
                            {payload[0].value} tasks
                          </span>
                        </TooltipBox>
                      )
                    }
                    return null
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {taskBarData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Events */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[var(--xiv-blue)]" />
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
                  className="flex items-center justify-between p-3 border border-[rgba(0,180,255,0.12)] rounded-xl hover:border-[rgba(0,180,255,0.3)] hover:bg-[rgba(0,180,255,0.04)] transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-[rgba(0,180,255,0.1)] flex items-center justify-center text-[var(--xiv-blue)] group-hover:scale-110 transition-transform">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{event.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(event.startTime), "PPP 'at' p")}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-[rgba(0,180,255,0.1)] text-[var(--xiv-blue)] border border-[rgba(0,180,255,0.25)]">
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
