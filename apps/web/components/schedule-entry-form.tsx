"use client"

import { useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select"
import { DAY_NAMES } from "@/lib/schedule-utils"

type EntryFormData = {
  day: number
  startHour: number
  startMin: number
  endHour: number | null
  endMin: number | null
  crossesMidnight: boolean
  interval: string
  weekOfMonth: number | null
  commencing: string | null
  label: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  onSave: (data: EntryFormData) => Promise<void>
  initial?: Partial<EntryFormData>
  title?: string
}

const defaultForm = (): EntryFormData => ({
  day: 5,
  startHour: 21,
  startMin: 0,
  endHour: null,
  endMin: null,
  crossesMidnight: false,
  interval: "WEEKLY",
  weekOfMonth: 1,
  commencing: null,
  label: null,
})

function toTimeString(h: number, m: number) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function parseTime(val: string): [number, number] {
  const [h, m] = val.split(":").map(Number)
  return [h ?? 0, m ?? 0]
}

export function ScheduleEntryForm({ open, onClose, onSave, initial, title = "Add schedule entry" }: Props) {
  const [form, setForm] = useState<EntryFormData>({ ...defaultForm(), ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasEnd = form.endHour != null

  function setStart(val: string) {
    const [h, m] = parseTime(val)
    const endH = form.endHour
    const crosses = endH != null && (h > endH || (h === endH && m > (form.endMin ?? 0)))
    setForm(f => ({ ...f, startHour: h, startMin: m, crossesMidnight: crosses }))
  }

  function setEnd(val: string) {
    if (!val) {
      setForm(f => ({ ...f, endHour: null, endMin: null, crossesMidnight: false }))
      return
    }
    const [h, m] = parseTime(val)
    const crosses = form.startHour > h || (form.startHour === h && form.startMin > m)
    setForm(f => ({ ...f, endHour: h, endMin: m, crossesMidnight: crosses }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="bg-[var(--card)] border-[var(--blue-015)] max-w-md">
        <DialogHeader>
          <DialogTitle className="font-cinzel">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Day</Label>
            <Select value={String(form.day)} onValueChange={v => setForm(f => ({ ...f, day: Number(v) }))}>
              <SelectTrigger className="bg-background border-[var(--blue-015)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_NAMES.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Opens (ST)</Label>
              <input type="time" value={toTimeString(form.startHour, form.startMin)}
                onChange={e => setStart(e.target.value)}
                className="w-full rounded-md border border-[var(--blue-015)] bg-background px-3 py-2 text-sm text-foreground focus:border-[var(--blue-035)] focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <Label>Closes (ST) <span className="text-[var(--fg-faint)] font-normal">optional</span></Label>
              <input type="time" value={hasEnd ? toTimeString(form.endHour!, form.endMin ?? 0) : ""}
                onChange={e => setEnd(e.target.value)}
                className="w-full rounded-md border border-[var(--blue-015)] bg-background px-3 py-2 text-sm text-foreground focus:border-[var(--blue-035)] focus:outline-none" />
            </div>
          </div>

          {form.crossesMidnight && (
            <p className="text-[0.78rem] text-[var(--xiv-blue)]">Closes the next day (crosses midnight ST)</p>
          )}

          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <Select value={form.interval} onValueChange={v => setForm(f => ({ ...f, interval: v }))}>
              <SelectTrigger className="bg-background border-[var(--blue-015)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WEEKLY">Every week</SelectItem>
                <SelectItem value="BIWEEKLY">Every 2 weeks</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.interval === "MONTHLY" && (
            <div className="space-y-1.5">
              <Label>Which {DAY_NAMES[form.day]}?</Label>
              <Select value={String(form.weekOfMonth ?? 1)} onValueChange={v => setForm(f => ({ ...f, weekOfMonth: Number(v) }))}>
                <SelectTrigger className="bg-background border-[var(--blue-015)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["First","Second","Third","Fourth","Last"].map((o, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{o} {DAY_NAMES[form.day]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.interval === "BIWEEKLY" && (
            <div className="space-y-1.5">
              <Label>Starting from</Label>
              <Input type="date" value={form.commencing?.slice(0, 10) ?? ""}
                onChange={e => setForm(f => ({ ...f, commencing: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]" />
              <p className="text-[0.75rem] text-[var(--fg-faint)]">Pick any date this entry is active so we know which weeks to count.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Label <span className="text-[var(--fg-faint)] font-normal">optional</span></Label>
            <Input placeholder="e.g. DJ Night" maxLength={50}
              value={form.label ?? ""}
              onChange={e => setForm(f => ({ ...f, label: e.target.value || null }))}
              className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]" />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}
            className="bg-[var(--xiv-blue)] text-black hover:opacity-90">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
