import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatReadout } from "@/components/ui/stat-readout"
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
      <div className="container mx-auto p-4 md:p-8">
        <Alert className="bg-destructive/10 border-destructive/20">
          <AlertDescription className="text-destructive">Venue not found</AlertDescription>
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
      <div className="container mx-auto p-4 md:p-8">
        <Alert className="bg-destructive/10 border-destructive/20">
          <AlertDescription className="text-destructive">
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
          <div className="container mx-auto p-4 md:p-8">
            <Alert className="bg-destructive/10 border-destructive/20">
              <AlertDescription className="text-destructive">
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
  const [transactionsData, services, activeEvents] = await Promise.all([
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
            memberships: {
              where: { venueId: venue.id },
              select: {
                role: true,
                customRole: {
                  select: {
                    name: true,
                    color: true,
                  },
                },
              },
              take: 1,
            },
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
    // Get active/published events
    prisma.event.findMany({
      where: {
        venueId: venue.id,
        status: {
          in: ["PUBLISHED", "ACTIVE"],
        },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        status: true,
      },
      orderBy: {
        startTime: "desc",
      },
      take: 10,
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
      <div className="p-4 md:p-6">
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
            <h1 className="font-cinzel text-2xl md:text-3xl font-bold tracking-[0.02em]">Sales & Transactions</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
              Log sales and track revenue
            </p>
          </div>
          <SalesLogDialog venueId={venue.id} services={servicesWithNumberPrices} events={activeEvents} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4"><StatReadout label="Total revenue" value={`${totalRevenue.toLocaleString()} gil`} subtext={`${transactions.length} transactions`} /></Card>
          <Card className="p-4"><StatReadout label="Today's revenue" value={`${todayRevenue.toLocaleString()} gil`} subtext={`${todayTransactions.length} today`} deltaDirection="up" /></Card>
          <Card className="p-4"><StatReadout label="Average sale" value={`${transactions.length > 0 ? Math.round(totalRevenue / transactions.length).toLocaleString() : 0} gil`} subtext="Per transaction" /></Card>
        </div>

        {/* Transactions List */}
        {transactions.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">
                No sales recorded yet.
              </p>
              <SalesLogDialog venueId={venue.id} services={servicesWithNumberPrices} events={activeEvents} />
            </CardContent>
          </Card>
        ) : (
          <Card className="p-5">
            <p className="stat-label mb-0.5">Transaction History</p>
            <p className="text-xs text-muted-foreground mb-4">All sales and transactions</p>
            <TransactionsList
              initialTransactions={transactions as any}
              initialNextCursor={nextCursor}
              initialHasMore={hasMore}
              venueId={venue.id}
            />
          </Card>
        )}
      </div>
    </VenueLayoutClient>
  )
}
