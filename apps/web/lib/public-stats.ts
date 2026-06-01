import { prisma } from "@/lib/prisma"
import { getOrSet, cacheKeys, cacheTTL } from "@/lib/redis-cache"

export interface PublicStats {
  venuesTotal: number
  venuesActive30d: number
  pluginInstalls: number
  eventsTotal: number
  eventsThisWeek: number
  patronEntriesTotal: number
  salesTotal: number
  shiftsTotal: number
  shiftsThisWeek: number
  newVenuesThisWeek: number
  tasksCompleted: number
  partakeEventsSynced: number
  gilTracked: number
  dataCenters: number
  dcBreakdown: Array<{ dataCenter: string; count: number }>
  busiestNights: Array<{ day: string; count: number; pct: number }>
  firstVenueAt: string | null
  lastActivityAt: string | null
  generatedAt: string
}

async function computeStats(): Promise<PublicStats> {
  const since30d   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const since7d    = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000)

  const [
    venuesTotal,
    activeVenueIds,
    pluginInstalls,
    eventsTotal,
    eventsThisWeek,
    patronEntriesTotal,
    salesAgg,
    shiftsTotal,
    shiftsThisWeek,
    newVenuesThisWeek,
    tasksCompleted,
    partakeEventsSynced,
    dcRows,
    dcCounts,
    recentEvents,
    firstVenue,
    lastSale,
    lastPatron,
  ] = await Promise.all([
    prisma.venue.count({ where: { isActive: true } }),
    prisma.venue.findMany({
      where: {
        isActive: true,
        OR: [
          { events: { some: { startTime: { gte: since30d } } } },
          { transactions: { some: { createdAt: { gte: since30d } } } },
          { patronLogs: { some: { loggedAt: { gte: since30d } } } },
        ],
      },
      select: { id: true },
    }),
    prisma.apiKey.count({ where: { revokedAt: null } }),
    prisma.event.count(),
    prisma.event.count({ where: { startTime: { gte: since7d } } }),
    prisma.patronLog.count(),
    prisma.transaction.aggregate({ _count: true, _sum: { amount: true } }),
    prisma.shift.count(),
    prisma.shift.count({ where: { createdAt: { gte: since7d } } }),
    prisma.venue.count({ where: { isActive: true, createdAt: { gte: since7d } } }),
    prisma.task.count({ where: { completedAt: { not: null } } }),
    prisma.event.count({ where: { partakeEventId: { not: null } } }),
    prisma.venue.findMany({ where: { isActive: true }, select: { dataCenter: true }, distinct: ["dataCenter"] }),
    prisma.venue.groupBy({
      by: ["dataCenter"],
      where: { isActive: true },
      _count: { _all: true },
      orderBy: { _count: { dataCenter: "desc" } },
    }),
    // For busiest nights: events in last 90 days with their start times
    prisma.event.findMany({
      where: { startTime: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      select: { startTime: true },
    }),
    prisma.venue.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.transaction.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.patronLog.findFirst({ orderBy: { loggedAt: "desc" }, select: { loggedAt: true } }),
  ])

  // Busiest nights: count events per UTC day-of-week
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  const dayCounts = new Array(7).fill(0)
  for (const { startTime } of recentEvents) dayCounts[startTime.getUTCDay()]++
  const maxDay = Math.max(...dayCounts, 1)
  const busiestNights = dayNames.map((day, i) => ({
    day,
    count: dayCounts[i],
    pct: Math.round((dayCounts[i] / maxDay) * 100),
  }))

  const lastActivity = [lastSale?.createdAt, lastPatron?.loggedAt]
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  return {
    venuesTotal,
    venuesActive30d: activeVenueIds.length,
    pluginInstalls,
    eventsTotal,
    eventsThisWeek,
    patronEntriesTotal,
    salesTotal: salesAgg._count,
    shiftsTotal,
    shiftsThisWeek,
    newVenuesThisWeek,
    tasksCompleted,
    partakeEventsSynced,
    gilTracked: Number(salesAgg._sum.amount ?? 0),
    dataCenters: dcRows.length,
    dcBreakdown: dcCounts.map(r => ({ dataCenter: r.dataCenter, count: r._count._all })),
    busiestNights,
    firstVenueAt: firstVenue?.createdAt.toISOString() ?? null,
    lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
    generatedAt: new Date().toISOString(),
  }
}

export async function getPublicStats(): Promise<PublicStats> {
  return getOrSet(cacheKeys.publicStats(), computeStats, cacheTTL.publicStats)
}
