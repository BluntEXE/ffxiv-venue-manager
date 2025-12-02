-- Performance Indexes for Venue Manager
-- Generated: 2025-11-27
-- Purpose: Add strategic indexes to improve query performance

-- Membership Indexes
CREATE INDEX IF NOT EXISTS "memberships_venueId_userId_idx" ON "memberships"("venueId", "userId");
CREATE INDEX IF NOT EXISTS "memberships_venueId_role_idx" ON "memberships"("venueId", "role");
CREATE INDEX IF NOT EXISTS "memberships_inviteToken_idx" ON "memberships"("inviteToken");

-- Event Indexes
CREATE INDEX IF NOT EXISTS "events_venueId_startTime_idx" ON "events"("venueId", "startTime");
CREATE INDEX IF NOT EXISTS "events_venueId_status_idx" ON "events"("venueId", "status");
CREATE INDEX IF NOT EXISTS "events_createdById_idx" ON "events"("createdById");

-- Transaction Indexes
CREATE INDEX IF NOT EXISTS "transactions_venueId_createdAt_idx" ON "transactions"("venueId", "createdAt");
CREATE INDEX IF NOT EXISTS "transactions_venueId_serviceId_idx" ON "transactions"("venueId", "serviceId");
CREATE INDEX IF NOT EXISTS "transactions_staffId_idx" ON "transactions"("staffId");

-- Task Indexes
CREATE INDEX IF NOT EXISTS "tasks_venueId_status_priority_idx" ON "tasks"("venueId", "status", "priority");
CREATE INDEX IF NOT EXISTS "tasks_assignedTo_idx" ON "tasks"("assignedTo");
CREATE INDEX IF NOT EXISTS "tasks_assignedRoleId_idx" ON "tasks"("assignedRoleId");

-- Verify indexes were created
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND (indexname LIKE '%venueId%'
         OR indexname LIKE '%startTime%'
         OR indexname LIKE '%status%'
         OR indexname LIKE '%assignedTo%'
         OR indexname LIKE '%inviteToken%')
ORDER BY tablename, indexname;
