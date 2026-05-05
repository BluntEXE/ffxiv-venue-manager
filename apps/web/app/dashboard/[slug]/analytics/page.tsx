"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { Breadcrumb } from "@/components/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { TrendingUp, DollarSign, Users, Calendar, Target, Download } from "lucide-react"
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
  financial: {
    totalRevenue: number
    totalPayroll: number
    netProfit: number
    profitMargin: number
    payrollAsPercentOfRevenue: number
  }
  revenueByEvent: Array<{
    eventId: string
    eventTitle: string
    startTime: string
    revenue: number
    payroll: number
    netProfit: number
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
  attendanceByHour: Array<{
    time: string
    avgCount: number
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

  const exportToCSV = () => {
    if (!analyticsData) return

    // Prepare CSV data
    const csvHeaders = ["Event", "Date", "Revenue (gil)", "Payroll (gil)", "Net Profit/Loss (gil)", "Profit Margin (%)"]
    const csvRows = analyticsData.revenueByEvent.map((event) => {
      const profitMargin = event.revenue > 0 ? ((event.netProfit / event.revenue) * 100).toFixed(2) : "0.00"
      return [
        `"${event.eventTitle}"`,
        format(new Date(event.startTime), "MMM dd, yyyy"),
        event.revenue.toFixed(2),
        event.payroll.toFixed(2),
        event.netProfit.toFixed(2),
        profitMargin
      ].join(",")
    })

    // Add summary row
    const totalRevenue = analyticsData.revenueByEvent.reduce((sum, e) => sum + e.revenue, 0)
    const totalPayroll = analyticsData.revenueByEvent.reduce((sum, e) => sum + e.payroll, 0)
    const totalProfit = totalRevenue - totalPayroll
    const overallMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : "0.00"

    csvRows.push("") // Empty row
    csvRows.push([
      "\"TOTAL (Last 10 Events)\"",
      "",
      totalRevenue.toFixed(2),
      totalPayroll.toFixed(2),
      totalProfit.toFixed(2),
      overallMargin
    ].join(","))

    const csvContent = [csvHeaders.join(","), ...csvRows].join("\n")

    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `${analyticsData.venueName}-financial-report-${format(new Date(), "yyyy-MM-dd")}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Transform data for charts
  const financialData = analyticsData?.revenueByEvent.map((e) => ({
    date: format(new Date(e.startTime), "MMM dd"),
    fullDate: new Date(e.startTime),
    eventTitle: e.eventTitle,
    revenue: e.revenue,
    payroll: e.payroll,
    netProfit: e.netProfit,
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
        <div className="container mx-auto p-4 md:p-8">
          <PageLoading text="Loading analytics..." />
        </div>
      </VenueLayoutClient>
    )
  }

  if (error) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="container mx-auto p-4 md:p-8">
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

        {/* Financial Summary Cards */}
        {analyticsData?.financial && (
          <div className="mb-6 md:mb-8">
            <h2 className="text-xl font-semibold mb-4">Financial Overview (Last 10 Events)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              <Card className="border-l-4 border-l-yellow-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-yellow-500" />
                    Payroll Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {Math.round(analyticsData.financial.totalPayroll).toLocaleString()} gil
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {analyticsData.financial.payrollAsPercentOfRevenue.toFixed(1)}% of revenue
                  </p>
                </CardContent>
              </Card>

              <Card className={`border-l-4 ${
                analyticsData.financial.netProfit >= 0
                  ? 'border-l-green-500'
                  : 'border-l-red-500'
              }`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className={`h-4 w-4 ${
                      analyticsData.financial.netProfit >= 0
                        ? 'text-emerald-500'
                        : 'text-red-500'
                    }`} />
                    Net Profit/Loss
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${
                    analyticsData.financial.netProfit >= 0
                      ? 'text-emerald-500'
                      : 'text-red-400'
                  }`}>
                    {analyticsData.financial.netProfit >= 0 ? '+' : ''}
                    {Math.round(analyticsData.financial.netProfit).toLocaleString()} gil
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Revenue minus paid payroll
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-500" />
                    Profit Margin
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analyticsData.financial.profitMargin.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {analyticsData.financial.profitMargin >= 50
                      ? 'Healthy margin'
                      : analyticsData.financial.profitMargin >= 25
                      ? 'Moderate margin'
                      : 'Low margin'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Net Profit/Loss Chart (Last 10 Events) */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Net Profit/Loss by Event (Last 10)
                </CardTitle>
                <CardDescription>
                  Revenue minus payroll expenses per event
                </CardDescription>
              </div>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={financialData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
                      tickFormatter={(value) => `${value >= 0 ? '' : '-'}${Math.abs(value) / 1000}k`}
                    />
                    <Tooltip
                      content={({ active, payload, label }: any) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload
                          return (
                            <div className="rounded-lg border bg-background/95 p-3 shadow-xl backdrop-blur-sm ring-1 ring-black/5">
                              <p className="mb-1 text-sm font-semibold">{label}</p>
                              <p className="text-xs text-muted-foreground mb-2">{data.eventTitle}</p>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-4 text-xs">
                                  <span className="text-muted-foreground">Revenue:</span>
                                  <span className="font-medium text-purple-600">{data.revenue.toLocaleString()} gil</span>
                                </div>
                                <div className="flex items-center justify-between gap-4 text-xs">
                                  <span className="text-muted-foreground">Payroll:</span>
                                  <span className="font-medium text-orange-600">{data.payroll.toLocaleString()} gil</span>
                                </div>
                                <div className="flex items-center justify-between gap-4 text-xs border-t pt-1">
                                  <span className="text-muted-foreground font-semibold">Net Profit:</span>
                                  <span className={`font-semibold ${data.netProfit >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                    {data.netProfit >= 0 ? '+' : ''}{data.netProfit.toLocaleString()} gil
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        }
                        return null
                      }}
                      cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "4 4" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="netProfit"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorProfit)"
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
                <Users className="h-5 w-5 text-emerald-500" />
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
            <AttendanceOverview data={analyticsData?.attendanceByHour || []} />
          </div>

          {/* Detailed Financial Table - Full Width */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Detailed Financial Breakdown</CardTitle>
              <CardDescription>
                Revenue, payroll, and profit analysis for each event
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Payroll</TableHead>
                      <TableHead className="text-right">Net Profit/Loss</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analyticsData?.revenueByEvent && analyticsData.revenueByEvent.length > 0 ? (
                      analyticsData.revenueByEvent.map((event) => {
                        const profitMargin = event.revenue > 0 ? ((event.netProfit / event.revenue) * 100).toFixed(1) : "0.0"
                        return (
                          <TableRow key={event.eventId}>
                            <TableCell className="font-medium">{event.eventTitle}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {format(new Date(event.startTime), "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell className="text-right font-medium text-purple-600">
                              {event.revenue.toLocaleString()} gil
                            </TableCell>
                            <TableCell className="text-right font-medium text-orange-600">
                              {event.payroll.toLocaleString()} gil
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${
                              event.netProfit >= 0 ? 'text-emerald-500' : 'text-red-400'
                            }`}>
                              {event.netProfit >= 0 ? '+' : ''}{event.netProfit.toLocaleString()} gil
                            </TableCell>
                            <TableCell className={`text-right font-medium ${
                              parseFloat(profitMargin) >= 0 ? 'text-emerald-500' : 'text-red-400'
                            }`}>
                              {profitMargin}%
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No event data available
                        </TableCell>
                      </TableRow>
                    )}
                    {/* Total Row */}
                    {analyticsData?.revenueByEvent && analyticsData.revenueByEvent.length > 0 && (
                      <TableRow className="bg-muted/50 font-semibold border-t-2">
                        <TableCell colSpan={2}>TOTAL (Last 10 Events)</TableCell>
                        <TableCell className="text-right text-purple-600">
                          {analyticsData.revenueByEvent.reduce((sum, e) => sum + e.revenue, 0).toLocaleString()} gil
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
                          {analyticsData.revenueByEvent.reduce((sum, e) => sum + e.payroll, 0).toLocaleString()} gil
                        </TableCell>
                        <TableCell className={`text-right ${
                          analyticsData.revenueByEvent.reduce((sum, e) => sum + e.netProfit, 0) >= 0
                            ? 'text-emerald-500'
                            : 'text-red-400'
                        }`}>
                          {analyticsData.revenueByEvent.reduce((sum, e) => sum + e.netProfit, 0) >= 0 ? '+' : ''}
                          {analyticsData.revenueByEvent.reduce((sum, e) => sum + e.netProfit, 0).toLocaleString()} gil
                        </TableCell>
                        <TableCell className={`text-right ${
                          analyticsData.financial.profitMargin >= 0 ? 'text-emerald-500' : 'text-red-400'
                        }`}>
                          {analyticsData.financial.profitMargin.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </VenueLayoutClient>
  )
}
