import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { Breadcrumb } from "@/components/breadcrumb"
import { SalesLogDialog } from "@/components/sales-log-dialog"
import { TransactionsList } from "@/components/transactions-list"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function SalesPage({ params }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect("/api/auth/signin")
  }

  const { slug } = await params

  // Fetch venue
  const venue = await prisma.venue.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      settings: true,
    },
  })

  if (!venue) {
    return (
      <div className="container mx-auto p-8">
        <Alert className="bg-red-50 border-red-200">
          <AlertDescription className="text-red-800">Venue not found</AlertDescription>
        </Alert>
      </div>
    )
  }

  // Check if user has access to this venue
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      venueId: venue.id,
    },
  })

  if (!membership) {
    return (
      <div className="container mx-auto p-8">
        <Alert className="bg-red-50 border-red-200">
          <AlertDescription className="text-red-800">
            You don't have access to this venue
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const venueSettings = venue.settings as any

  // Check sales visibility for STAFF members
  if (membership.role === "STAFF" && venueSettings?.salesVisibility) {
    const salesVisibility = venueSettings.salesVisibility

    if (salesVisibility === "none") {
      return (
        <VenueLayoutClient slug={slug}>
          <div className="container mx-auto p-8">
            <Alert className="bg-red-50 border-red-200">
              <AlertDescription className="text-red-800">
                You don't have permission to view sales data
              </AlertDescription>
            </Alert>
          </div>
        </VenueLayoutClient>
      )
    }
  }

  // Build where clause for transactions
  const where: any = { venueId: venue.id }

  // Apply sales visibility settings for STAFF members
  if (membership.role === "STAFF" && venueSettings?.salesVisibility === "own") {
    where.staffId = session.user.id
  }

  // Fetch data in parallel
  const [transactionsData, services] = await Promise.all([
    // Get first 50 transactions
    prisma.transaction.findMany({
      where,
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        event: {
          select: {
            id: true,
            title: true,
          },
        },
        staff: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 51, // Fetch one extra to check if there are more
    }),
    // Get active services
    prisma.service.findMany({
      where: {
        venueId: venue.id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        price: true,
        category: true,
        isActive: true,
      },
    }),
  ])

  const hasMore = transactionsData.length > 50
  const transactions = hasMore ? transactionsData.slice(0, 50) : transactionsData
  const nextCursor = hasMore ? transactions[transactions.length - 1]?.id : null

  // Convert Prisma Decimal to number for services
  const servicesWithNumberPrices = services.map((service) => ({
    ...service,
    price: Number(service.price),
  }))

  // Calculate totals
  const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.amount), 0)
  const todayTransactions = transactions.filter(
    (t) => new Date(t.createdAt).toDateString() === new Date().toDateString()
  )
  const todayRevenue = todayTransactions.reduce((sum, t) => sum + Number(t.amount), 0)

  return (
    <VenueLayoutClient slug={slug}>
      <div className="container mx-auto p-4 md:p-6 lg:p-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Venue", href: `/dashboard/${slug}` },
            { label: "Sales" },
          ]}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">Sales & Transactions</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
              Log sales and track revenue
            </p>
          </div>
          <SalesLogDialog venueId={venue.id} services={servicesWithNumberPrices} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalRevenue.toLocaleString()} gil</div>
              <p className="text-xs text-muted-foreground mt-1">
                {transactions.length} transactions
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {todayRevenue.toLocaleString()} gil
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {todayTransactions.length} transactions
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Average Sale</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {transactions.length > 0 ? Math.round(totalRevenue / transactions.length).toLocaleString() : 0} gil
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions List */}
        {transactions.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">
                No transactions yet. Log your first sale!
              </p>
              <SalesLogDialog venueId={venue.id} services={servicesWithNumberPrices} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>All sales and transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <TransactionsList
                initialTransactions={transactions as any}
                initialNextCursor={nextCursor}
                initialHasMore={hasMore}
                venueId={venue.id}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </VenueLayoutClient>
  )
}
