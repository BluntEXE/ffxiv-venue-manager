# Venue Opening Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile free-text "Default hours / Open nights" fields with a structured recurring schedule model that supports weekly, biweekly, and monthly patterns, displayed correctly in Server Time (UTC) on venue profiles.

**Architecture:** New `VenueScheduleEntry` Prisma model stores day-of-week + UTC start/end times + interval type. A utility module handles formatting and "is open now" detection. The venue profile Hours card and the settings page both read from this model; old free-text fields are kept in the DB but demoted to a legacy fallback in display.

**Tech Stack:** Next.js 15 App Router, Prisma v7 (db push workflow -- no migrations table), TypeScript, Zod, Tailwind/XIV design system, existing Dialog/Input/Label/Select UI components.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `apps/web/prisma/schema.prisma` | Modify | Add `VenueScheduleEntry` model + relation on `Venue` |
| `apps/web/lib/schedule-utils.ts` | Create | Format helpers, interval label, `isOpenNow` logic |
| `apps/web/app/api/venues/[venueId]/schedule/route.ts` | Create | GET list + POST create |
| `apps/web/app/api/venues/[venueId]/schedule/[entryId]/route.ts` | Create | PUT update + DELETE |
| `apps/web/components/schedule-entry-form.tsx` | Create | Add/edit entry dialog |
| `apps/web/components/venue-schedule-display.tsx` | Create | Read-only schedule table for profile + dashboard |
| `apps/web/app/dashboard/[slug]/settings/page.tsx` | Modify | Add schedule management section, demote old text fields |
| `apps/web/app/venues/[slug]/page.tsx` | Modify | Replace Hours card with structured display + wire Open Now badge |

---

## Task 1: Prisma Schema

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Add `VenueScheduleEntry` model after the `Venue` model (around line 201):**

```prisma
model VenueScheduleEntry {
  id              String    @id @default(cuid())
  venueId         String
  day             Int       // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  startHour       Int       // 0-23 UTC / Server Time
  startMin        Int       // 0-59
  endHour         Int?      // null = no fixed end time
  endMin          Int?
  crossesMidnight Boolean   @default(false) // end time is next calendar day
  interval        String    @default("weekly") // "weekly"|"biweekly"|"monthly"
  weekOfMonth     Int?      // monthly only: 1=first 2=second 3=third 4=fourth 5=last
  commencing      DateTime? // biweekly only: anchor date to determine which weeks
  label           String?   // optional e.g. "DJ Night"

  venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)

  @@index([venueId])
  @@map("venue_schedule_entries")
}
```

- [ ] **Add the relation to the `Venue` model (before `@@map("venues")`):**

```prisma
  scheduleEntries VenueScheduleEntry[]
```

- [ ] **Apply the schema to the database:**

```bash
cd ~/xiv-app/apps/web
pnpm prisma db push
```

Expected output: `Your database is now in sync with your Prisma schema.`

- [ ] **Verify the table exists:**

```bash
ssh server@192.168.1.122 "docker exec postgres psql -U postgres -d venue_manager -c '\d venue_schedule_entries'"
```

Expected: table with columns id, venueId, day, startHour, startMin, endHour, endMin, crossesMidnight, interval, weekOfMonth, commencing, label.

- [ ] **Commit:**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat: add VenueScheduleEntry model for structured opening hours"
```

---

## Task 2: Schedule Utility Functions

**Files:**
- Create: `apps/web/lib/schedule-utils.ts`

- [ ] **Create the file:**

```ts
// Utility functions for venue opening schedule entries.
// All times are UTC (= FFXIV Server Time). No timezone conversion needed.

export type ScheduleEntry = {
  id: string
  venueId: string
  day: number
  startHour: number
  startMin: number
  endHour: number | null
  endMin: number | null
  crossesMidnight: boolean
  interval: string
  weekOfMonth: number | null
  commencing: Date | string | null
  label: string | null
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
export const DAY_SHORT  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function formatHHMM(h: number, m: number): string {
  const period   = h >= 12 ? "PM" : "AM"
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  const displayM = m === 0 ? "" : `:${String(m).padStart(2, "0")}`
  return `${displayH}${displayM} ${period}`
}

export function formatEntryTime(entry: ScheduleEntry): string {
  const start = formatHHMM(entry.startHour, entry.startMin)
  if (entry.endHour == null) return `${start} ST`
  const end = formatHHMM(entry.endHour, entry.endMin ?? 0)
  return `${start} – ${end} ST`
}

export function formatIntervalLabel(entry: ScheduleEntry): string {
  if (entry.interval === "weekly")   return "Weekly"
  if (entry.interval === "biweekly") return "Every 2 weeks"
  if (entry.interval === "monthly") {
    const ordinals = ["", "1st", "2nd", "3rd", "4th", "Last"]
    return `${ordinals[entry.weekOfMonth ?? 1] ?? "Monthly"} of month`
  }
  return entry.interval
}

export function isOpenNow(entries: ScheduleEntry[]): boolean {
  return entries.some(isEntryActiveNow)
}

function isEntryActiveNow(entry: ScheduleEntry): boolean {
  const now        = new Date()
  const todayDay   = now.getUTCDay()
  const currentMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  const startMin   = entry.startHour * 60 + entry.startMin
  const endMin     = entry.endHour != null ? entry.endHour * 60 + (entry.endMin ?? 0) : null

  if (!matchesInterval(entry, now)) return false

  // Direct day match
  if (entry.day === todayDay) {
    if (endMin == null)              return currentMin >= startMin
    if (!entry.crossesMidnight)      return currentMin >= startMin && currentMin < endMin
    return currentMin >= startMin    // crosses midnight: today's portion is start → midnight
  }

  // Crosses-midnight: are we in the "after midnight" window (next calendar day)?
  if (entry.crossesMidnight && endMin != null) {
    const prevDay = (todayDay + 6) % 7
    if (entry.day === prevDay) return currentMin < endMin
  }

  return false
}

function matchesInterval(entry: ScheduleEntry, now: Date): boolean {
  if (entry.interval === "weekly") return true

  if (entry.interval === "biweekly") {
    if (!entry.commencing) return true
    const anchor   = new Date(entry.commencing)
    const diffMs   = now.getTime() - anchor.getTime()
    const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000))
    return diffWeeks >= 0 && diffWeeks % 2 === 0
  }

  if (entry.interval === "monthly" && entry.weekOfMonth != null) {
    if (entry.weekOfMonth === 5) return isLastWeekdayOfMonth(now, entry.day)
    return getWeekdayOccurrence(now, entry.day) === entry.weekOfMonth
  }

  return true
}

function getWeekdayOccurrence(date: Date, weekday: number): number {
  const year  = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const target = date.getUTCDate()
  let count = 0
  for (let d = 1; d <= target; d++) {
    if (new Date(Date.UTC(year, month, d)).getUTCDay() === weekday) count++
  }
  return count
}

function isLastWeekdayOfMonth(date: Date, weekday: number): boolean {
  if (date.getUTCDay() !== weekday) return false
  const year  = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const days  = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const target = date.getUTCDate()
  for (let d = target + 1; d <= days; d++) {
    if (new Date(Date.UTC(year, month, d)).getUTCDay() === weekday) return false
  }
  return true
}
```

- [ ] **Commit:**

```bash
git add apps/web/lib/schedule-utils.ts
git commit -m "feat: add schedule utility functions (format, isOpenNow)"
```

---

## Task 3: API — List & Create

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/schedule/route.ts`

- [ ] **Create the file:**

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const entrySchema = z.object({
  day:            z.number().int().min(0).max(6),
  startHour:      z.number().int().min(0).max(23),
  startMin:       z.number().int().min(0).max(59),
  endHour:        z.number().int().min(0).max(23).nullable().optional(),
  endMin:         z.number().int().min(0).max(59).nullable().optional(),
  crossesMidnight:z.boolean().default(false),
  interval:       z.enum(["weekly", "biweekly", "monthly"]).default("weekly"),
  weekOfMonth:    z.number().int().min(1).max(5).nullable().optional(),
  commencing:     z.string().datetime().nullable().optional(),
  label:          z.string().max(50).nullable().optional(),
})

async function requireManager(venueId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { venueId, userId, role: { in: ["OWNER", "MANAGER"] }, isActive: true },
  })
  return !!membership
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params
  const entries = await prisma.venueScheduleEntry.findMany({
    where: { venueId },
    orderBy: [{ day: "asc" }, { startHour: "asc" }, { startMin: "asc" }],
  })
  return NextResponse.json(entries)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  if (!(await requireManager(venueId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = entrySchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 })

  const entry = await prisma.venueScheduleEntry.create({
    data: {
      venueId,
      ...body.data,
      commencing: body.data.commencing ? new Date(body.data.commencing) : null,
    },
  })
  return NextResponse.json(entry, { status: 201 })
}
```

- [ ] **Commit:**

```bash
git add apps/web/app/api/venues/\[venueId\]/schedule/route.ts
git commit -m "feat: add GET/POST schedule entries API"
```

---

## Task 4: API — Update & Delete

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/schedule/[entryId]/route.ts`

- [ ] **Create the file:**

```ts
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateSchema = z.object({
  day:            z.number().int().min(0).max(6).optional(),
  startHour:      z.number().int().min(0).max(23).optional(),
  startMin:       z.number().int().min(0).max(59).optional(),
  endHour:        z.number().int().min(0).max(23).nullable().optional(),
  endMin:         z.number().int().min(0).max(59).nullable().optional(),
  crossesMidnight:z.boolean().optional(),
  interval:       z.enum(["weekly", "biweekly", "monthly"]).optional(),
  weekOfMonth:    z.number().int().min(1).max(5).nullable().optional(),
  commencing:     z.string().datetime().nullable().optional(),
  label:          z.string().max(50).nullable().optional(),
})

async function requireManager(venueId: string, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { venueId, userId, role: { in: ["OWNER", "MANAGER"] }, isActive: true },
  })
  return !!membership
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string; entryId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId, entryId } = await params
  if (!(await requireManager(venueId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = updateSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 })

  const existing = await prisma.venueScheduleEntry.findFirst({ where: { id: entryId, venueId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.venueScheduleEntry.update({
    where: { id: entryId },
    data: {
      ...body.data,
      commencing: body.data.commencing !== undefined
        ? (body.data.commencing ? new Date(body.data.commencing) : null)
        : undefined,
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ venueId: string; entryId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId, entryId } = await params
  if (!(await requireManager(venueId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const existing = await prisma.venueScheduleEntry.findFirst({ where: { id: entryId, venueId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.venueScheduleEntry.delete({ where: { id: entryId } })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Commit:**

```bash
git add "apps/web/app/api/venues/[venueId]/schedule/[entryId]/route.ts"
git commit -m "feat: add PUT/DELETE schedule entry API"
```

---

## Task 5: Schedule Entry Form Component

**Files:**
- Create: `apps/web/components/schedule-entry-form.tsx`

This is a client component dialog for adding or editing a single schedule entry. Time inputs use `type="time"` which gives HH:MM in 24h and maps directly to UTC hour/minute integers.

- [ ] **Create the file:**

```tsx
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
  day: 5, // Friday default
  startHour: 21,
  startMin: 0,
  endHour: null,
  endMin: null,
  crossesMidnight: false,
  interval: "weekly",
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
    const crosses = endH != null && (h > endH || (h === endH && form.startMin > (form.endMin ?? 0)))
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
          {/* Day */}
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

          {/* Times */}
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

          {/* Interval */}
          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <Select value={form.interval} onValueChange={v => setForm(f => ({ ...f, interval: v }))}>
              <SelectTrigger className="bg-background border-[var(--blue-015)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Every week</SelectItem>
                <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.interval === "monthly" && (
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

          {form.interval === "biweekly" && (
            <div className="space-y-1.5">
              <Label>Starting from</Label>
              <Input type="date" value={form.commencing?.slice(0, 10) ?? ""}
                onChange={e => setForm(f => ({ ...f, commencing: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]" />
              <p className="text-[0.75rem] text-[var(--fg-faint)]">Pick any date this entry is active so we know which weeks to count.</p>
            </div>
          )}

          {/* Label */}
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
```

- [ ] **Commit:**

```bash
git add apps/web/components/schedule-entry-form.tsx
git commit -m "feat: add ScheduleEntryForm dialog component"
```

---

## Task 6: Schedule Display Component

**Files:**
- Create: `apps/web/components/venue-schedule-display.tsx`

Read-only component used on the public venue profile and the operator dashboard.

- [ ] **Create the file:**

```tsx
import { DAY_NAMES, DAY_SHORT, formatEntryTime, formatIntervalLabel, type ScheduleEntry } from "@/lib/schedule-utils"

type Props = {
  entries: ScheduleEntry[]
  compact?: boolean  // true = short day names, no interval label
}

export function VenueScheduleDisplay({ entries, compact = false }: Props) {
  if (entries.length === 0) {
    return (
      <>
        {[0,1,2,3,4,5,6].map(i => (
          <div key={i} className="hours-row closed">
            <span className="day">{compact ? DAY_SHORT[i] : DAY_NAMES[i]}</span>
            <span className="hrs">—</span>
          </div>
        ))}
        <p className="px-5 pb-3 pt-1 text-[0.72rem] text-[var(--fg-faint)]">Hours not set by owner.</p>
      </>
    )
  }

  const byDay = new Map<number, ScheduleEntry[]>()
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, [])
    byDay.get(e.day)!.push(e)
  }

  const todayDay = new Date().getUTCDay()

  return (
    <>
      {[0,1,2,3,4,5,6].map(i => {
        const dayEntries = byDay.get(i)
        const isToday = i === todayDay
        if (!dayEntries || dayEntries.length === 0) {
          return (
            <div key={i} className={`hours-row closed${isToday ? " today" : ""}`}>
              <span className="day">{compact ? DAY_SHORT[i] : DAY_NAMES[i]}</span>
              <span className="hrs">—</span>
            </div>
          )
        }
        return dayEntries.map((entry, idx) => (
          <div key={entry.id} className={`hours-row${isToday ? " today" : ""}`}>
            <span className="day">{idx === 0 ? (compact ? DAY_SHORT[i] : DAY_NAMES[i]) : ""}</span>
            <span className="hrs">
              {entry.label && <span className="mr-1 text-[var(--fg-faint)] text-[0.78em]">{entry.label} · </span>}
              {formatEntryTime(entry)}
              {!compact && entry.interval !== "weekly" && (
                <span className="ml-1 text-[0.75em] text-[var(--fg-faint)]">({formatIntervalLabel(entry)})</span>
              )}
            </span>
          </div>
        ))
      })}
    </>
  )
}
```

- [ ] **Commit:**

```bash
git add apps/web/components/venue-schedule-display.tsx
git commit -m "feat: add VenueScheduleDisplay read-only component"
```

---

## Task 7: Settings Page — Schedule Management Section

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/settings/page.tsx`

The settings page is a large client component. Add a schedule management section before the existing "Default hours" inputs, and demote those inputs to a "Legacy" note.

- [ ] **Add imports at the top of the file** (after existing imports):

```tsx
import { ScheduleEntryForm } from "@/components/schedule-entry-form"
import type { ScheduleEntry } from "@/lib/schedule-utils"
import { DAY_NAMES, formatEntryTime, formatIntervalLabel } from "@/lib/schedule-utils"
import { Plus, Trash2 } from "lucide-react"
```

- [ ] **Add schedule state near the top of the component** (after existing `useState` declarations):

```tsx
const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([])
const [scheduleLoaded, setScheduleLoaded] = useState(false)
const [showAddEntry, setShowAddEntry] = useState(false)
```

- [ ] **Add schedule fetch in the existing `useEffect` that loads venue data** -- append after the settings load:

```tsx
// inside the existing useEffect, after settings are loaded:
fetch(`/api/venues/${venue.id}/schedule`)
  .then(r => r.json())
  .then((data: ScheduleEntry[]) => {
    setScheduleEntries(data)
    setScheduleLoaded(true)
  })
  .catch(() => setScheduleLoaded(true))
```

- [ ] **Add helper functions inside the component** (before the return):

```tsx
async function handleAddEntry(data: Parameters<typeof ScheduleEntryForm>[0]["onSave"] extends (d: infer D) => unknown ? D : never) {
  const res = await fetch(`/api/venues/${venue.id}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to save")
  const created: ScheduleEntry = await res.json()
  setScheduleEntries(prev => [...prev, created])
}

async function handleDeleteEntry(id: string) {
  const res = await fetch(`/api/venues/${venue.id}/schedule/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete")
  setScheduleEntries(prev => prev.filter(e => e.id !== id))
}
```

- [ ] **Add the schedule section in JSX** -- insert this new `<section>` immediately before the existing section that contains `defaultHours` / `openNights` inputs. Find the section by looking for the `defaultHours` label around line 386:

```tsx
{/* ── Opening Schedule ── */}
<section className="panel">
  <div className="ph">
    <span className="pt">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      Opening Schedule
    </span>
  </div>

  <div className="px-5 py-4 space-y-3">
    <p className="text-[0.82rem] text-[var(--fg-faint)]">
      Set your regular opening days and times. All times in Server Time (ST = UTC).
    </p>

    {scheduleLoaded && scheduleEntries.length > 0 && (
      <div className="divide-y divide-[var(--blue-008)] rounded-[var(--radius-md)] border border-[var(--blue-015)] overflow-hidden">
        {scheduleEntries.map(entry => (
          <div key={entry.id} className="flex items-center justify-between px-4 py-3 bg-[var(--blue-005)]">
            <div>
              <span className="font-medium text-sm">{DAY_NAMES[entry.day]}</span>
              <span className="text-[var(--fg-faint)] text-sm ml-2">{formatEntryTime(entry)}</span>
              {entry.interval !== "weekly" && (
                <span className="ml-2 text-[0.72rem] text-[var(--xiv-blue)]">{formatIntervalLabel(entry)}</span>
              )}
              {entry.label && (
                <span className="ml-2 text-[0.72rem] text-[var(--fg-faint)]">{entry.label}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDeleteEntry(entry.id)}
              className="text-[var(--fg-faint)] hover:text-red-400 transition-colors p-1"
              aria-label="Remove entry"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    )}

    <button
      type="button"
      onClick={() => setShowAddEntry(true)}
      className="flex items-center gap-2 text-[0.85rem] text-[var(--xiv-blue)] hover:opacity-80 transition-opacity"
    >
      <Plus className="w-4 h-4" /> Add opening time
    </button>
  </div>

  <ScheduleEntryForm
    open={showAddEntry}
    onClose={() => setShowAddEntry(false)}
    onSave={handleAddEntry}
  />
</section>
```

- [ ] **Demote the old text inputs** -- find the `Label htmlFor="default-hours"` block (around line 386) and add a deprecation note above the grid:

```tsx
{/* Legacy hours fields — superseded by Opening Schedule above */}
<p className="text-[0.72rem] text-[var(--fg-faint)] mb-2">
  Legacy free-text hours — use the schedule section above instead.
</p>
```

- [ ] **Test in browser:**

```bash
cd ~/xiv-app && pnpm dev
```

Open a venue settings page, add a schedule entry (e.g. Friday, 9pm–1am, weekly). Verify it appears in the list. Delete it. Verify it disappears.

- [ ] **Commit:**

```bash
git add apps/web/app/dashboard/\[slug\]/settings/page.tsx
git commit -m "feat: add opening schedule management to venue settings"
```

---

## Task 8: Venue Profile — Replace Hours Card

**Files:**
- Modify: `apps/web/app/venues/[slug]/page.tsx`

- [ ] **Add the import** at the top:

```tsx
import { VenueScheduleDisplay } from "@/components/venue-schedule-display"
import { isOpenNow } from "@/lib/schedule-utils"
```

- [ ] **Add `scheduleEntries` to the Prisma query** -- update the `prisma.venue.findUnique` call to include schedule entries:

```tsx
const venue = await prisma.venue.findUnique({
  where: { slug, isActive: true },
  include: {
    scheduleEntries: {         // add this
      orderBy: [{ day: "asc" }, { startHour: "asc" }],
    },
    _count: { select: { follows: true, events: true, memberships: true } },
    events: {
      where: {
        status: { in: ["ACTIVE", "PUBLISHED"] },
        startTime: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      },
      orderBy: { startTime: "asc" },
      take: 5,
      select: { id: true, title: true, startTime: true, endTime: true, status: true, eventType: true },
    },
  },
})
```

- [ ] **Update the Open/Closed badge logic** -- find the `liveEvent` / `upcomingEvents` badge block around line 176 and update:

```tsx
// Replace:
const liveEvent      = venue.events.find(e => e.status === "ACTIVE")
const upcomingEvents = venue.events.filter(e => e.status === "PUBLISHED")

// With:
const liveEvent         = venue.events.find(e => e.status === "ACTIVE")
const upcomingEvents    = venue.events.filter(e => e.status === "PUBLISHED")
const openFromSchedule  = isOpenNow(venue.scheduleEntries)
const isOpen            = !!liveEvent || openFromSchedule
```

- [ ] **Update the hero badge** -- find the three-way status badge in the JSX and update:

```tsx
// Replace the three-way conditional:
{liveEvent ? (
  <span className="status open mb-[14px] inline-flex"><span className="dot" />Open now</span>
) : upcomingEvents.length > 0 ? (
  <span className="status soon mb-[14px] inline-flex"><span className="dot" />Opening soon</span>
) : (
  <span className="status closed mb-[14px] inline-flex"><span className="dot" />Closed</span>
)}

// With:
{isOpen ? (
  <span className="status open mb-[14px] inline-flex"><span className="dot" />Open now</span>
) : upcomingEvents.length > 0 ? (
  <span className="status soon mb-[14px] inline-flex"><span className="dot" />Opening soon</span>
) : (
  <span className="status closed mb-[14px] inline-flex"><span className="dot" />Closed</span>
)}
```

- [ ] **Replace the Hours card** -- find the `{/* Hours */}` comment block (around line 312) and replace the entire dcard div:

```tsx
{/* Hours */}
<div className="dcard">
  <div className="dh"><Clock /> Hours</div>
  {venue.scheduleEntries.length > 0 ? (
    <VenueScheduleDisplay entries={venue.scheduleEntries} />
  ) : openDays ? (
    // Legacy: parsed from settings.openNights free text
    DAY_NAMES.map((day, i) => {
      const isOpen  = openDays.has(i)
      const isToday = i === todayUTCDay
      return (
        <div key={day} className={`hours-row${isToday ? " today" : isOpen ? "" : " closed"}`}>
          <span className="day">{day}</span>
          <span className="hrs">{isOpen ? (defaultHours || "Open") : "Closed"}</span>
        </div>
      )
    })
  ) : defaultHours ? (
    <>
      <div className="px-5 py-3 text-[0.86rem]">
        <span className="text-muted-foreground">Hours</span>
        <span className="float-right font-medium">{defaultHours} {tzLabel}</span>
      </div>
      {openNights && (
        <div className="px-5 pb-3 text-[0.86rem]">
          <span className="text-muted-foreground">Open</span>
          <span className="float-right font-medium">{openNights}</span>
        </div>
      )}
    </>
  ) : (
    <VenueScheduleDisplay entries={[]} />
  )}
</div>
```

- [ ] **Test in browser:**

Navigate to a venue profile that has schedule entries. Verify the Hours card shows structured days/times. Navigate to a venue with no entries -- verify "Hours not set by owner" fallback. Check a venue with legacy `openNights` set -- verify it still renders from the fallback path.

If the venue is open per the schedule, verify the "Open now" badge appears in the hero.

- [ ] **Commit:**

```bash
git add apps/web/app/venues/\[slug\]/page.tsx
git commit -m "feat: replace free-text hours card with structured schedule on venue profile"
```

---

## Task 9: Deploy

- [ ] **Build check locally:**

```bash
cd ~/xiv-app/apps/web && pnpm build
```

Expected: no TypeScript errors, no build failures.

- [ ] **Deploy to production:**

```bash
~/bin/deploy-xiv-web.sh
```

- [ ] **Smoke test on live site:**

1. Open a venue settings page → confirm "Opening Schedule" section visible
2. Add an entry (e.g. Saturday, 8pm–midnight, weekly) → confirm it appears
3. Open the venue's public profile → confirm Hours card shows Saturday 8:00 PM – 12:00 AM ST
4. Delete the entry from settings → confirm Hours card falls back to legacy or "not set"

- [ ] **Commit any fixes, then tag:**

```bash
git tag v-venue-schedule
```

---

## Notes

- `settings.defaultHours` and `settings.openNights` are kept in the DB and remain as a display fallback. No data is lost. Venue owners who set up structured entries will see those; others see the old text.
- The `DateTimePicker` browser-local-time issue (affects event creation for NA/JP owners) is a separate fix -- it is not in scope here.
- ffxivvenues.com integration (phase 2) will write imported schedule entries into this same `VenueScheduleEntry` table with a `source` field to be added at that time.
