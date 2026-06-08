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
  color: string | null
}

interface CreateShiftDialogProps {
  venueSlug: string
  staff: StaffMember[]
  roles: RoleOption[]
  timezone?: string
  tzLabel?: string
}

export function CreateShiftDialog({ venueSlug, staff, roles }: CreateShiftDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<"assign" | "open">("assign")
  const [membershipId, setMembershipId] = useState("")
  const [roleId, setRoleId] = useState("")
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("19:00")
  const [endTime, setEndTime] = useState("23:00")
  const [notes, setNotes] = useState("")

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

      setMode("assign")
      setMembershipId("")
      setRoleId("")
      setDate("")
      setStartTime("19:00")
      setEndTime("23:00")
      setNotes("")
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
        <Button>Schedule Shift</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule a Shift</DialogTitle>
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
            {submitting ? "Creating..." : "Create Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
