// apps/web/lib/shift-format.ts

import { Prisma } from "@/generated/prisma/client"
import { localDayKey, localHourLabel } from "./local-day"
import { resolveDisplayName } from "./display-name"

// FFXIV server time = UTC (see apps/web/app/dashboard/[slug]/shifts/page.tsx).
// These mirror that page's private utcDayKey/fmtHour helpers so the calendar
// and day-detail dialog group/label shifts identically to the week grid,
// regardless of the viewer's browser timezone.

/** "2026-07-31" in UTC, used as a day-bucket key. */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** "10PM" or "10:30PM", read in UTC. */
export function fmtHour(iso: string | Date): string {
  const d = new Date(iso)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
}

/** Local-timezone day key, or the UTC one if `mounted` is false (SSR/first paint). */
export function dayKeyFor(d: Date | string, timeZone: string | null): string {
  return timeZone ? localDayKey(d, timeZone) : utcDayKey(new Date(d))
}

/** Local-timezone hour label, or the UTC one if `mounted` is false (SSR/first paint). */
export function hourLabelFor(d: Date | string, timeZone: string | null): string {
  return timeZone ? localHourLabel(d, timeZone) : fmtHour(d)
}

export const statusBadgeClass: Record<string, string> = {
  SCHEDULED: "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  ACTIVE:    "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  MISSED:    "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
}

export interface StaffMember {
  id: string
  name: string
  image: string | null
}

export interface RoleOption {
  id: string
  name: string
}

// Explicit select (not include) for the shifts week grid — passed whole into
// a client component (ShiftsWeekView). Prisma's Decimal fields (e.g.
// Shift.hoursWorked, Membership.hourlyRate) can't cross the server/client
// boundary and hourlyRate is also pay data non-managers shouldn't receive in
// the RSC payload, so only the fields ShiftsWeekView actually reads are
// selected here — same constraint/pattern as CalendarShift above.
export const shiftSelect = {
  id: true,
  membershipId: true,
  roleId: true,
  payrollEntryId: true,
  scheduledStart: true,
  scheduledEnd: true,
  status: true,
  notes: true,
  recurrenceRule: true,
  parentShiftId: true,
  slotGroupId: true,
  membership: {
    select: {
      nickname: true,
      user: {
        select: {
          id: true,
          name: true,
          displayName: true,
          image: true,
          characters: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { characterName: true } },
        },
      },
    },
  },
  role: { select: { name: true } },
} satisfies Prisma.ShiftSelect

export type ShiftRow = Prisma.ShiftGetPayload<{ select: typeof shiftSelect }>

export interface CalendarShift {
  id: string
  membershipId: string | null
  roleId: string | null
  payrollEntryId: string | null
  scheduledStart: Date
  scheduledEnd: Date
  status: string
  notes: string | null
  recurrenceRule: string | null
  parentShiftId: string | null
  slotGroupId: string | null
  membership: {
    nickname: string | null
    user: {
      id: string
      name: string | null
      displayName: string | null
      image: string | null
      characters: { characterName: string }[]
    } | null
  } | null
  role: { name: string } | null
}

export function staffNameOf(membership: CalendarShift["membership"]): string {
  return resolveDisplayName({
    characterName: membership?.user?.characters?.[0]?.characterName,
    nickname: membership?.nickname,
    displayName: membership?.user?.displayName,
    discordName: membership?.user?.name,
  })
}
