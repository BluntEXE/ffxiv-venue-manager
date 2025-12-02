"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { Breadcrumb } from "@/components/breadcrumb"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

interface Transaction {
  id: string
  amount: number
  customerName: string | null
  notes: string | null
  createdAt: string
  service: {
    id: string
    name: string
    price: number
  } | null
  event: {
    id: string
    title: string
  } | null
  staff: {
    id: string
    name: string | null
  } | null
}

interface Service {
  id: string
  name: string
  price: number
  category: string | null
  isActive: boolean
}

export default function SalesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const [slug, setSlug] = useState<string>("")
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [isLogSaleOpen, setIsLogSaleOpen] = useState(false)
  const [formData, setFormData] = useState({
    serviceId: "",
    amount: "",
    customerName: "",
    notes: "",
  })
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Unwrap params
  useEffect(() => {
    params.then((p) => setSlug(p.slug))
  }, [params])

  // Fetch data
  useEffect(() => {
    if (!slug) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError("")

        // Get venue ID
        const venueResponse = await fetch(`/api/venues?slug=${slug}`)
        if (!venueResponse.ok) throw new Error("Failed to fetch venue")

        const venues = await venueResponse.json()
        const venue = venues.find((v: any) => v.slug === slug)
        if (!venue) throw new Error("Venue not found")

        // Get transactions
        const transactionsResponse = await fetch(`/api/venues/${venue.id}/transactions`)
        if (transactionsResponse.ok) {
          const transactionsData = await transactionsResponse.json()
          setTransactions(transactionsData)
        }

        // Get active services
        const servicesResponse = await fetch(`/api/venues/${venue.id}/services`)
        if (servicesResponse.ok) {
          const servicesData = await servicesResponse.json()
          setServices(servicesData.filter((s: Service) => s.isActive))
        }
      } catch (err: any) {
        setError(err.message || "Failed to load data")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [slug])

  const handleLogSale = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setFormError("Please enter a valid amount")
      return
    }

    setIsSubmitting(true)
    setFormError("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: any) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: formData.serviceId || undefined,
          amount: parseFloat(formData.amount),
          customerName: formData.customerName || undefined,
          notes: formData.notes || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to log sale")
      }

      const newTransaction = await response.json()
      setTransactions([newTransaction, ...transactions])
      setIsLogSaleOpen(false)
      setFormData({ serviceId: "", amount: "", customerName: "", notes: "" })
    } catch (err: any) {
      setFormError(err.message || "Failed to log sale")
    } finally {
      setIsSubmitting(false)
    }
  }

  const openLogSaleDialog = () => {
    setFormData({ serviceId: "", amount: "", customerName: "", notes: "" })
    setFormError("")
    setIsLogSaleOpen(true)
  }

  const handleServiceSelect = (serviceId: string) => {
    if (serviceId === "manual") {
      setFormData({ ...formData, serviceId: "", amount: "" })
    } else {
      const service = services.find((s) => s.id === serviceId)
      if (service) {
        setFormData({
          ...formData,
          serviceId,
          amount: service.price.toString(),
        })
      }
    }
  }

  if (!slug) {
    return <div className="container mx-auto p-8">Loading...</div>
  }

  // Calculate totals
  const totalRevenue = transactions.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0)
  const todayTransactions = transactions.filter(
    (t) => new Date(t.createdAt).toDateString() === new Date().toDateString()
  )
  const todayRevenue = todayTransactions.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0)

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
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">Log sales and track revenue</p>
          </div>
          <Button onClick={openLogSaleDialog} size="sm" className="sm:size-default self-start">
            <span className="hidden sm:inline">Log Sale</span>
            <span className="sm:hidden">Log</span>
          </Button>
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

      {/* Error Message */}
      {error && (
        <Alert className="mb-6 bg-red-50 border-red-200">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {/* Transactions List */}
      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading transactions...</p>
        </div>
      ) : transactions.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground mb-4">
              No transactions yet. Log your first sale!
            </p>
            <Button onClick={openLogSaleDialog}>Log Your First Sale</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>All sales and transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {transaction.service ? (
                        <p className="font-semibold">{transaction.service.name}</p>
                      ) : (
                        <p className="font-semibold">Manual Sale</p>
                      )}
                      {transaction.event && (
                        <Badge variant="outline">{transaction.event.title}</Badge>
                      )}
                    </div>
                    {transaction.customerName && (
                      <p className="text-sm text-muted-foreground">
                        Customer: {transaction.customerName}
                      </p>
                    )}
                    {transaction.notes && (
                      <p className="text-sm text-muted-foreground">{transaction.notes}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>{format(new Date(transaction.createdAt), "PPp")}</span>
                      {transaction.staff && <span>• by {transaction.staff.name}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      {parseFloat(transaction.amount.toString()).toLocaleString()} gil
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Sale Dialog */}
      <Dialog open={isLogSaleOpen} onOpenChange={setIsLogSaleOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Log Sale</DialogTitle>
            <DialogDescription>Record a new transaction</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {formError && (
              <Alert className="bg-red-50 border-red-200">
                <AlertDescription className="text-red-800">{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="service">Service (Optional)</Label>
              <Select
                value={formData.serviceId || "manual"}
                onValueChange={handleServiceSelect}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a service or enter manual amount" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} - {service.price} gil
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (gil) *</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="1"
                placeholder="1000"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer">Customer Name (Optional)</Label>
              <Input
                id="customer"
                placeholder="Customer name"
                value={formData.customerName}
                onChange={(e) =>
                  setFormData({ ...formData, customerName: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                disabled={isSubmitting}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsLogSaleOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleLogSale} disabled={isSubmitting}>
              {isSubmitting ? "Logging..." : "Log Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </VenueLayoutClient>
  )
}
