"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { Breadcrumb } from "@/components/breadcrumb"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { StatReadout } from "@/components/ui/stat-readout"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { format } from "date-fns"
import { Plus, DollarSign, Clock, CheckCircle2, XCircle, Zap, Trash2 } from "lucide-react"
import { PageLoading } from "@/components/ui/loading-spinner"

interface PayrollEntry {
  id: string
  paymentType: "FIXED_SALARY" | "HOURLY"
  baseRate: string
  hoursWorked: string | null
  bonusAmount: string | null
  totalAmount: string
  periodStart: string
  periodEnd: string
  isPaid: boolean
  paidAt: string | null
  notes: string | null
  isManualEntry: boolean
  manualEntryName: string | null
  membership: {
    id: string
    role: string
    user: {
      id: string
      name: string | null
      displayName: string | null
      image: string | null
    } | null
    customRole: {
      id: string
      name: string
      color: string | null
    } | null
  } | null
  paidByUser: {
    id: string
    name: string | null
    displayName: string | null
  } | null
}

interface StaffMember {
  id: string
  userId: string | null
  role: string
  hourlyRate: string | null
  user: {
    id: string
    name: string | null
    displayName: string | null
    image: string | null
  } | null
  customRole: {
    id: string
    name: string
  } | null
}

interface ShiftPreview {
  id: string
  scheduledStart: string
  scheduledEnd: string
  actualStart: string | null
  actualEnd: string | null
  hoursWorked: number
}

interface GeneratePreview {
  staff: {
    membershipId: string
    name: string
    image: string | null
    defaultHourlyRate: number | null
  }
  shifts: ShiftPreview[]
  summary: {
    shiftCount: number
    totalHours: number
    estimatedTotal: number | null
  }
}

export default function PayrollPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const slug = params?.slug as string

  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [filter, setFilter] = useState<"all" | "paid" | "unpaid">("all")
  const [isCreating, setIsCreating] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Form state
  const [isManualEntry, setIsManualEntry] = useState(false)
  const [manualEntryName, setManualEntryName] = useState("")
  const [selectedStaff, setSelectedStaff] = useState("")
  const [paymentType, setPaymentType] = useState<"FIXED_SALARY" | "HOURLY">("FIXED_SALARY")
  const [baseRate, setBaseRate] = useState("")
  const [hoursWorked, setHoursWorked] = useState("")
  const [bonusAmount, setBonusAmount] = useState("")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [notes, setNotes] = useState("")

  // Generate from Shifts dialog state
  const [isGenerateOpen, setIsGenerateOpen] = useState(false)
  const [genStaff, setGenStaff] = useState("")
  const [genPeriodStart, setGenPeriodStart] = useState("")
  const [genPeriodEnd, setGenPeriodEnd] = useState("")
  const [genRateOverride, setGenRateOverride] = useState("")
  const [genBonus, setGenBonus] = useState("")
  const [genNotes, setGenNotes] = useState("")
  const [genPreview, setGenPreview] = useState<GeneratePreview | null>(null)
  const [genLoading, setGenLoading] = useState(false)
  const [genCreating, setGenCreating] = useState(false)

  const venueId = params?.slug as string

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin")
    }
  }, [status, router])

  useEffect(() => {
    if (session && slug) {
      fetchPayrollEntries()
      fetchStaff()
    }
  }, [session, slug, filter])

  const fetchPayrollEntries = async () => {
    try {
      const isPaidQuery = filter === "paid" ? "true" : filter === "unpaid" ? "false" : ""
      const response = await fetch(
        `/api/venues/${slug}/payroll${isPaidQuery ? `?isPaid=${isPaidQuery}` : ""}`
      )

      if (!response.ok) {
        if (response.status === 403) {
          router.push(`/dashboard/${slug}`)
          return
        }
        throw new Error("Failed to fetch payroll entries")
      }

      const data = await response.json()
      setPayrollEntries(data)
    } catch (error) {
      console.error("Error fetching payroll entries:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStaff = async () => {
    try {
      const response = await fetch(`/api/venues/${slug}/staff`)

      if (!response.ok) {
        throw new Error("Failed to fetch staff")
      }

      const data = await response.json()
      // API already filters for active members with user accounts
      setStaff(data)
    } catch (error) {
      console.error("Error fetching staff:", error)
    }
  }

  const handleCreatePayroll = async () => {
    setIsCreating(true)
    try {
      const response = await fetch(`/api/venues/${slug}/payroll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isManualEntry,
          manualEntryName: isManualEntry ? manualEntryName : null,
          membershipId: isManualEntry ? null : selectedStaff,
          paymentType,
          baseRate: parseFloat(baseRate),
          hoursWorked: paymentType === "HOURLY" && hoursWorked ? parseFloat(hoursWorked) : null,
          bonusAmount: bonusAmount ? parseFloat(bonusAmount) : null,
          periodStart,
          periodEnd,
          notes,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create payroll entry")
      }

      // Reset form
      setIsManualEntry(false)
      setManualEntryName("")
      setSelectedStaff("")
      setPaymentType("FIXED_SALARY")
      setBaseRate("")
      setHoursWorked("")
      setBonusAmount("")
      setPeriodStart("")
      setPeriodEnd("")
      setNotes("")
      setIsDialogOpen(false)

      // Refresh list
      fetchPayrollEntries()
    } catch (error) {
      console.error("Error creating payroll entry:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to create payroll entry"
      alert(errorMessage)
    } finally {
      setIsCreating(false)
    }
  }

  const handleMarkAsPaid = async (payrollId: string, currentStatus: boolean) => {
    setUpdatingId(payrollId)
    try {
      const response = await fetch(`/api/venues/${slug}/payroll/${payrollId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isPaid: !currentStatus,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update payroll entry")
      }

      // Refresh list
      fetchPayrollEntries()
    } catch (error) {
      console.error("Error updating payroll entry:", error)
      alert("Failed to update payroll entry")
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDeleteEntry = async (payrollId: string, isPaid: boolean) => {
    const msg = isPaid
      ? "This payroll entry is marked PAID. Deleting it removes the record of that payment. Continue?"
      : "Delete this payroll entry? This cannot be undone."
    if (!confirm(msg)) return

    setUpdatingId(payrollId)
    try {
      const response = await fetch(`/api/venues/${slug}/payroll/${payrollId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        alert(body.error || `Delete failed (${response.status})`)
        return
      }
      fetchPayrollEntries()
    } catch (error) {
      console.error("Error deleting payroll entry:", error)
      alert("Failed to delete payroll entry")
    } finally {
      setUpdatingId(null)
    }
  }

  const fetchGeneratePreview = async () => {
    if (!genStaff || !genPeriodStart || !genPeriodEnd) return
    setGenLoading(true)
    setGenPreview(null)
    try {
      const params = new URLSearchParams({
        membershipId: genStaff,
        periodStart: genPeriodStart,
        periodEnd: genPeriodEnd,
      })
      const response = await fetch(
        `/api/venues/${slug}/payroll/generate?${params}`
      )
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Failed to fetch preview")
      }
      const data = await response.json()
      setGenPreview(data)
      // Auto-fill rate from staff default if no override set
      if (!genRateOverride && data.staff.defaultHourlyRate) {
        setGenRateOverride(String(data.staff.defaultHourlyRate))
      }
    } catch (error) {
      console.error("Error fetching generate preview:", error)
      const msg = error instanceof Error ? error.message : "Failed to fetch preview"
      alert(msg)
    } finally {
      setGenLoading(false)
    }
  }

  const handleGeneratePayroll = async () => {
    if (!genStaff || !genPeriodStart || !genPeriodEnd) return
    setGenCreating(true)
    try {
      const response = await fetch(`/api/venues/${slug}/payroll/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: genStaff,
          periodStart: genPeriodStart,
          periodEnd: genPeriodEnd,
          baseRate: genRateOverride ? parseFloat(genRateOverride) : undefined,
          bonusAmount: genBonus ? parseFloat(genBonus) : undefined,
          notes: genNotes || undefined,
        }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Failed to generate payroll")
      }
      // Reset and close
      setGenStaff("")
      setGenPeriodStart("")
      setGenPeriodEnd("")
      setGenRateOverride("")
      setGenBonus("")
      setGenNotes("")
      setGenPreview(null)
      setIsGenerateOpen(false)
      fetchPayrollEntries()
    } catch (error) {
      console.error("Error generating payroll:", error)
      const msg = error instanceof Error ? error.message : "Failed to generate payroll"
      alert(msg)
    } finally {
      setGenCreating(false)
    }
  }

  const genEffectiveRate = genRateOverride
    ? parseFloat(genRateOverride)
    : genPreview?.staff.defaultHourlyRate ?? 0
  const genEstimatedTotal = genPreview
    ? Math.round(genEffectiveRate * genPreview.summary.totalHours) + (genBonus ? parseFloat(genBonus) || 0 : 0)
    : 0

  const calculateTotal = () => {
    let total = parseFloat(baseRate) || 0

    if (paymentType === "HOURLY" && hoursWorked) {
      total = (parseFloat(baseRate) || 0) * (parseFloat(hoursWorked) || 0)
    }

    if (bonusAmount) {
      total += parseFloat(bonusAmount) || 0
    }

    return Math.round(total).toLocaleString()
  }

  if (loading) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="p-4 md:p-6">
          <PageLoading text="Loading payroll..." />
        </div>
      </VenueLayoutClient>
    )
  }

  const filteredEntries = payrollEntries

  const unpaidTotal = payrollEntries
    .filter((e) => !e.isPaid)
    .reduce((sum, e) => sum + parseFloat(e.totalAmount), 0)

  const paidTotal = payrollEntries
    .filter((e) => e.isPaid)
    .reduce((sum, e) => sum + parseFloat(e.totalAmount), 0)

  return (
    <VenueLayoutClient slug={slug}>
      <div className="p-4 md:p-6 space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Venue", href: `/dashboard/${slug}` },
            { label: "Payroll" },
          ]}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div>
            <h1 className="font-cinzel text-2xl md:text-3xl font-bold tracking-[0.02em]">Payroll</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">Manage staff compensation and payments</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
          <Dialog open={isGenerateOpen} onOpenChange={(open) => {
            setIsGenerateOpen(open)
            if (!open) {
              setGenPreview(null)
              setGenStaff("")
              setGenPeriodStart("")
              setGenPeriodEnd("")
              setGenRateOverride("")
              setGenBonus("")
              setGenNotes("")
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Zap className="mr-2 h-4 w-4" />
                Generate from Shifts
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Generate Payroll from Shifts</DialogTitle>
                <DialogDescription>
                  Automatically calculate pay from completed, unpaid shifts
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Staff Selection */}
                <div className="space-y-2">
                  <Label>Staff Member</Label>
                  <Select value={genStaff} onValueChange={(v) => { setGenStaff(v); setGenPreview(null) }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.user?.displayName || member.user?.name || "Unknown"}
                          {member.hourlyRate ? ` (${member.hourlyRate} Gil/hr)` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Period Start</Label>
                    <Input
                      type="date"
                      value={genPeriodStart}
                      onChange={(e) => { setGenPeriodStart(e.target.value); setGenPreview(null) }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Period End</Label>
                    <Input
                      type="date"
                      value={genPeriodEnd}
                      onChange={(e) => { setGenPeriodEnd(e.target.value); setGenPreview(null) }}
                    />
                  </div>
                </div>

                {/* Preview Button */}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={fetchGeneratePreview}
                  disabled={!genStaff || !genPeriodStart || !genPeriodEnd || genLoading}
                >
                  {genLoading ? "Loading..." : "Preview Shifts"}
                </Button>

                {/* Preview Results */}
                {genPreview && (
                  <>
                    {genPreview.shifts.length === 0 ? (
                      <div className="p-4 bg-muted rounded-lg text-center text-muted-foreground">
                        No unpaid completed shifts found in this period
                      </div>
                    ) : (
                      <>
                        {/* Shift List */}
                        <div className="space-y-2">
                          <Label>{genPreview.summary.shiftCount} Shift{genPreview.summary.shiftCount !== 1 ? "s" : ""} Found</Label>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {genPreview.shifts.map((shift) => (
                              <div
                                key={shift.id}
                                className="flex justify-between items-center p-2 bg-muted rounded text-sm"
                              >
                                <span>
                                  {format(new Date(shift.actualStart!), "MMM d, h:mm a")} –{" "}
                                  {format(new Date(shift.actualEnd!), "h:mm a")}
                                </span>
                                <span className="font-mono">{shift.hoursWorked}h</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Rate Override */}
                        <div className="space-y-2">
                          <Label>
                            Hourly Rate
                            {genPreview.staff.defaultHourlyRate && (
                              <span className="text-muted-foreground font-normal ml-1">
                                (default: {genPreview.staff.defaultHourlyRate} Gil/hr)
                              </span>
                            )}
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder={genPreview.staff.defaultHourlyRate?.toString() || "Enter rate"}
                            value={genRateOverride}
                            onChange={(e) => setGenRateOverride(e.target.value)}
                          />
                        </div>

                        {/* Bonus */}
                        <div className="space-y-2">
                          <Label>Bonus (Optional)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            value={genBonus}
                            onChange={(e) => setGenBonus(e.target.value)}
                          />
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                          <Label>Notes (Optional)</Label>
                          <Textarea
                            placeholder="Add any notes..."
                            value={genNotes}
                            onChange={(e) => setGenNotes(e.target.value)}
                          />
                        </div>

                        {/* Summary */}
                        <div className="p-4 bg-muted rounded-lg space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>Total Hours</span>
                            <span className="font-mono">{genPreview.summary.totalHours}h</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Rate</span>
                            <span className="font-mono">{genEffectiveRate} Gil/hr</span>
                          </div>
                          {genBonus && parseFloat(genBonus) > 0 && (
                            <div className="flex justify-between text-sm">
                              <span>Bonus</span>
                              <span className="font-mono">+{parseFloat(genBonus)} Gil</span>
                            </div>
                          )}
                          <div className="flex justify-between font-semibold pt-2 border-t border-border">
                            <span>Total</span>
                            <span className="text-lg">{Math.round(genEstimatedTotal).toLocaleString()} Gil</span>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsGenerateOpen(false)} disabled={genCreating}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGeneratePayroll}
                  disabled={
                    !genPreview ||
                    genPreview.shifts.length === 0 ||
                    genEffectiveRate <= 0 ||
                    genCreating
                  }
                >
                  {genCreating ? "Generating..." : `Generate (${genPreview?.summary.shiftCount || 0} shifts)`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Manual Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Payroll Entry</DialogTitle>
                <DialogDescription>
                  Add a new payroll entry for a staff member
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Manual Entry Toggle */}
                <div className="flex items-center space-x-2 p-4 bg-muted rounded-lg border-2 border-border">
                  <Checkbox
                    id="manual-entry"
                    checked={isManualEntry}
                    onCheckedChange={(checked) => {
                      setIsManualEntry(checked as boolean)
                      // Clear staff selection when switching to manual entry
                      if (checked) setSelectedStaff("")
                      // Clear manual name when switching to staff selection
                      else setManualEntryName("")
                    }}
                  />
                  <Label
                    htmlFor="manual-entry"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Manual Entry (for temp DJs, contractors, etc.)
                  </Label>
                </div>

                {/* Conditional: Staff Selection OR Manual Name Input */}
                {!isManualEntry ? (
                  <div className="space-y-2">
                    <Label>Staff Member</Label>
                    <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                      <SelectContent>
                        {staff.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.user?.displayName || member.user?.name || "Unknown"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      type="text"
                      placeholder="Enter name (e.g., John Doe)"
                      value={manualEntryName}
                      onChange={(e) => setManualEntryName(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter the name of the temporary DJ or contractor
                    </p>
                  </div>
                )}

                {/* Payment Type */}
                <div className="space-y-2">
                  <Label>Payment Type</Label>
                  <Select
                    value={paymentType}
                    onValueChange={(value) => setPaymentType(value as "FIXED_SALARY" | "HOURLY")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED_SALARY">Fixed Salary</SelectItem>
                      <SelectItem value="HOURLY">Hourly Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Base Rate */}
                <div className="space-y-2">
                  <Label>{paymentType === "HOURLY" ? "Hourly Rate" : "Fixed Amount"}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={baseRate}
                    onChange={(e) => setBaseRate(e.target.value)}
                  />
                </div>

                {/* Hours Worked (Hourly only) */}
                {paymentType === "HOURLY" && (
                  <div className="space-y-2">
                    <Label>Hours Worked</Label>
                    <Input
                      type="number"
                      step="0.25"
                      placeholder="0.00"
                      value={hoursWorked}
                      onChange={(e) => setHoursWorked(e.target.value)}
                    />
                  </div>
                )}

                {/* Bonus Amount */}
                <div className="space-y-2">
                  <Label>Bonus (Optional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={bonusAmount}
                    onChange={(e) => setBonusAmount(e.target.value)}
                  />
                </div>

                {/* Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Period Start</Label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Period End</Label>
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    placeholder="Add any additional notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Total Preview */}
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total Amount:</span>
                    <span className="text-2xl font-bold">{calculateTotal()} Gil</span>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isCreating}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreatePayroll}
                  disabled={
                    (!isManualEntry && !selectedStaff) ||
                    (isManualEntry && !manualEntryName.trim()) ||
                    !baseRate ||
                    !periodStart ||
                    !periodEnd ||
                    isCreating
                  }
                >
                  {isCreating ? "Creating..." : "Create Entry"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4"><StatReadout label="Unpaid" value={`${Math.round(unpaidTotal).toLocaleString()} gil`} subtext={`${payrollEntries.filter(e => !e.isPaid).length} entries`} deltaDirection="down" /></Card>
          <Card className="p-4"><StatReadout label="Paid" value={`${Math.round(paidTotal).toLocaleString()} gil`} subtext={`${payrollEntries.filter(e => e.isPaid).length} entries`} deltaDirection="up" /></Card>
          <Card className="p-4"><StatReadout label="Total" value={`${Math.round(unpaidTotal + paidTotal).toLocaleString()} gil`} subtext={`${payrollEntries.length} entries`} /></Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button
            variant={filter === "unpaid" ? "default" : "outline"}
            onClick={() => setFilter("unpaid")}
          >
            Unpaid
          </Button>
          <Button
            variant={filter === "paid" ? "default" : "outline"}
            onClick={() => setFilter("paid")}
          >
            Paid
          </Button>
        </div>

        {/* Payroll Entries List */}
        <div className="space-y-4">
          {filteredEntries.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No payroll entries found. Click "Add Payroll Entry" to create one.
              </CardContent>
            </Card>
          ) : (
            filteredEntries.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <Avatar>
                        <AvatarImage src={entry.isManualEntry ? undefined : entry.membership?.user?.image || undefined} />
                        <AvatarFallback>
                          {entry.isManualEntry
                            ? (entry.manualEntryName || "?")[0].toUpperCase()
                            : (entry.membership?.user?.displayName ||
                                entry.membership?.user?.name ||
                                "?")[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-semibold">
                            {entry.isManualEntry
                              ? entry.manualEntryName || "Unknown"
                              : entry.membership?.user?.displayName ||
                                entry.membership?.user?.name ||
                                "Unknown"}
                          </h3>
                          {entry.isManualEntry && (
                            <Badge variant="outline" className="bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]">
                              Manual
                            </Badge>
                          )}
                          <Badge variant={entry.isPaid ? "default" : "secondary"}>
                            {entry.isPaid ? "Paid" : "Unpaid"}
                          </Badge>
                          {entry.paymentType === "HOURLY" && (
                            <Badge variant="outline">
                              <Clock className="mr-1 h-3 w-3" />
                              Hourly
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground">
                          {format(new Date(entry.periodStart), "MMM d, yyyy")} -{" "}
                          {format(new Date(entry.periodEnd), "MMM d, yyyy")}
                        </p>

                        {entry.paymentType === "HOURLY" && entry.hoursWorked && (
                          <p className="text-sm">
                            {entry.hoursWorked} hours @ {entry.baseRate} Gil/hr
                          </p>
                        )}

                        {entry.bonusAmount && parseFloat(entry.bonusAmount) > 0 && (
                          <p className="text-sm text-emerald-400">
                            + {entry.bonusAmount} Gil bonus
                          </p>
                        )}

                        {entry.notes && (
                          <p className="text-sm text-muted-foreground italic">{entry.notes}</p>
                        )}

                        {entry.isPaid && entry.paidAt && (
                          <p className="text-xs text-muted-foreground">
                            Paid on {format(new Date(entry.paidAt), "MMM d, yyyy")} by{" "}
                            {entry.paidByUser?.displayName || entry.paidByUser?.name || "Unknown"}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end space-y-2">
                      <div className="text-2xl font-bold">
                        {Math.round(parseFloat(entry.totalAmount)).toLocaleString()} Gil
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant={entry.isPaid ? "outline" : "default"}
                          size="sm"
                          onClick={() => handleMarkAsPaid(entry.id, entry.isPaid)}
                          disabled={updatingId === entry.id}
                        >
                          {updatingId === entry.id ? (
                            "Updating..."
                          ) : entry.isPaid ? (
                            <>
                              <XCircle className="mr-2 h-4 w-4" />
                              Mark Unpaid
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Mark as Paid
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteEntry(entry.id, entry.isPaid)}
                          disabled={updatingId === entry.id}
                          aria-label="Delete payroll entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </VenueLayoutClient>
  )
}
