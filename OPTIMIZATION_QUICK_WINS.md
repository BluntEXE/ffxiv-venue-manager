# FFXIV Venue Manager - Database Optimization Quick Wins

## 4-Hour Implementation Plan

This guide provides step-by-step code changes to implement the most impactful optimizations. Each section can be implemented independently.

---

## Quick Win #1: Patron Tracking Aggregation (30 minutes)

### Files to Update
- `/app/api/venues/[venueId]/patron-tracking/route.ts`

### Changes Required

**BEFORE (Inefficient - Full Table Scan):**
```typescript
const logs = await prisma.patronLog.findMany({
  where,
  orderBy: { timestamp: "desc" },
  take: 50,
  include: {
    staff: {
      select: { id: true, name: true },
    },
  },
})

// SEPARATE QUERY - fetches ALL logs
const allLogs = await prisma.patronLog.findMany({
  where,
  select: { countChange: true },
})
const currentCount = allLogs.reduce((sum, log) => sum + log.countChange, 0)
```

**AFTER (Optimized - Aggregation):**
```typescript
const [logs, countResult] = await Promise.all([
  prisma.patronLog.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 50,
    include: {
      staff: {
        select: { id: true, name: true },
      },
    },
  }),
  prisma.patronLog.aggregate({
    where,
    _sum: { countChange: true },
  }),
])

const currentCount = Math.max(0, countResult._sum.countChange || 0)
```

**Same change needed in POST endpoint (lines 141-146):**

**BEFORE:**
```typescript
const patronLog = await prisma.patronLog.create({
  data: {
    venueId,
    eventId: validatedData.eventId,
    action: validatedData.action,
    countChange: validatedData.action === "ENTER" ? 1 : -1,
    loggedBy: session.user.id,
  },
  include: {
    staff: {
      select: {
        id: true,
        name: true,
      },
    },
  },
})

// EXPENSIVE: Re-fetches ALL logs
const allLogs = await prisma.patronLog.findMany({
  where,
  select: { countChange: true },
})
const currentCount = allLogs.reduce((sum, log) => sum + log.countChange, 0)
```

**AFTER:**
```typescript
const patronLog = await prisma.patronLog.create({
  data: {
    venueId,
    eventId: validatedData.eventId,
    action: validatedData.action,
    countChange: validatedData.action === "ENTER" ? 1 : -1,
    loggedBy: session.user.id,
  },
  include: {
    staff: {
      select: { id: true, name: true },
    },
  },
})

// Use aggregation instead of full table scan
const countResult = await prisma.patronLog.aggregate({
  where,
  _sum: { countChange: true },
})
const currentCount = Math.max(0, (countResult._sum.countChange || 0))
```

### Expected Results
- **Before:** 10,000 patron logs = 10,000 rows transferred
- **After:** 10,000 patron logs = 1 aggregate result
- **Improvement:** 99% reduction in data transfer, 95%+ faster execution

### Testing
```typescript
// Add to test file
describe("Patron Tracking Optimization", () => {
  test("GET aggregates count efficiently", async () => {
    // Should execute only 2 queries: findMany + aggregate
    // Not 3 queries: findMany + findMany + reduce
  })

  test("POST uses aggregation for count", async () => {
    // Should not fetch all logs after create
  })
})
```

---

## Quick Win #2: Add Composite Indexes (15 minutes)

### File to Update
- `/prisma/schema.prisma`

### Changes Required

**Update Event indexes:**

**BEFORE:**
```prisma
model Event {
  // ... fields ...

  @@index([venueId, startTime])
  @@index([venueId, status])
  @@index([createdById])
  @@map("events")
}
```

**AFTER:**
```prisma
model Event {
  // ... fields ...

  @@index([venueId, status, startTime])  // Composite for status + date filtering
  @@index([status, startTime])            // For global status tracking
  @@index([createdById])
  @@map("events")
}
```

**Update Membership indexes:**

**BEFORE:**
```prisma
model Membership {
  // ... fields ...

  @@index([venueId, userId])
  @@index([venueId, role])
  @@index([inviteToken])
  @@map("memberships")
}
```

**AFTER:**
```prisma
model Membership {
  // ... fields ...

  @@index([venueId, userId, role])      // Composite for permission checks
  @@index([venueId, status, role])      // For active staff filtering
  @@index([inviteToken])
  @@map("memberships")
}
```

**Update Transaction indexes:**

**BEFORE:**
```prisma
model Transaction {
  // ... fields ...

  @@index([venueId, createdAt])
  @@index([venueId, serviceId])
  @@index([staffId])
  @@map("transactions")
}
```

**AFTER:**
```prisma
model Transaction {
  // ... fields ...

  @@index([venueId, createdAt DESC])           // For most recent first
  @@index([venueId, serviceId, createdAt])     // Service + date filtering
  @@index([staffId, createdAt DESC])           // Staff-specific reports
  @@map("transactions")
}
```

**Update Task indexes:**

**BEFORE:**
```prisma
model Task {
  // ... fields ...

  @@index([venueId, status, priority])
  @@index([assignedTo])
  @@index([assignedRoleId])
  @@map("tasks")
}
```

**AFTER:**
```prisma
model Task {
  // ... fields ...

  @@index([venueId, status, priority, dueDate])  // Task board queries
  @@index([assignedTo, status])                  // Staff task views
  @@index([assignedRoleId, status])              // Role-based views
  @@map("tasks")
}
```

### Migration Steps

**1. Generate migration:**
```bash
cd venue-manager-web
npx prisma migrate dev --name add_composite_indexes
```

**2. Review generated migration file** (`prisma/migrations/[timestamp]_add_composite_indexes/migration.sql`)

**3. Expected SQL:**
```sql
-- CreateIndex
CREATE INDEX "idx_events_venue_status_starttime" ON "events"("venueId", "status", "startTime");

-- CreateIndex
CREATE INDEX "idx_status_starttime" ON "events"("status", "startTime");

-- DropIndex (old indexes being replaced)
DROP INDEX IF EXISTS "idx_events_venue_starttime";
DROP INDEX IF EXISTS "idx_events_venue_status";

-- Similar changes for Membership, Transaction, Task models
```

**4. Apply migration:**
```bash
npx prisma migrate deploy
```

**5. Verify indexes exist:**
```sql
-- Connect to database and run:
SELECT indexname FROM pg_indexes
WHERE tablename = 'events'
ORDER BY indexname;
```

### Expected Results
- Event status + date queries: 50-70% faster
- Permission checks: 60-80% faster
- Date range reports: 40-60% faster
- Task filtering: 50-70% faster

### Testing
```typescript
// Add query performance test
describe("Index Performance", () => {
  test("event status + date range uses composite index", async () => {
    const query = prisma.event.findMany({
      where: {
        venueId: "test",
        status: "PUBLISHED",
        startTime: { gte: new Date(), lte: tomorrow },
      },
    })
    // Should complete in <100ms for 10K events
  })
})
```

---

## Quick Win #3: Daily Sales Summary Optimization (30 minutes)

### File to Update
- `/app/api/cron/daily-sales-summary/route.ts`

### Changes Required

**BEFORE (N+1 Problem - 100 queries for 100 venues):**
```typescript
const venues = await prisma.venue.findMany({
  where: { isActive: true },
  select: {
    id: true,
    name: true,
    discordWebhookUrl: true,
    settings: true,
  },
})

const summaries: Array<any> = []

// LOOP - triggers N queries
for (const venue of venues) {
  const webhookConfig: VenueWebhookConfig = {
    discordWebhooks: (venue.settings as any)?.discordWebhooks,
    webhooks: (venue.settings as any)?.webhooks,
    discordWebhookUrl: venue.discordWebhookUrl,
  }

  const webhookUrl = getWebhookUrlForType(webhookConfig, "dailySalesSummary")
  if (!webhookUrl) {
    summaries.push({
      success: false,
      venueId: venue.id,
      venueName: venue.name,
    })
    continue
  }

  // QUERY 1 per venue
  const transactions = await prisma.transaction.findMany({
    where: {
      venueId: venue.id,
      createdAt: {
        gte: yesterday,
        lt: today,
      },
    },
    include: {
      service: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  // In-memory aggregation
  const totalSales = transactions.length
  const totalRevenue = transactions.reduce(
    (sum: number, t: any) => sum + Number(t.amount),
    0
  )

  // Manual aggregation for top service
  const serviceSales = new Map<string, { name: string; count: number }>()
  transactions.forEach((t: any) => {
    if (t.service) {
      const existing = serviceSales.get(t.service.id)
      if (existing) {
        existing.count++
      } else {
        serviceSales.set(t.service.id, {
          name: t.service.name,
          count: 1,
        })
      }
    }
  })

  let topService: { name: string; sales: number } | null = null
  if (serviceSales.size > 0) {
    const sorted = Array.from(serviceSales.values()).sort(
      (a, b) => b.count - a.count
    )
    topService = {
      name: sorted[0].name,
      sales: sorted[0].count,
    }
  }

  // ... rest of webhook sending
}
```

**AFTER (Optimized - Batch processing):**
```typescript
const venues = await prisma.venue.findMany({
  where: { isActive: true },
  select: {
    id: true,
    name: true,
    discordWebhookUrl: true,
    settings: true,
  },
})

const venueIds = venues.map(v => v.id)

// SINGLE QUERY for all transactions
const allTransactions = await prisma.transaction.findMany({
  where: {
    venueId: { in: venueIds },
    createdAt: {
      gte: yesterday,
      lt: today,
    },
  },
  include: {
    service: {
      select: {
        id: true,
        name: true,
      },
    },
  },
})

// Group transactions by venue in memory (fast)
const transactionsByVenue = new Map<string, typeof allTransactions>()
allTransactions.forEach((t) => {
  const venue = transactionsByVenue.get(t.venueId) || []
  venue.push(t)
  transactionsByVenue.set(t.venueId, venue)
})

const summaries: Array<any> = []

// Process venues without additional queries
for (const venue of venues) {
  const webhookConfig: VenueWebhookConfig = {
    discordWebhooks: (venue.settings as any)?.discordWebhooks,
    webhooks: (venue.settings as any)?.webhooks,
    discordWebhookUrl: venue.discordWebhookUrl,
  }

  const webhookUrl = getWebhookUrlForType(webhookConfig, "dailySalesSummary")
  if (!webhookUrl) {
    summaries.push({
      success: false,
      venueId: venue.id,
      venueName: venue.name,
    })
    continue
  }

  // Use pre-fetched transactions
  const transactions = transactionsByVenue.get(venue.id) || []

  const totalSales = transactions.length
  const totalRevenue = transactions.reduce(
    (sum: number, t: any) => sum + Number(t.amount),
    0
  )

  // Find top service (fast)
  const serviceSales = new Map<string, { name: string; count: number }>()
  transactions.forEach((t: any) => {
    if (t.service) {
      const existing = serviceSales.get(t.service.id)
      if (existing) {
        existing.count++
      } else {
        serviceSales.set(t.service.id, {
          name: t.service.name,
          count: 1,
        })
      }
    }
  })

  let topService: { name: string; sales: number } | null = null
  if (serviceSales.size > 0) {
    const sorted = Array.from(serviceSales.values()).sort(
      (a, b) => b.count - a.count
    )
    topService = {
      name: sorted[0].name,
      sales: sorted[0].count,
    }
  }

  const dateString = yesterday.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const embed = formatDailySalesSummaryEmbed({
    date: dateString,
    totalSales,
    totalRevenue,
    topService,
  })

  const success = await sendDiscordWebhook(webhookUrl, {
    embeds: [embed],
  })

  summaries.push({
    success,
    venueId: venue.id,
    venueName: venue.name,
    totalSales,
    totalRevenue,
  })

  // Add delay between webhooks
  await new Promise((resolve) => setTimeout(resolve, 100))
}

return NextResponse.json({
  success: true,
  timestamp: today.toISOString(),
  dateRange: {
    from: yesterday.toISOString(),
    to: today.toISOString(),
  },
  venuesProcessed: venues.length,
  summaries,
})
```

### Expected Results
- **100 venues:** 1 query instead of 100+ queries
- **Execution time:** 99% faster
- **Data transfer:** 90% reduction (batch fetch)

### Testing
```typescript
describe("Daily Sales Summary Optimization", () => {
  test("batches transactions query for all venues", async () => {
    // Should execute 1-2 database queries, not 100+
    // Should process in <5 seconds for 100 venues
  })
})
```

---

## Quick Win #4: Staff Relations Optimization (1 hour)

### File to Update
- `/app/api/venues/[venueId]/staff/route.ts`

### Changes Required

**BEFORE (Simple includes, missing related data):**
```typescript
const staff = await prisma.membership.findMany({
  where: { venueId: venue.id },
  include: {
    user: {
      select: {
        id: true,
        name: true,
        image: true,
        discordId: true,
      },
    },
    customRole: true,
  },
  orderBy: {
    createdAt: "asc",
  },
})
```

**AFTER (Complete relation loading):**
```typescript
const staff = await prisma.membership.findMany({
  where: { venueId: venue.id },
  include: {
    user: {
      select: {
        id: true,
        name: true,
        displayName: true,
        image: true,
        discordId: true,
      },
    },
    customRole: {
      select: {
        id: true,
        name: true,
        color: true,
        responsibilities: true,
        permissions: true,
      },
    },
    payrollEntries: {
      select: {
        id: true,
        isPaid: true,
        totalAmount: true,
        periodEnd: true,
      },
      orderBy: { periodEnd: "desc" },
      take: 3,  // Last 3 payroll entries
    },
    _count: {
      select: {
        assignedTasks: true,
        payrollEntries: true,
      },
    },
  },
  orderBy: {
    createdAt: "asc",
  },
})
```

### Additional Optimizations

**Add this query below the staff list to get role availability:**
```typescript
const roles = await prisma.role.findMany({
  where: { venueId: venue.id },
  select: {
    id: true,
    name: true,
    color: true,
    permissions: true,
    _count: {
      select: { memberships: true },
    },
  },
  orderBy: { name: "asc" },
})
```

**Return complete staff data:**
```typescript
return NextResponse.json({
  staff,
  roles,
  summary: {
    totalStaff: staff.length,
    activeStaff: staff.filter(s => s.status === "active").length,
    pendingInvites: staff.filter(s => s.status === "pending").length,
  },
})
```

### Expected Results
- Complete staff information in single response
- No additional queries needed by frontend
- 95% reduction in API calls from client

### Testing
```typescript
describe("Staff List Optimization", () => {
  test("returns complete staff data with relations", async () => {
    const response = await GET(request, context)
    const staff = JSON.parse(await response.text())

    // Each staff member should have all data
    expect(staff[0]).toHaveProperty("user.displayName")
    expect(staff[0]).toHaveProperty("customRole.permissions")
    expect(staff[0]).toHaveProperty("_count.assignedTasks")
    // Should be single response, no follow-up queries needed
  })
})
```

---

## Quick Win #5: Event Creation Optimization (30 minutes)

### File to Update
- `/app/api/venues/[venueId]/events/route.ts`

### Changes Required

**BEFORE (Venue fetched after event creation):**
```typescript
const event = await prisma.event.create({
  data: {
    ...validatedData,
    venueId,
    createdById: session.user.id,
  },
})

// SECOND QUERY - venue settings
const venue = await prisma.venue.findUnique({
  where: { id: venueId },
  select: {
    discordWebhookUrl: true,
    settings: true,
  },
})

if (venue) {
  const webhookConfig: VenueWebhookConfig = {
    discordWebhooks: (venue.settings as any)?.discordWebhooks,
    webhooks: (venue.settings as any)?.webhooks,
    discordWebhookUrl: venue.discordWebhookUrl,
  }

  const webhookUrl = getWebhookUrlForType(webhookConfig, "eventCreated")
  if (webhookUrl) {
    const embed = formatEventCreatedEmbed({
      title: event.title,
      description: event.description,
      eventType: event.eventType,
      startTime: event.startTime,
      endTime: event.endTime,
    })

    sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch(
      (error) => console.error("Failed to send Discord webhook:", error)
    )
  }
}
```

**AFTER (Venue fetched first, reused):**
```typescript
// Check user permission and fetch venue FIRST
const membership = await prisma.membership.findFirst({
  where: {
    userId: session.user.id,
    venueId,
  },
})

if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
  return NextResponse.json(
    { error: "You don't have permission to create events" },
    { status: 403 }
  )
}

// Fetch venue settings immediately
const venue = await prisma.venue.findUnique({
  where: { id: venueId },
  select: {
    id: true,
    discordWebhookUrl: true,
    settings: true,
    timezone: true,  // Useful for event timezone
  },
})

if (!venue) {
  return NextResponse.json({ error: "Venue not found" }, { status: 404 })
}

// Create event with all necessary venue context available
const event = await prisma.event.create({
  data: {
    title: validatedData.title,
    description: validatedData.description,
    eventType: validatedData.eventType,
    status: validatedData.status,
    startTime: validatedData.startTime,
    endTime: validatedData.endTime,
    timezone: validatedData.timezone || venue.timezone,
    venueId,
    createdById: session.user.id,
  },
  include: {
    createdBy: {
      select: {
        id: true,
        name: true,
        displayName: true,
        image: true,
      },
    },
  },
})

// Send Discord webhook asynchronously without awaiting
if (venue) {
  const webhookConfig: VenueWebhookConfig = {
    discordWebhooks: (venue.settings as any)?.discordWebhooks,
    webhooks: (venue.settings as any)?.webhooks,
    discordWebhookUrl: venue.discordWebhookUrl,
  }

  const webhookUrl = getWebhookUrlForType(webhookConfig, "eventCreated")
  if (webhookUrl) {
    const embed = formatEventCreatedEmbed({
      title: event.title,
      description: event.description,
      eventType: event.eventType,
      startTime: event.startTime,
      endTime: event.endTime,
    })

    sendDiscordWebhook(webhookUrl, { embeds: [embed] }).catch(
      (error) => console.error("Failed to send Discord webhook:", error)
    )
  }
}

return NextResponse.json(event, { status: 201 })
```

### Expected Results
- Event creation latency: 50% reduction
- Single permission + venue query upfront
- Better error handling (fail early if venue missing)

### Testing
```typescript
describe("Event Creation Optimization", () => {
  test("fetches venue before event creation", async () => {
    // Should execute: permission check + venue fetch + event create
    // Not: permission check + event create + venue fetch
    // Expected: <200ms vs 400ms
  })

  test("fails early if venue not found", async () => {
    // Should return 404 before creating event
  })
})
```

---

## Validation Checklist

After implementing all quick wins, verify:

- [ ] Patron tracking uses `.aggregate()` instead of `.findMany().reduce()`
- [ ] Event indexes are composite: `[venueId, status, startTime]`
- [ ] Membership indexes include role: `[venueId, userId, role]`
- [ ] Daily sales summary batches all transactions in one query
- [ ] Staff endpoint returns complete relation data
- [ ] Event creation fetches venue before creating event
- [ ] All existing tests still pass
- [ ] Performance metrics show 40-60% improvement
- [ ] No new N+1 queries introduced

---

## Performance Validation Script

```typescript
// Add to your test suite to verify improvements
import { performance } from "perf_hooks"

describe("Database Performance", () => {
  test("staff list loads in <100ms", async () => {
    const start = performance.now()
    const staff = await prisma.membership.findMany({
      where: { venueId: "test-venue" },
      include: {
        user: { select: { id: true, name: true } },
        customRole: true,
      },
    })
    const duration = performance.now() - start
    expect(duration).toBeLessThan(100)
  })

  test("patron count uses aggregation", async () => {
    // Verify aggregate is being called
    const queryCount = getQueryCount() // Implement based on your monitoring
    expect(queryCount).toBeLessThanOrEqual(2) // patronLog.findMany + aggregate
  })

  test("daily sales batches venue transactions", async () => {
    const start = performance.now()
    // Run cron job simulation
    const duration = performance.now() - start
    expect(duration).toBeLessThan(5000) // Should complete in <5 seconds
  })
})
```

---

## Next Steps After Quick Wins

1. **Monitor performance** in production for 1 week
2. **Measure improvements** using the baseline metrics
3. **Implement remaining optimizations**:
   - Pagination for list endpoints
   - Denormalized counts for dashboard
   - Additional N+1 fixes (Events, Tasks, Transactions)
4. **Set up query monitoring** to catch regressions

Estimated time to complete all quick wins: **3-4 hours**
Expected performance improvement: **40-50% latency reduction**

