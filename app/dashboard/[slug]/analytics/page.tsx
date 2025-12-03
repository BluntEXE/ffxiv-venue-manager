"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { Breadcrumb } from "@/components/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts"
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns"
import { TrendingUp, DollarSign, Users, Calendar, Clock, Target } from "lucide-react"

export default function AnalyticsPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [venueId, setVenueId] = useState<string>("")
  const [revenueData, setRevenueData] = useState<any[]>([])
  const [serviceRevenue, setServiceRevenue] = useState<any[]>([])
  const [patronData, setPatronData] = useState<any[]>([])
  const [eventStats, setEventStats] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (slug) {
      fetchVenueAndAnalytics()
    }
  }, [slug])

  const fetchVenueAndAnalytics = async () => {
    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: any) => v.slug === slug)

      if (!venue) return

      setVenueId(venue.id)

      // Fetch all events
      const eventsResponse = await fetch(`/api/venues/${venue.id}/events`)
      const allEvents = await eventsResponse.json()

      // Filter to completed/active events and sort by start time (most recent first)
      const relevantEvents = allEvents
        .filter((e: any) => e.status === "COMPLETED" || e.status === "ACTIVE")
        .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 10) // Last 10 events for main chart
        .reverse() // Oldest to newest for chart

      // Fetch revenue for each event
      const transactionsResponse = await fetch(`/api/venues/${venue.id}/transactions`)
      const allTransactionsData = await transactionsResponse.json()
      const allTransactions = allTransactionsData.transactions || []

      const revenuePromises = relevantEvents.map(async (event: any) => {
        // Filter transactions for this event
        const eventTransactions = allTransactions.filter((t: any) => t.eventId === event.id)
        const total = eventTransactions.reduce((sum: number, t: any) => sum + Number(t.amount), 0)

        return {
          date: format(new Date(event.startTime), "MMM dd"),
          fullDate: new Date(event.startTime),
          eventTitle: event.title,
          revenue: total,
        }
      })

      const revenue = await Promise.all(revenuePromises)
      setRevenueData(revenue)

      // Fetch revenue by service (using already-fetched transactions)
      const serviceMap = new Map<string, number>()
      allTransactions.forEach((t: any) => {
        if (t.service) {
          const current = serviceMap.get(t.service.name) || 0
          serviceMap.set(t.service.name, current + Number(t.amount))
        }
      })

      const serviceData = Array.from(serviceMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5) // Top 5 services

      setServiceRevenue(serviceData)

      // Fetch patron tracking data (last 7 events)
      const last7Events = allEvents
        .filter((e: any) => e.status === "COMPLETED" || e.status === "ACTIVE")
        .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .slice(0, 7)
        .reverse()

      const patronPromises = last7Events.map(async (event: any) => {
        const response = await fetch(`/api/venues/${venue.id}/patron-tracking`)
        const data = await response.json()

        // Filter logs for this event
        const eventLogs = data.logs?.filter((log: any) => log.eventId === event.id) || []

        // Calculate peak patron count for this event
        let currentCount = 0
        let maxCount = 0
        eventLogs.forEach((log: any) => {
          currentCount += log.countChange
          maxCount = Math.max(maxCount, currentCount)
        })

        return {
          date: format(new Date(event.startTime), "MMM dd"),
          eventTitle: event.title,
          patrons: Math.max(maxCount, 0),
        }
      })

      const patronStats = await Promise.all(patronPromises)
      setPatronData(patronStats)

      // Calculate event statistics (using already-fetched events)
      const now = new Date()
      const past30Days = subDays(now, 30)

      const recentEvents = allEvents.filter((e: any) => new Date(e.startTime) >= past30Days)

      setEventStats({
        total: allEvents.length,
        upcoming: allEvents.filter((e: any) => new Date(e.startTime) > now).length,
        completed: allEvents.filter((e: any) => e.status === "COMPLETED").length,
        recentCount: recentEvents.length,
      })
    } catch (error) {
      console.error("Failed to fetch analytics:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="container mx-auto p-8">
          <p className="text-center">Loading analytics...</p>
        </div>
      </VenueLayoutClient>
    )
  }

  const totalRevenue = revenueData.reduce((sum, day) => sum + day.revenue, 0)
  const avgDailyRevenue = Math.round(totalRevenue / revenueData.length)
  const totalPatrons = patronData.reduce((sum, day) => sum + day.patrons, 0)

  const COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ]

  return (
    <VenueLayoutClient slug={slug}>
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Venue", href: `/dashboard/${slug}` },
            { label: "Analytics" },
          ]}
        />

        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-2">Analytics Dashboard</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Comprehensive insights into your venue's performance
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Revenue (Last 10 Events)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalRevenue.toLocaleString()} gil</div>
              <p className="text-xs text-muted-foreground mt-1">
                Avg: {avgDailyRevenue.toLocaleString()} gil/event
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total Patrons (Last 7 Events)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPatrons.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Peak attendees
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Events (30d)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{eventStats?.recentCount || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {eventStats?.upcoming || 0} upcoming
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Completion Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {eventStats?.total > 0
                  ? Math.round((eventStats.completed / eventStats.total) * 100)
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {eventStats?.completed || 0} completed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Trend (Last 10 Events) */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Revenue by Event (Last 10)
              </CardTitle>
              <CardDescription>
                Revenue per event over recent events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
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
                    formatter={(value: number, name: string, props: any) => [
                      `${value.toLocaleString()} gil`,
                      props.payload.eventTitle || "Revenue"
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Patron Visit Trends */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Patron Visits (Last 7 Events)
              </CardTitle>
              <CardDescription>
                Peak patron counts per event
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={patronData}>
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
                    formatter={(value: number, name: string, props: any) => [
                      value,
                      props.payload.eventTitle || "Peak Patrons"
                    ]}
                  />
                  <Bar dataKey="patrons" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Services by Revenue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Top Services
              </CardTitle>
              <CardDescription>
                Revenue by service type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={serviceRevenue}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name}: ${((percent || 0) * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="hsl(var(--chart-1))"
                    dataKey="value"
                  >
                    {serviceRevenue.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                    formatter={(value: number) => `${value.toLocaleString()} gil`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </VenueLayoutClient>
  )
}
