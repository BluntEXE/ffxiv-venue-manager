"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
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
  const [tipsTotal, setTipsTotal] = useState(0)
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

      // Fetch tips total for the current week
      try {
        const venueRes = await fetch(`/api/venues?slug=${slug}`)
        const venues = await venueRes.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)
        if (venue) {
          const now = new Date()
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          const tipsRes = await fetch(
            `/api/venues/${venue.id}/transactions?type=TIP&from=${weekAgo.toISOString()}`
          )
          if (tipsRes.ok) {
            const tips = await tipsRes.json()
            const total = (tips.items ?? tips).reduce((sum: number, t: { amount: number }) => sum + Number(t.amount), 0)
            setTipsTotal(Math.round(total))
          }
        }
      } catch { /* tips query is best-effort */ }
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="page-h1">Payroll</h1>
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
        {/* KPIs — matches prototype: Period payout / Pending / Tips pooled / Paid */}
        <div className="kpis">
          <Card className="px-[18px] py-4"><StatReadout label="Period payout" value={`${Math.round(unpaidTotal + paidTotal).toLocaleString()} gil`} subtext={`${payrollEntries.length} staff`}
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>} iconVariant="blue" /></Card>
          <Card className="px-[18px] py-4"><StatReadout label="Pending" value={payrollEntries.filter(e => !e.isPaid).length} subtext="awaiting run" deltaDirection="down"
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 2v20M19 2v20M12 2v4M12 18v4M5 12h7M12 12h7M5 2h14M5 22h14"/></svg>} iconVariant="warning" /></Card>
          <Card className="px-[18px] py-4"><StatReadout label="Tips pooled" value={tipsTotal > 0 ? `${tipsTotal.toLocaleString()} gil` : "—"} subtext="split by hours"
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>} iconVariant="warning" /></Card>
          <Card className="px-[18px] py-4"><StatReadout label="Paid" value={payrollEntries.filter(e => e.isPaid).length} subtext={`${Math.round(paidTotal).toLocaleString()} gil`} deltaDirection="up"
            icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>} iconVariant="success" /></Card>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-card border border-[var(--blue-015)] rounded-full p-1 w-fit">
          {(["all", "unpaid", "paid"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-colors capitalize ${
                filter === f
                  ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className={`ml-1.5 text-[0.68rem] ${filter === f ? "opacity-70" : "text-[var(--fg-faint)]"}`}>
                {f === "all" ? payrollEntries.length : f === "paid" ? payrollEntries.filter(e => e.isPaid).length : payrollEntries.filter(e => !e.isPaid).length}
              </span>
            </button>
          ))}
        </div>

        {/* Payroll table */}
        <div className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
          {filteredEntries.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">No payroll entries found.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Staff", "Period", "Hours", "Total", "Status", ""].map((h, i) => (
                    <th key={h || i} className={`text-left text-[0.68rem] font-medium uppercase tracking-[0.06em] text-[var(--xiv-blue)] px-5 py-3 border-b border-[var(--blue-008)] whitespace-nowrap ${
                      i === 2 ? "hidden md:table-cell" : ""
                    } ${i === 5 ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const name = entry.isManualEntry
                    ? entry.manualEntryName || "Unknown"
                    : entry.membership?.user?.displayName || entry.membership?.user?.name || "Unknown"
                  const initials = name.charAt(0).toUpperCase()
                  const total = Math.round(parseFloat(entry.totalAmount))
                  return (
                    <tr key={entry.id} className="border-b border-[var(--blue-008)] last:border-0 hover:bg-[var(--blue-004)] transition-colors">
                      {/* Staff */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={entry.membership?.user?.image || undefined} />
                            <AvatarFallback className="text-[0.65rem] font-bold bg-gradient-to-br from-[var(--xiv-blue)] to-blue-700 text-white">{initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{name}</p>
                            {entry.isManualEntry && <p className="text-[0.68rem] text-[var(--fg-faint)]">Manual</p>}
                          </div>
                        </div>
                      </td>
                      {/* Period */}
                      <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.periodStart), "d MMM")} – {format(new Date(entry.periodEnd), "d MMM")}
                      </td>
                      {/* Hours */}
                      <td className="px-5 py-3.5 text-sm text-muted-foreground hidden md:table-cell">
                        {entry.hoursWorked ? `${entry.hoursWorked}h` : "—"}
                      </td>
                      {/* Total */}
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-semibold font-[var(--font-heading)] text-[var(--xiv-blue)]">
                          {total.toLocaleString()} gil
                        </span>
                        {entry.bonusAmount && parseFloat(entry.bonusAmount) > 0 && (
                          <p className="text-[0.68rem] text-emerald-400">+{parseFloat(entry.bonusAmount).toLocaleString()} bonus</p>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-5 py-3.5">
                        {entry.isPaid ? (
                          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Paid</span>
                        ) : (
                          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant={entry.isPaid ? "outline" : "default"}
                            size="sm"
                            onClick={() => handleMarkAsPaid(entry.id, entry.isPaid)}
                            disabled={updatingId === entry.id}
                            className="text-xs"
                          >
                            {updatingId === entry.id ? "…" : entry.isPaid ? "Mark unpaid" : "Mark paid"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[var(--fg-faint)] hover:text-destructive"
                            onClick={() => handleDeleteEntry(entry.id, entry.isPaid)}
                            disabled={updatingId === entry.id}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </VenueLayoutClient>
  )
}
