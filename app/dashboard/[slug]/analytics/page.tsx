"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { Breadcrumb } from "@/components/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { format } from "date-fns"
import { TrendingUp, DollarSign, Users, Calendar, Target } from "lucide-react"
import { PageLoading } from "@/components/ui/loading-spinner"
import { AttendanceOverview } from "@/components/analytics/attendance-overview"

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
              {entry.value.toLocaleString()} {entry.name === "revenue" ? "gil" : ""}
            </span>
            {entry.payload.eventTitle && <span className="text-muted-foreground">({entry.payload.eventTitle})</span>}
          </div>
        ))}
      </div>
    )
  }
  return null
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
          <PageLoading text="Loading analytics..." />
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
                {(eventStats?.total ?? 0) > 0
                  ? Math.round(((eventStats?.completed ?? 0) / (eventStats?.total ?? 1)) * 100)
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
                <TrendingUp className="h-5 w-5 text-primary" />
                Revenue by Event (Last 10)
              </CardTitle>
              <CardDescription>
                Revenue per event over recent events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#313244" />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tickMargin={10}
                      fontSize={12}
                      tick={{ fill: "#9399b2" }}
                      stroke="#9399b2"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                      tick={{ fill: "#9399b2" }}
                      stroke="#9399b2"
                      tickFormatter={(value) => `${value / 1000}k`}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#8b5cf6", strokeWidth: 1, strokeDasharray: "4 4" }} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
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

          {/* Patron Visit Trends */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                Patron Visits (Last 7 Events)
              </CardTitle>
              <CardDescription>
                Peak patron counts per event
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={patronData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPatron" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#313244" />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tickMargin={10}
                      fontSize={12}
                      tick={{ fill: "#9399b2" }}
                      stroke="#9399b2"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      fontSize={12}
                      tick={{ fill: "#9399b2" }}
                      stroke="#9399b2"
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "#313244", opacity: 0.2 }} />
                    <Bar
                      dataKey="patrons"
                      fill="url(#colorPatron)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Top Services by Revenue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-blue-500" />
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
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {serviceRevenue.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    wrapperStyle={{ paddingTop: "20px" }}
                    formatter={(value: string, entry: any) => {
                      const percent = ((entry.payload.value / serviceRevenue.reduce((sum, s) => sum + s.value, 0)) * 100).toFixed(0)
                      return <span className="text-muted-foreground">{value} ({percent}%)</span>
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Average Traffic Flow - Full Width */}
          <div className="lg:col-span-2">
            <AttendanceOverview slug={slug} />
          </div>
        </div>
      </div>
    </VenueLayoutClient>
  )
}
