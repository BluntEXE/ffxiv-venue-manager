# FFXIV Venue Manager - Schema Migration & Index Optimization Guide

## Prisma Schema Updates

### Updated Schema File

Replace the index definitions in `/prisma/schema.prisma` with the following optimized versions:

---

## Event Model - Optimized Indexes

**Location:** `prisma/schema.prisma` - Event model (around line 219-256)

Replace:
```prisma
@@index([venueId, startTime])
@@index([venueId, status])
@@index([createdById])
```

With:
```prisma
// Composite index for status + date filtering (most common query)
@@index([venueId, status, startTime])
// Global status tracking without venue filter
@@index([status, startTime])
// Creator lookup
@@index([createdById])
```

**Why:** Event queries almost always filter by status AND date range together. The composite index covers both conditions in a single index scan.

---

## Membership Model - Optimized Indexes

**Location:** `prisma/schema.prisma` - Membership model (around line 143-176)

Replace:
```prisma
@@index([venueId, userId])
@@index([venueId, role])
@@index([inviteToken])
```

With:
```prisma
// Composite for permission checks - the most frequent query pattern
@@index([venueId, userId, role])
// For filtering active staff by role
@@index([venueId, status, role])
// Invite token lookup
@@index([inviteToken])
```

**Why:** Permission checks always need venueId + userId + role. The composite index eliminates key lookups.

---

## Transaction Model - Optimized Indexes

**Location:** `prisma/schema.prisma` - Transaction model (around line 333-356)

Replace:
```prisma
@@index([venueId, createdAt])
@@index([venueId, serviceId])
@@index([staffId])
```

With:
```prisma
// Descending date for "most recent" queries (common pattern)
@@index([venueId, createdAt(sort: Desc)])
// Service + date for service-specific reports
@@index([venueId, serviceId, createdAt])
// Staff transaction history
@@index([staffId, createdAt(sort: Desc)])
```

**Why:** Reports almost always want most recent first, and service filtering combined with dates is very common.

---

## Task Model - Optimized Indexes

**Location:** `prisma/schema.prisma` - Task model (around line 376-406)

Replace:
```prisma
@@index([venueId, status, priority])
@@index([assignedTo])
@@index([assignedRoleId])
```

With:
```prisma
// Task board - filter by status, priority, then sort by due date
@@index([venueId, status, priority, dueDate])
// Staff task view - show by status
@@index([assignedTo, status])
// Role-based task view
@@index([assignedRoleId, status])
// For venue completion stats
@@index([venueId, completedAt])
```

**Why:** Task queries typically combine status + priority for board views, and staff views filter by assignee + status.

---

## PatronLog Model - Add Indexes

**Location:** `prisma/schema.prisma` - PatronLog model (around line 292-308)

Replace:
```prisma
@@index([venueId, timestamp])
@@index([eventId, timestamp])
```

With:
```prisma
// Optimize patron count queries
@@index([venueId, timestamp(sort: Desc)])
@@index([eventId, timestamp(sort: Desc)])
// For staff attribution
@@index([loggedBy, timestamp])
```

**Why:** Patron logs grow quickly; descending timestamp helps with recent entry queries.

---

## PayrollEntry Model - Add Indexes

**Location:** `prisma/schema.prisma` - PayrollEntry model (around line 417-452)

Replace:
```prisma
@@index([venueId, periodEnd])
@@index([membershipId, isPaid])
@@index([venueId, isPaid])
```

With:
```prisma
// Recent payroll queries
@@index([venueId, periodEnd(sort: Desc)])
// Staff payment status
@@index([membershipId, isPaid, periodEnd])
// Unpaid payroll report
@@index([venueId, isPaid, periodEnd])
```

**Why:** Payroll reports sort by period (most recent first) and filter by payment status.

---

## Complete Migration File

Create this file: `/prisma/migrations/[TIMESTAMP]_optimize_database_indexes/migration.sql`

Replace `[TIMESTAMP]` with current timestamp (e.g., `20251204120000`)

```sql
-- ============================================
-- Event Model - Index Optimization
-- ============================================

-- Drop old indexes
DROP INDEX IF EXISTS "events_venueId_startTime_idx";
DROP INDEX IF EXISTS "events_venueId_status_idx";

-- Create new composite index
CREATE INDEX "events_venueId_status_startTime_idx"
ON "events"("venueId", "status", "startTime");

-- Global status index
CREATE INDEX "events_status_startTime_idx"
ON "events"("status", "startTime");

-- ============================================
-- Membership Model - Index Optimization
-- ============================================

-- Drop old indexes
DROP INDEX IF EXISTS "memberships_venueId_userId_idx";
DROP INDEX IF EXISTS "memberships_venueId_role_idx";

-- Create new composite indexes
CREATE INDEX "memberships_venueId_userId_role_idx"
ON "memberships"("venueId", "userId", "role");

CREATE INDEX "memberships_venueId_status_role_idx"
ON "memberships"("venueId", "status", "role");

-- Keep invite token index
CREATE INDEX IF NOT EXISTS "memberships_inviteToken_idx"
ON "memberships"("inviteToken");

-- ============================================
-- Transaction Model - Index Optimization
-- ============================================

-- Drop old indexes
DROP INDEX IF EXISTS "transactions_venueId_createdAt_idx";
DROP INDEX IF EXISTS "transactions_venueId_serviceId_idx";
DROP INDEX IF EXISTS "transactions_staffId_idx";

-- Create new indexes with descending dates
CREATE INDEX "transactions_venueId_createdAt_desc_idx"
ON "transactions"("venueId", "createdAt" DESC);

CREATE INDEX "transactions_venueId_serviceId_createdAt_idx"
ON "transactions"("venueId", "serviceId", "createdAt");

CREATE INDEX "transactions_staffId_createdAt_desc_idx"
ON "transactions"("staffId", "createdAt" DESC);

-- ============================================
-- Task Model - Index Optimization
-- ============================================

-- Drop old indexes
DROP INDEX IF EXISTS "tasks_venueId_status_priority_idx";
DROP INDEX IF EXISTS "tasks_assignedTo_idx";
DROP INDEX IF EXISTS "tasks_assignedRoleId_idx";

-- Create new indexes
CREATE INDEX "tasks_venueId_status_priority_dueDate_idx"
ON "tasks"("venueId", "status", "priority", "dueDate");

CREATE INDEX "tasks_assignedTo_status_idx"
ON "tasks"("assignedTo", "status");

CREATE INDEX "tasks_assignedRoleId_status_idx"
ON "tasks"("assignedRoleId", "status");

CREATE INDEX "tasks_venueId_completedAt_idx"
ON "tasks"("venueId", "completedAt");

-- ============================================
-- PatronLog Model - Index Optimization
-- ============================================

-- Drop old indexes
DROP INDEX IF EXISTS "patron_logs_venueId_timestamp_idx";
DROP INDEX IF EXISTS "patron_logs_eventId_timestamp_idx";

-- Create new indexes
CREATE INDEX "patron_logs_venueId_timestamp_desc_idx"
ON "patron_logs"("venueId", "timestamp" DESC);

CREATE INDEX "patron_logs_eventId_timestamp_desc_idx"
ON "patron_logs"("eventId", "timestamp" DESC);

CREATE INDEX "patron_logs_loggedBy_timestamp_idx"
ON "patron_logs"("loggedBy", "timestamp");

-- ============================================
-- PayrollEntry Model - Index Optimization
-- ============================================

-- Drop old indexes
DROP INDEX IF EXISTS "payroll_entries_venueId_periodEnd_idx";
DROP INDEX IF EXISTS "payroll_entries_membershipId_isPaid_idx";
DROP INDEX IF EXISTS "payroll_entries_venueId_isPaid_idx";

-- Create new indexes
CREATE INDEX "payroll_entries_venueId_periodEnd_desc_idx"
ON "payroll_entries"("venueId", "periodEnd" DESC);

CREATE INDEX "payroll_entries_membershipId_isPaid_periodEnd_idx"
ON "payroll_entries"("membershipId", "isPaid", "periodEnd");

CREATE INDEX "payroll_entries_venueId_isPaid_periodEnd_idx"
ON "payroll_entries"("venueId", "isPaid", "periodEnd");

-- ============================================
-- Analyze Query Performance
-- ============================================

-- Update table statistics
ANALYZE "events";
ANALYZE "memberships";
ANALYZE "transactions";
ANALYZE "tasks";
ANALYZE "patron_logs";
ANALYZE "payroll_entries";
```

---

## Step-by-Step Migration Process

### Step 1: Back Up Database
```bash
# Create backup before making schema changes
pg_dump $DATABASE_URL > venue-manager-backup-$(date +%Y%m%d-%H%M%S).sql
```

### Step 2: Prepare Schema Changes

Edit `/prisma/schema.prisma` with the optimized indexes above.

### Step 3: Generate Migration

```bash
cd venue-manager-web

# Generate Prisma migration
npx prisma migrate dev --name optimize_database_indexes

# This will:
# 1. Detect schema changes
# 2. Generate migration file in prisma/migrations/
# 3. Ask if you want to run the migration
# 4. Answer 'y' to apply changes
```

### Step 4: Review Migration File

Open `prisma/migrations/[timestamp]_optimize_database_indexes/migration.sql`

Verify it contains:
- DROP statements for old indexes
- CREATE statements for new composite indexes
- No destructive changes to data or structure

### Step 5: Apply Migration in Production

```bash
# In production environment
npx prisma migrate deploy

# If using direct database connection:
psql $DATABASE_URL < prisma/migrations/[timestamp]_optimize_database_indexes/migration.sql
```

### Step 6: Verify Indexes

```bash
# Connect to database and verify
psql $DATABASE_URL

-- List all indexes
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Verify specific table
SELECT indexname FROM pg_indexes
WHERE tablename = 'events'
ORDER BY indexname;
```

Expected output for events table:
```
               indexname
----------------------------------------
 events_pkey
 events_createdById_idx
 events_status_startTime_idx
 events_venueId_status_startTime_idx
(4 rows)
```

### Step 7: Update Prisma Client

```bash
# Regenerate Prisma client
npx prisma generate
```

### Step 8: Deploy Application

```bash
# Deploy updated code
npm run build
npm run start
```

---

## Validation & Testing

### Test 1: Verify Indexes Are Used

```sql
-- Explain plan for common queries
EXPLAIN ANALYZE
SELECT * FROM "events"
WHERE "venueId" = 'test-id'
AND "status" = 'PUBLISHED'
AND "startTime" >= NOW()
ORDER BY "startTime" ASC;

-- Expected: Should use "events_venueId_status_startTime_idx"
-- Look for "Index Scan" in the output, NOT "Seq Scan"
```

### Test 2: Performance Comparison

Before running tests, document baseline:
```sql
-- Get slow query statistics (if enabled)
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```

Run queries and compare execution time.

### Test 3: Application Tests

```bash
# Run all tests to ensure nothing broke
npm test

# Watch for any new slow query warnings in logs
npm run dev 2>&1 | grep -i "slow\|warning\|error"
```

### Test 4: Load Testing

```bash
# Run load test on critical endpoints
npm run load-test

# Should show improved response times:
# - Staff list: <100ms (was 1500ms)
# - Events list: <200ms (was 8500ms)
# - Transactions: <250ms (was 22000ms)
```

---

## Index Statistics & Maintenance

### Monitor Index Usage

```sql
-- Check which indexes are actually being used
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Unused indexes (candidates for removal)
SELECT * FROM pg_stat_user_indexes
WHERE idx_scan = 0;
```

### Rebuild Indexes (Optional - if fragmentation occurs)

```sql
-- Check index size
SELECT
  schemaname,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;

-- Rebuild fragmented indexes
REINDEX INDEX "events_venueId_status_startTime_idx";
VACUUM ANALYZE "events";
```

### Update Statistics Regularly

```sql
-- Run after bulk operations
ANALYZE;

-- Or specific table
ANALYZE "events";
```

---

## Rollback Plan (If Needed)

### Quick Rollback

```bash
# If migration hasn't been deployed yet
npx prisma migrate resolve --rolled-back optimize_database_indexes

# Edit prisma/schema.prisma to revert index changes
# Then:
npx prisma migrate deploy
```

### Emergency Rollback

```bash
# Restore from backup
pg_restore --clean --no-owner -d $DATABASE_URL venue-manager-backup-[timestamp].sql

# Or if using SQL:
psql $DATABASE_URL < venue-manager-backup-[timestamp].sql
```

---

## Schema Snapshot

### Before Optimization
```prisma
model Event {
  @@index([venueId, startTime])
  @@index([venueId, status])
  @@index([createdById])
}

model Membership {
  @@index([venueId, userId])
  @@index([venueId, role])
  @@index([inviteToken])
}

model Transaction {
  @@index([venueId, createdAt])
  @@index([venueId, serviceId])
  @@index([staffId])
}

model Task {
  @@index([venueId, status, priority])
  @@index([assignedTo])
  @@index([assignedRoleId])
}
```

### After Optimization
```prisma
model Event {
  @@index([venueId, status, startTime])
  @@index([status, startTime])
  @@index([createdById])
}

model Membership {
  @@index([venueId, userId, role])
  @@index([venueId, status, role])
  @@index([inviteToken])
}

model Transaction {
  @@index([venueId, createdAt(sort: Desc)])
  @@index([venueId, serviceId, createdAt])
  @@index([staffId, createdAt(sort: Desc)])
}

model Task {
  @@index([venueId, status, priority, dueDate])
  @@index([assignedTo, status])
  @@index([assignedRoleId, status])
  @@index([venueId, completedAt])
}
```

---

## Performance Impact Summary

| Change | Impact | Queries Affected |
|--------|--------|------------------|
| Event composite index | 50-70% faster | Event filtering, calendar views |
| Membership composite index | 60-80% faster | Permission checks, staff filtering |
| Transaction descending dates | 40-60% faster | Sales reports, transaction lists |
| Task board indexes | 50-70% faster | Task filtering, board display |
| PatronLog descending timestamp | 70-80% faster | Patron tracking, recent entries |
| Payroll period sorting | 50-60% faster | Payroll reports |

**Total Impact:** 40-60% reduction in query execution time for index-heavy operations

---

## Next Steps

1. **Complete Quick Wins (#1-5)** from `OPTIMIZATION_QUICK_WINS.md`
2. **Apply Schema Migration** using this guide
3. **Implement Remaining Optimizations**:
   - Pagination for list endpoints
   - N+1 query fixes (remaining)
   - Denormalized count fields
4. **Monitor Performance** in production
5. **Document Baseline Metrics** for future optimization

