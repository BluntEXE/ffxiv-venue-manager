// apps/web/app/api/public/venues/route.ts
// Public, unauthenticated venue directory for external integrations (e.g. Aetherphone).
// Kept separate from /api/mobile/discover/all so external consumers aren't coupled
// to our mobile app's internal payload shape, and so internal-only fields
// (e.g. staffOnShift) never leak here.
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseVenueSettings } from "@/lib/types/venue-settings"
import { isOpenNow, resolveUpcomingOccurrences, type ScheduleEntry } from "@/lib/schedule-utils"

export async function GET(req: NextRequest) {
  const dc = req.nextUrl.searchParams.get("dc") ?? undefined
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const venues = await prisma.venue.findMany({
    where: {
      isActive: true,
      ...(dc ? { dataCenter: { equals: dc, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      dataCenter: true,
      world: true,
      district: true,
      ward: true,
      plot: true,
      apartment: true,
      logoUrl: true,
      bannerUrl: true,
      settings: true,
      ffxivVenueId: true,
      scheduleEntries: {
        select: {
          id: true,
          venueId: true,
          day: true,
          startHour: true,
          startMin: true,
          endHour: true,
          endMin: true,
          crossesMidnight: true,
          interval: true,
          weekOfMonth: true,
          commencing: true,
          label: true,
        },
      },
      shifts: {
        where: {
          OR: [
            {
              status: "ACTIVE",
              scheduledStart: { lte: now },
              scheduledEnd: { gte: now },
            },
            {
              status: "SCHEDULED",
              scheduledStart: { gt: now, lte: endOfDay },
            },
          ],
        },
        select: {
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
        },
      },
    },
    orderBy: { name: "asc" },
  })

  const mapped = venues.map((v) => {
    const activeShift = v.shifts.find((s) => s.status === "ACTIVE")
    const tonightShift = v.shifts.find((s) => s.status === "SCHEDULED")
    const settings = parseVenueSettings(v.settings)
    const scheduleEntries = v.scheduleEntries as ScheduleEntry[]
    return {
      id: v.id,
      name: v.name,
      slug: v.slug,
      dataCenter: v.dataCenter,
      world: v.world,
      district: v.district,
      ward: v.ward,
      plot: v.plot,
      apartment: v.apartment,
      logoUrl: v.logoUrl,
      bannerUrl: v.bannerUrl,
      isAdult: settings.isAdult ?? false,
      ffxivVenuesId: v.ffxivVenueId,
      openSince: activeShift
        ? (activeShift.actualStart ?? activeShift.scheduledStart)
        : null,
      scheduledEnd:
        activeShift?.scheduledEnd ?? tonightShift?.scheduledEnd ?? null,
      nextOpen: tonightShift?.scheduledStart ?? null,
      // Recurring opening-hours pattern, all times UTC / FFXIV Server Time.
      schedule: scheduleEntries.map((e) => ({
        day: e.day,
        startHour: e.startHour,
        startMin: e.startMin,
        endHour: e.endHour,
        endMin: e.endMin,
        crossesMidnight: e.crossesMidnight,
        interval: e.interval,
        weekOfMonth: e.weekOfMonth,
        commencing: e.commencing,
        label: e.label,
      })),
      openNow: isOpenNow(scheduleEntries),
      // Next few resolved occurrences within the next 14 days, UTC start/end.
      nextOpenings: resolveUpcomingOccurrences(scheduleEntries, { days: 14, limit: 5 }),
    }
  })

  // Sort: open now first, tonight next, alphabetical last
  mapped.sort((a, b) => {
    const aOpen = a.openSince != null
    const bOpen = b.openSince != null
    const aTonight = a.nextOpen != null
    const bTonight = b.nextOpen != null
    if (aOpen && !bOpen) return -1
    if (!aOpen && bOpen) return 1
    if (aTonight && !bTonight) return -1
    if (!aTonight && bTonight) return 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json(mapped)
}
