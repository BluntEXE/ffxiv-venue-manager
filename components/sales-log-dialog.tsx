"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

interface Service {
  id: string
  name: string
  price: number
  category: string | null
  isActive: boolean
}

interface Event {
  id: string
  title: string
  startTime: Date
  status: string
}

interface SalesLogDialogProps {
  venueId: string
  services: Service[]
  events: Event[]
}

export function SalesLogDialog({ venueId, services, events }: SalesLogDialogProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState({
    serviceId: "",
    eventId: "",
    amount: "",
    customerName: "",
    notes: "",
  })
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Find active event to auto-select
  const activeEvent = events.find((event) => event.status === "ACTIVE")

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

  const handleLogSale = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setFormError("Please enter a valid amount")
      return
    }

    setIsSubmitting(true)
    setFormError("")

    try {
      const response = await fetch(`/api/venues/${venueId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: formData.serviceId || undefined,
          eventId: formData.eventId || undefined,
          amount: parseFloat(formData.amount),
          customerName: formData.customerName || undefined,
          notes: formData.notes || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to log sale")
      }

      setIsOpen(false)
      setFormData({ serviceId: "", eventId: "", amount: "", customerName: "", notes: "" })
      router.refresh() // Trigger server-side data refresh
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to log sale")
    } finally {
      setIsSubmitting(false)
    }
  }

  const openDialog = () => {
    // Auto-select active event if one exists
    setFormData({
      serviceId: "",
      eventId: activeEvent ? activeEvent.id : "",
      amount: "",
      customerName: "",
      notes: "",
    })
    setFormError("")
    setIsOpen(true)
  }

  return (
    <>
      <Button onClick={openDialog} size="sm" className="sm:size-default self-start">
        <span className="hidden sm:inline">Log Sale</span>
        <span className="sm:hidden">Log</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
              <Label htmlFor="event">
                Event {activeEvent && <span className="text-xs text-green-600">(Auto-selected active event)</span>}
              </Label>
              <Select
                value={formData.eventId || "none"}
                onValueChange={(value) =>
                  setFormData({ ...formData, eventId: value === "none" ? "" : value })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an event or leave blank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Event</SelectItem>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title} {event.status === "ACTIVE" && "🟢 Active"}
                      {event.status === "PUBLISHED" && "(Published)"}
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
              onClick={() => setIsOpen(false)}
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
    </>
  )
}
