# Performance Optimization - Quick Reference Guide

**Last Updated:** 2025-12-04
**Status:** Action Required

---

## Critical Issues Summary

### 🔴 CRITICAL (Fix Immediately)

| Issue | Location | Impact | Fix Time |
|-------|----------|--------|----------|
| Analytics N+1 Queries | `components/dashboard-analytics.tsx` | 2-3s delay | 2 hours |
| Analytics Page Serial Fetching | `app/dashboard/[slug]/analytics/page.tsx` | 4-6s delay | 3 hours |
| Patron Tracking Full Scan | `app/api/venues/[venueId]/patron-tracking/route.ts` | 500ms per request | 30 mins |
| Missing DB Indexes | Database | Slow queries | 15 mins |

**Total Critical Fix Time:** ~6 hours
**Expected Improvement:** 75-80% faster page loads

---

## Quick Wins (30 minutes each)

### 1. Fix Patron Tracking Aggregation
```typescript
// File: app/api/venues/[venueId]/patron-tracking/route.ts
// Lines: 64-69, 141-146

// BEFORE (❌ Slow)
const allLogs = await prisma.patronLog.findMany({
  where,
  select: { countChange: true },
})
const currentCount = allLogs.reduce((sum, log) => sum + log.countChange, 0)

// AFTER (✅ Fast)
const countResult = await prisma.patronLog.aggregate({
  where,
  _sum: { countChange: true },
})
const currentCount = Math.max(0, countResult._sum.countChange || 0)
```

### 2. Add Missing Database Indexes
```bash
# Run this SQL
psql $DATABASE_URL <<EOF
CREATE INDEX IF NOT EXISTS "patron_logs_venue_event_timestamp_idx"
  ON "patron_logs"("venueId", "eventId", "timestamp" DESC);

CREATE INDEX IF NOT EXISTS "transactions_venue_service_created_idx"
  ON "transactions"("venueId", "serviceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "events_venue_status_starttime_idx"
  ON "events"("venueId", "status", "startTime" DESC);
EOF
```

### 3. Add Staff List Caching
```typescript
// File: app/api/venues/[venueId]/staff/route.ts
// Add at line 49

import { getCached, setCache, cacheKeys, cacheTTL } from "@/lib/redis-cache"

// Add before the query
const cacheKey = `venue:${venueId}:staff`
const cached = await getCached(cacheKey)
if (cached) return NextResponse.json(cached)

// After the query
await setCache(cacheKey, staff, 900) // 15 minutes
```

---

## Medium Priority (2-4 hours each)

### 4. Create Analytics API Endpoint
**New File:** `app/api/venues/[venueId]/analytics/dashboard/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params

    // Check access
    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, venueId },
    })
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Fetch all analytics in parallel
    const [revenueByEvent, taskStats, upcomingEvents] = await Promise.all([
      // Revenue for last 7 events
      prisma.$queryRaw`
        SELECT
          e.id,
          e.title,
          e."startTime",
          COALESCE(SUM(t.amount), 0)::numeric as revenue
        FROM events e
        LEFT JOIN transactions t ON t."eventId" = e.id
        WHERE e."venueId" = ${venueId}
          AND e.status IN ('COMPLETED', 'ACTIVE')
        GROUP BY e.id, e.title, e."startTime"
        ORDER BY e."startTime" DESC
        LIMIT 7
      `,

      // Task statistics
      prisma.task.groupBy({
        by: ['status'],
        where: { venueId },
        _count: true,
      }),

      // Upcoming events
      prisma.event.findMany({
        where: {
          venueId,
          startTime: { gt: new Date() },
        },
        orderBy: { startTime: 'asc' },
        take: 5,
        select: {
          id: true,
          title: true,
          startTime: true,
          eventType: true,
        },
      }),
    ])

    return NextResponse.json({
      revenueByEvent,
      taskStats,
      upcomingEvents,
    })
  },
  { requests: 30, window: "1 m" }
)
```

**Then Update Component:**
```typescript
// File: components/dashboard-analytics.tsx
// Replace fetchAnalytics() function

const fetchAnalytics = async () => {
  try {
    const response = await fetch(`/api/venues/${venueId}/analytics/dashboard`)
    const data = await response.json()

    setRevenueData(data.revenueByEvent)
    setTaskStats({
      total: data.taskStats.reduce((sum, t) => sum + t._count, 0),
      completed: data.taskStats.find(t => t.status === 'COMPLETED')?._count || 0,
      pending: data.taskStats.find(t => t.status === 'PENDING')?._count || 0,
      inProgress: data.taskStats.find(t => t.status === 'IN_PROGRESS')?._count || 0,
    })
    setUpcomingEvents(data.upcomingEvents)
  } catch (error) {
    console.error("Failed to fetch analytics:", error)
  } finally {
    setIsLoading(false)
  }
}
```

### 5. Add React Memoization
```typescript
// File: components/dashboard-analytics.tsx
import { useMemo, memo } from "react"

export const DashboardAnalytics = memo(function DashboardAnalytics({
  venueId
}: DashboardAnalyticsProps) {
  // ... existing state ...

  // Add memoization
  const { totalRevenue, trendlineData, scatterData } = useMemo(() => {
    const totalRevenue = revenueData.reduce((sum, day) => sum + day.amount, 0)
    const trendlineData = calculateTrendline(revenueData)
    const scatterData = revenueData.map((d, i) => ({
      ...d,
      x: i,
      y: d.amount
    }))
    return { totalRevenue, trendlineData, scatterData }
  }, [revenueData])

  const completionRate = useMemo(() => {
    return taskStats ? Math.round((taskStats.completed / taskStats.total) * 100) : 0
  }, [taskStats])

  // ... rest of component ...
})
```

### 6. Add useEffect Cleanup
```typescript
// File: components/dashboard-analytics.tsx
// File: app/dashboard/[slug]/analytics/page.tsx

useEffect(() => {
  const abortController = new AbortController()

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(
        `/api/venues/${venueId}/analytics/dashboard`,
        { signal: abortController.signal }
      )
      const data = await response.json()
      // ... process data ...
    } catch (error) {
      if (error.name === 'AbortError') return
      console.error("Failed to fetch:", error)
    }
  }

  fetchAnalytics()

  return () => {
    abortController.abort()
  }
}, [venueId])
```

---

## Performance Testing Checklist

### Before Optimization
```bash
# Test dashboard load time
curl -w "@curl-format.txt" -o /dev/null -s "http://localhost:3000/dashboard/your-venue"

# Test analytics load time
curl -w "@curl-format.txt" -o /dev/null -s "http://localhost:3000/dashboard/your-venue/analytics"

# Check database query count (in Prisma logs)
# Enable: log: ['query'] in prisma client
```

### After Each Fix
```bash
# Re-run the same tests
# Compare times with baseline

# Check Redis cache hit rate
# redis-cli INFO stats | grep keyspace_hits
```

---

## Expected Results

| Metric | Before | After Phase 1 | After Phase 2 |
|--------|--------|---------------|---------------|
| Dashboard Load | 2-3s | 1-1.5s | 400-600ms |
| Analytics Load | 4-6s | 2-3s | 800-1200ms |
| DB Queries/Page | 15-20 | 5-7 | 2-3 |
| Patron Tracking | 500ms | 20-50ms | 10-20ms |
| Cache Hit Rate | 0% | 40-60% | 80-90% |

---

## File Locations Quick Reference

### Critical Files to Edit

**API Routes:**
- `app/api/venues/[venueId]/patron-tracking/route.ts` (Line 64-69, 141-146)
- `app/api/venues/[venueId]/staff/route.ts` (Line 49)
- `app/api/venues/[venueId]/analytics/dashboard/route.ts` (NEW FILE)

**Components:**
- `components/dashboard-analytics.tsx` (Lines 38-98)
- `components/transactions-list.tsx` (Virtualization)

**Pages:**
- `app/dashboard/[slug]/analytics/page.tsx` (Lines 45-153)

**Library:**
- `lib/redis-cache.ts` (Add new cache keys)

---

## Verification Commands

```bash
# Check database indexes
psql $DATABASE_URL -c "
  SELECT tablename, indexname
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename, indexname;
"

# Test Redis connection
redis-cli PING

# Check Next.js build
npm run build

# Test API response time
time curl "http://localhost:3000/api/venues/VENUE_ID/analytics/dashboard"
```

---

## Rollback Plan

If something breaks:

```bash
# Revert database indexes
psql $DATABASE_URL -c "
  DROP INDEX IF EXISTS patron_logs_venue_event_timestamp_idx;
  DROP INDEX IF EXISTS transactions_venue_service_created_idx;
  DROP INDEX IF EXISTS events_venue_status_starttime_idx;
"

# Clear Redis cache
redis-cli FLUSHDB

# Revert code changes
git checkout main -- path/to/file.ts
```

---

## Support Resources

- **Full Analysis:** See `PERFORMANCE_ANALYSIS_COMPREHENSIVE.md`
- **Database Report:** See `DATABASE_OPTIMIZATION_REPORT.md`
- **Quick Wins:** See `OPTIMIZATION_QUICK_WINS.md`
- **Prisma Docs:** https://www.prisma.io/docs/concepts/components/prisma-client/aggregation-grouping-summarizing
- **Next.js Performance:** https://nextjs.org/docs/app/building-your-application/optimizing

---

## Questions?

**Common Issues:**

**Q: Redis not connecting?**
A: Check `.env` for `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

**Q: Indexes not applying?**
A: Check database connection with `psql $DATABASE_URL -c "\d patron_logs"`

**Q: Still slow after fixes?**
A: Check Prisma logs: Set `log: ['query', 'info', 'warn', 'error']` in `lib/prisma.ts`

**Q: Breaking changes?**
A: All changes are backward compatible - old code will still work, just slower
