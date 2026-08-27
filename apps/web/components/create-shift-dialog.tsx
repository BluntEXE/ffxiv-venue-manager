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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

interface EventOption {
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
  eventId?: string
}

interface CreateShiftDialogProps {
  venueSlug: string
  staff: StaffMember[]
  roles: RoleOption[]
  trigger?: React.ReactNode
  prefill?: ShiftPrefill
  potModeEnabled?: boolean
  events?: EventOption[]
}

export function CreateShiftDialog({
  venueSlug,
  staff,
  roles,
  trigger,
  prefill,
  potModeEnabled,
  events,
}: CreateShiftDialogProps) {
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
  const [eventId, setEventId] = useState(prefill?.eventId ?? "")
  const [quantity, setQuantity] = useState(1)
  const [repeating, setRepeating] = useState(false)
  const [recurrenceRule, setRecurrenceRule] = useState<"WEEKLY" | "BIWEEKLY" | "MONTHLY">("WEEKLY")

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

    const scheduledStartDate = new Date(`${date}T${startTime}:00`)
    let scheduledEndDate = new Date(`${date}T${endTime}:00`)

    if (scheduledEndDate.getTime() === scheduledStartDate.getTime()) {
      setError("End time must be after start time")
      return
    }
    if (scheduledEndDate < scheduledStartDate) {
      scheduledEndDate = new Date(scheduledEndDate.getTime() + 86400000)
    }

    const scheduledStart = scheduledStartDate.toISOString()
    const scheduledEnd = scheduledEndDate.toISOString()

    setSubmitting(true)
    setError(null)

    try {
      const count = mode === "open" ? Math.max(1, Math.min(20, quantity)) : 1
      // Only tag with a shared group when there's actually a group to tag: quantity > 1
      // AND repeating. A single recurring shift (quantity 1) needs no group ID.
      const slotGroupId = mode === "open" && repeating && count > 1 ? crypto.randomUUID() : undefined
      for (let i = 0; i < count; i++) {
        const res = await fetch(`/api/venues/${venueSlug}/shifts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(mode === "assign" ? { membershipId, ...(roleId ? { roleId } : {}) } : { roleId }),
            scheduledStart,
            scheduledEnd,
            notes: notes || undefined,
            ...(eventId ? { eventId } : {}),
            ...(repeating ? { recurrenceRule } : {}),
            ...(slotGroupId ? { slotGroupId } : {}),
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
      setEventId(prefill?.eventId ?? "")
      setQuantity(1)
      setRepeating(false)
      setRecurrenceRule("WEEKLY")
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
      <DialogTrigger asChild>{trigger ?? <Button>Schedule Shift</Button>}</DialogTrigger>
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
            <div className="space-y-4">
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
              <div className="space-y-2">
                <Label htmlFor="assign-role">Role (optional, for pay)</Label>
                <div className="flex gap-2">
                  <Select value={roleId} onValueChange={setRoleId}>
                    <SelectTrigger>
                      <SelectValue placeholder="No specific role tagged" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {roleId && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setRoleId("")}>
                      Clear
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tags this shift with a role for pay purposes. The role&apos;s rate is used instead of the staff member&apos;s
                  own rate when payroll is generated.
                </p>
              </div>
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

          {potModeEnabled && events && events.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="event">Event (optional, for pot payroll)</Label>
              <div className="flex gap-2">
                <Select value={eventId} onValueChange={setEventId}>
                  <SelectTrigger id="event">
                    <SelectValue placeholder="No event" />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {eventId && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEventId("")}>
                    Clear
                  </Button>
                )}
              </div>
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
                {repeating
                  ? "Creates this many independent repeating slots — each gets its own weekly/biweekly/monthly instances."
                  : "Creates this many identical open shifts for staff to claim."}
              </p>
            </div>
          )}

          <div className="space-y-3 p-4 border border-[var(--blue-015)] rounded-lg bg-[var(--blue-004)]">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="repeating" className="text-sm font-semibold">
                  Repeating Shift
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">Generates future instances automatically</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={repeating}
                id="repeating"
                onClick={() => setRepeating(!repeating)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--xiv-blue)] ${
                  repeating ? "bg-[var(--xiv-blue)]" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${repeating ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
            {repeating && (
              <div className="space-y-2">
                <Label htmlFor="recurrenceRule">Frequency</Label>
                <Select
                  value={recurrenceRule}
                  onValueChange={(v) => setRecurrenceRule(v as "WEEKLY" | "BIWEEKLY" | "MONTHLY")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="BIWEEKLY">Every two weeks</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start">Start</Label>
              <Input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">End</Label>
              <Input id="end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Times shown in your local time</p>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              placeholder="e.g. DJ set, bartender, greeter"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
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
