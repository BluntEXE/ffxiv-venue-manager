import { prisma } from "@/lib/prisma"
import { getOrSet, cacheKeys, cacheTTL } from "@/lib/redis-cache"

export interface PublicStats {
  venuesTotal: number
  venuesActive30d: number
  pluginInstalls: number
  eventsTotal: number
  patronEntriesTotal: number
  salesTotal: number
  shiftsTotal: number
  tasksCompleted: number
  partakeEventsSynced: number
  gilTracked: number
  dataCenters: number
  firstVenueAt: string | null
  lastActivityAt: string | null
  generatedAt: string
}

async function computeStats(): Promise<PublicStats> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    venuesTotal,
    activeVenueIds,
    pluginInstalls,
    eventsTotal,
    patronEntriesTotal,
    salesAgg,
    shiftsTotal,
    tasksCompleted,
    partakeEventsSynced,
    dcRows,
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
    prisma.patronLog.count(),
    prisma.transaction.aggregate({ _count: true, _sum: { amount: true } }),
    prisma.shift.count(),
    prisma.task.count({ where: { completedAt: { not: null } } }),
    prisma.event.count({ where: { partakeEventId: { not: null } } }),
    prisma.venue.findMany({
      where: { isActive: true },
      select: { dataCenter: true },
      distinct: ["dataCenter"],
    }),
    prisma.venue.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.transaction.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.patronLog.findFirst({ orderBy: { loggedAt: "desc" }, select: { loggedAt: true } }),
  ])

  const lastActivity = [lastSale?.createdAt, lastPatron?.loggedAt]
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  return {
    venuesTotal,
    venuesActive30d: activeVenueIds.length,
    pluginInstalls,
    eventsTotal,
    patronEntriesTotal,
    salesTotal: salesAgg._count,
    shiftsTotal,
    tasksCompleted,
    partakeEventsSynced,
    gilTracked: Number(salesAgg._sum.amount ?? 0),
    dataCenters: dcRows.length,
    firstVenueAt: firstVenue?.createdAt.toISOString() ?? null,
    lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
    generatedAt: new Date().toISOString(),
  }
}

export async function getPublicStats(): Promise<PublicStats> {
  return getOrSet(cacheKeys.publicStats(), computeStats, cacheTTL.publicStats)
}
