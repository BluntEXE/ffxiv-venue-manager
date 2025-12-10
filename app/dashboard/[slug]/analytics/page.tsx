"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { Breadcrumb } from "@/components/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart,
  Line,
  ScatterChart,
  Scatter,
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
import { format } from "date-fns"
import { TrendingUp, DollarSign, Users, Calendar, Target } from "lucide-react"

interface AnalyticsData {
  venueId: string
  venueName: string
  summary: {
    totalRevenue: number
    avgRevenuePerEvent: number
    totalPatrons: number
    total: number
    upcoming: number
    completed: number
    recentCount: number
  }
  revenueByEvent: Array<{
    eventId: string
    eventTitle: string
    startTime: string
    revenue: number
  }>
  serviceRevenue: Array<{
    name: string
    revenue: number
  }>
  patronByEvent: Array<{
    eventId: string
    eventTitle: string
    startTime: string
    peakPatrons: number
  }>
}

export default function AnalyticsPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (slug) {
      fetchAnalytics()
    }
  }, [slug])

  const fetchAnalytics = async () => {
    try {
      setError(null)
      // Single API call to get all analytics data
      const response = await fetch(`/api/venues/${slug}/analytics`)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to fetch analytics")
      }

      const data: AnalyticsData = await response.json()
      setAnalyticsData(data)
    } catch (err) {
      console.error("Failed to fetch analytics:", err)
      setError(err instanceof Error ? err.message : "Failed to load analytics")
    } finally {
      setIsLoading(false)
    }
  }

  // Transform data for charts
  const revenueData = analyticsData?.revenueByEvent.map((e) => ({
    date: format(new Date(e.startTime), "MMM dd"),
    fullDate: new Date(e.startTime),
    eventTitle: e.eventTitle,
    revenue: e.revenue,
  })) || []

  const serviceRevenue = analyticsData?.serviceRevenue.map((s) => ({
    name: s.name,
    value: s.revenue,
  })) || []

  const patronData = analyticsData?.patronByEvent.map((e) => ({
    date: format(new Date(e.startTime), "MMM dd"),
    eventTitle: e.eventTitle,
    patrons: e.peakPatrons,
  })) || []

  const eventStats = analyticsData?.summary

  if (isLoading) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="container mx-auto p-8">
          <p className="text-center">Loading analytics...</p>
        </div>
      </VenueLayoutClient>
    )
  }

  if (error) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="container mx-auto p-8">
          <div className="text-center text-red-500">
            <p>Error loading analytics: {error}</p>
            <button
              onClick={fetchAnalytics}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        </div>
      </VenueLayoutClient>
    )
  }

  // Use pre-calculated values from API
  const totalRevenue = eventStats?.totalRevenue || 0
  const avgDailyRevenue = eventStats?.avgRevenuePerEvent || 0
  const totalPatrons = eventStats?.totalPatrons || 0

  const COLORS = [
    "#8b5cf6", // Purple
    "#10b981", // Green
    "#f59e0b", // Orange
    "#3b82f6", // Blue
    "#ec4899", // Pink
  ]

  // Calculate linear regression for trendline
  const calculateTrendline = (data: any[]) => {
    if (data.length === 0) return []

    const n = data.length
    const sumX = data.reduce((sum, _, i) => sum + i, 0)
    const sumY = data.reduce((sum, d) => sum + d.revenue, 0)
    const sumXY = data.reduce((sum, d, i) => sum + i * d.revenue, 0)
    const sumX2 = data.reduce((sum, _, i) => sum + i * i, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    return data.map((d, i) => ({
      date: d.date,
      x: i,
      trend: slope * i + intercept,
    }))
  }

  const trendlineData = calculateTrendline(revenueData)

  // Prepare scatter data with x-index for proper spacing
  const scatterData = revenueData.map((d, i) => ({
    ...d,
    x: i,
    y: d.revenue,
  }))

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
                <ScatterChart>
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, scatterData.length - 1]}
                    ticks={scatterData.map((_, i) => i)}
                    tickFormatter={(value) => revenueData[value]?.date || ""}
                    className="text-xs"
                    tick={{ fill: "#6b7280" }}
                  />
                  <YAxis
                    type="number"
                    className="text-xs"
                    tick={{ fill: "#6b7280" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                    }}
                    formatter={(value: number, name: string, props: any) => {
                      if (name === "y") {
                        return [`${value.toLocaleString()} gil`, props.payload.eventTitle || "Revenue"]
                      }
                      return null
                    }}
                    labelFormatter={(value) => revenueData[value]?.date || ""}
                  />
                  <Scatter
                    data={scatterData}
                    fill="#8b5cf6"
                    shape="circle"
                    style={{ pointerEvents: "none" }}
                  />
                  <Line
                    type="monotone"
                    data={trendlineData}
                    dataKey="trend"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    style={{ pointerEvents: "none" }}
                  />
                </ScatterChart>
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
                  <XAxis
                    dataKey="date"
                    className="text-xs"
                    tick={{ fill: "#6b7280" }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "#6b7280" }}
                    domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.25)]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                    }}
                    formatter={(value: number, name: string, props: any) => [
                      value,
                      props.payload.eventTitle || "Peak Patrons"
                    ]}
                    cursor={{ fill: "rgba(16, 185, 129, 0.1)" }}
                  />
                  <Bar dataKey="patrons" fill="#10b981" radius={[4, 4, 0, 0]} style={{ pointerEvents: "none" }} />
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
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={serviceRevenue}
                    cx="50%"
                    cy="45%"
                    outerRadius={70}
                    dataKey="value"
                    style={{ pointerEvents: "none" }}
                  >
                    {serviceRevenue.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                    }}
                    formatter={(value: number) => `${value.toLocaleString()} gil`}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string, entry: any) => {
                      const percent = ((entry.payload.value / serviceRevenue.reduce((sum, s) => sum + s.value, 0)) * 100).toFixed(0)
                      return `${value} (${percent}%)`
                    }}
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
