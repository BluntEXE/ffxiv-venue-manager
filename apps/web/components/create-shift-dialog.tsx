"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRouter } from "next/navigation"

interface StaffMember {
  id: string
  name: string
  image: string | null
}

interface RoleOption {
  id: string
  name: string
}

interface ShiftPrefill {
  mode?: "assign" | "open"
  membershipId?: string
  roleId?: string
  date?: string
  startTime?: string
  endTime?: string
  notes?: string
}

interface CreateShiftDialogProps {
  venueSlug: string
  staff: StaffMember[]
  roles: RoleOption[]
  timezone?: string
  tzLabel?: string
  trigger?: React.ReactNode
  prefill?: ShiftPrefill
}

export function CreateShiftDialog({ venueSlug, staff, roles, trigger, prefill }: CreateShiftDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<"assign" | "open">(prefill?.mode ?? "assign")
  const [membershipId, setMembershipId] = useState(prefill?.membershipId ?? "")
  const [roleId, setRoleId] = useState(prefill?.roleId ?? "")
  const [date, setDate] = useState(prefill?.date ?? "")
  const [startTime, setStartTime] = useState(prefill?.startTime ?? "19:00")
  const [endTime, setEndTime] = useState(prefill?.endTime ?? "23:00")
  const [notes, setNotes] = useState(prefill?.notes ?? "")
  const [quantity, setQuantity] = useState(1)

  async function handleSubmit() {
    if (mode === "assign" && !membershipId) {
      setError("Please select a staff member")
      return
    }
    if (mode === "open" && !roleId) {
      setError("Please select a role")
      return
    }
    if (!date || !startTime || !endTime) {
      setError("Please fill in all required fields")
      return
    }

    // Z suffix → interpret as UTC (Server Time)
    const scheduledStart = new Date(`${date}T${startTime}:00Z`).toISOString()
    const scheduledEnd = new Date(`${date}T${endTime}:00Z`).toISOString()

    if (scheduledEnd <= scheduledStart) {
      setError("End time must be after start time")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const count = mode === "open" ? Math.max(1, Math.min(20, quantity)) : 1
      for (let i = 0; i < count; i++) {
        const res = await fetch(`/api/venues/${venueSlug}/shifts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(mode === "assign" ? { membershipId } : { roleId }),
            scheduledStart,
            scheduledEnd,
            notes: notes || undefined,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          setError(data.error || "Failed to create shift")
          return
        }
      }

      setMode(prefill?.mode ?? "assign")
      setMembershipId(prefill?.membershipId ?? "")
      setRoleId(prefill?.roleId ?? "")
      setDate(prefill?.date ?? "")
      setStartTime(prefill?.startTime ?? "19:00")
      setEndTime(prefill?.endTime ?? "23:00")
      setNotes(prefill?.notes ?? "")
      setQuantity(1)
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError("Network error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button>Schedule Shift</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{prefill ? "Duplicate Shift" : "Schedule a Shift"}</DialogTitle>
          <DialogDescription>
            Assign a staff member now, or leave the slot open for a specific role to be filled later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Assignment</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "assign" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("assign")}
              >
                Assign to staff member
              </Button>
              <Button
                type="button"
                variant={mode === "open" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("open")}
              >
                Leave open (require role)
              </Button>
            </div>
          </div>

          {mode === "assign" ? (
            <div className="space-y-2">
              <Label htmlFor="staff">Staff Member</Label>
              <Select value={membershipId} onValueChange={setMembershipId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="role">Required Role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select required role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No custom roles set up yet. Create one in Staff settings first.
                </p>
              )}
            </div>
          )}

          {mode === "open" && (
            <div className="space-y-2">
              <Label htmlFor="quantity">How many open slots?</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                max={20}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">
                Creates this many identical open shifts for staff to claim.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start">Start</Label>
              <Input
                id="start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">End</Label>
              <Input
                id="end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            All times are in Server Time (ST)
          </p>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              placeholder="e.g. DJ set, bartender, greeter"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? "Creating..."
              : mode === "open" && quantity > 1
                ? `Create ${quantity} Shifts`
                : "Create Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
