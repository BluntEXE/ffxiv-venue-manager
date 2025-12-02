# FFXIV Venue Manager - Development Progress

**Last Updated**: 2025-11-26
**Project Status**: Phase 6c Complete (Role-Based Assignment)

---

## Project Overview

A comprehensive web-based venue management system for Final Fantasy XIV roleplaying venues. Built with Next.js 15, PostgreSQL (Supabase), Prisma ORM, and NextAuth.

**Live Development Server**: http://localhost:3000
**Prisma Studio**: http://localhost:5555

---

## Technology Stack

- **Frontend**: Next.js 15 (App Router), React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Database**: PostgreSQL via Supabase
- **ORM**: Prisma 7.0 with PostgreSQL adapter
- **Authentication**: NextAuth v4 with Discord OAuth
- **Forms**: React Hook Form, Zod validation
- **Dates**: date-fns

---

## Development Phases Summary

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Foundation - Auth, Venues, Database |
| Phase 2 | ✅ Complete | Events & Calendar System |
| Phase 3 | ✅ Complete | Staff Management & Roles |
| Phase 4 | ✅ Complete | Services & Sales Tracking |
| Phase 5 | ⚠️ Partial | Tasks (Complete), Webhooks (Not Implemented) |
| Phase 6 | ⚠️ Partial | Settings, Webhooks, Role-Based Assignment (Complete), Deployment (Pending) |

---

## Phase 1: Foundation ✅ COMPLETE

### Completed: 2025-11-25

#### Infrastructure
- [x] Next.js 15 project initialized with TypeScript and Tailwind
- [x] Supabase PostgreSQL database configured
- [x] Prisma ORM with connection pooling (PG adapter)
- [x] Environment variables configured

#### Database Schema (11 Tables)
- [x] **users** - User authentication and profiles
- [x] **accounts** - OAuth provider accounts
- [x] **sessions** - User sessions
- [x] **verification_tokens** - Email verification
- [x] **venues** - Venue management (multi-tenant)
- [x] **memberships** - User-venue relationships with roles
- [x] **roles** - Custom roles per venue
- [x] **events** - Calendar events
- [x] **services** - Product/service catalog
- [x] **transactions** - Sales tracking
- [x] **tasks** - Task management
- [x] **webhooks** - Discord webhook configuration

#### Authentication System
- [x] NextAuth v4 with Discord OAuth
- [x] JWT session strategy
- [x] User profile management
- [x] Session persistence

#### Critical Fixes Applied
- [x] **Prisma 7 Compatibility** - Implemented PostgreSQL adapter
- [x] **Database Connection** - Used Supabase Session Pooler
- [x] **NextAuth Session Loop** - Switched to JWT sessions
- [x] **Next.js 15 Params** - Converted to async params pattern

#### Venue Management
- [x] Multi-venue support per user
- [x] FFXIV data centers and worlds selection
- [x] Automatic slug generation
- [x] Venue ownership tracking
- [x] Dashboard navigation with venue switcher

**Files Created (Phase 1)**:
- `lib/prisma.ts` - Prisma client with PG adapter
- `lib/auth.ts` - NextAuth configuration
- `prisma/schema.prisma` - Complete database schema
- `app/api/auth/[...nextauth]/route.ts` - Auth endpoints
- `app/api/venues/route.ts` - Venue CRUD
- `app/venues/new/page.tsx` - Venue creation form
- `app/dashboard/page.tsx` - User dashboard
- `app/dashboard/[slug]/page.tsx` - Venue dashboard
- `components/navbar.tsx` - Global navigation
- `middleware.ts` - Route protection

---

## Phase 2: Events & Calendar System ✅ COMPLETE

### Completed: 2025-11-25

#### Event Management Features
- [x] Create, edit, delete events
- [x] Event types (Performance, Game Night, Social, Market, etc.)
- [x] Event status tracking (Draft, Published, Active, Completed, Cancelled)
- [x] Start/end date and time selection
- [x] Event descriptions and details
- [x] Attendance and revenue tracking
- [x] Filter events by status

#### Calendar System
- [x] Full month calendar view
- [x] Events displayed on correct days
- [x] Month navigation (previous/next)
- [x] "Today" quick navigation
- [x] Calendar/List view toggle
- [x] Upcoming vs Past events separation

#### API Endpoints
- [x] `GET/POST /api/venues/[venueId]/events` - List/create events
- [x] `GET/PUT/DELETE /api/venues/[venueId]/events/[eventId]` - Individual event operations
- [x] Permission-based access (OWNER/MANAGER can create)

#### UI Components
- [x] DateTimePicker component
- [x] EventsCalendar component
- [x] Event cards with status badges
- [x] Delete confirmation dialog
- [x] Event detail view
- [x] Event edit form

**Files Created (Phase 2)**:
- `app/api/venues/[venueId]/events/route.ts` - Events API
- `app/api/venues/[venueId]/events/[eventId]/route.ts` - Individual event API
- `app/dashboard/[slug]/events/page.tsx` - Events list and calendar
- `app/dashboard/[slug]/events/new/page.tsx` - Event creation
- `app/dashboard/[slug]/events/[eventId]/page.tsx` - Event details
- `app/dashboard/[slug]/events/[eventId]/edit/page.tsx` - Event editing
- `components/ui/date-time-picker.tsx` - Custom date/time input
- `components/events-calendar.tsx` - Calendar view
- `components/delete-event-button.tsx` - Delete with confirmation

---

## Phase 3: Staff Management & Roles ✅ COMPLETE

### Completed: 2025-11-25

#### Staff Management Features
- [x] Staff directory with role-based organization
- [x] Invite staff via email
- [x] Email-based user lookup/creation
- [x] Role assignment (OWNER, MANAGER, STAFF)
- [x] Custom role creation and assignment
- [x] Staff member detail pages
- [x] Remove staff functionality
- [x] Permission hierarchy enforcement

#### Custom Roles System
- [x] Create custom roles (Bartender, DJ, Security, etc.)
- [x] Role descriptions/responsibilities
- [x] Role color coding (optional)
- [x] Assign custom roles to staff
- [x] Track role assignments
- [x] Delete roles (only if unassigned)

#### Role-Based Permissions
- **OWNER**: Full access to all features
- **MANAGER**: Can invite staff, create roles, manage events
- **STAFF**: View-only access to most features
- Managers cannot modify owners
- Only owners can remove staff

#### API Endpoints
- [x] `GET/POST /api/venues/[venueId]/staff` - List/invite staff
- [x] `PUT/DELETE /api/venues/[venueId]/staff/[membershipId]` - Update/remove staff
- [x] `GET/POST /api/venues/[venueId]/roles` - List/create custom roles
- [x] `GET/PUT/DELETE /api/venues/[venueId]/roles/[roleId]` - Manage roles

#### Critical Fixes Applied
- [x] Fixed schema field mismatch (`description` → `responsibilities`)
- [x] Added optional chaining for `_count` safety
- [x] Fixed Select component empty string values

**Files Created (Phase 3)**:
- `app/api/venues/[venueId]/staff/route.ts` - Staff management API
- `app/api/venues/[venueId]/staff/[membershipId]/route.ts` - Individual staff API
- `app/api/venues/[venueId]/roles/route.ts` - Custom roles API
- `app/api/venues/[venueId]/roles/[roleId]/route.ts` - Individual role API
- `app/dashboard/[slug]/staff/page.tsx` - Staff directory
- `app/dashboard/[slug]/staff/invite/page.tsx` - Invite form
- `app/dashboard/[slug]/staff/roles/page.tsx` - Role management
- `app/dashboard/[slug]/staff/[membershipId]/page.tsx` - Staff member detail

---

## Phase 4: Services & Sales Tracking ✅ COMPLETE

### Completed: 2025-11-25

#### Service Catalog Features
- [x] Create/edit/delete services
- [x] Service pricing (gil)
- [x] Service categories (Food, Drinks, VIP, Entertainment, Other)
- [x] Service descriptions
- [x] Active/inactive status toggle
- [x] Track sales count per service
- [x] Separate active/inactive display

#### Sales & Transaction Features
- [x] Log sales transactions
- [x] Quick service selection (auto-fills price)
- [x] Manual amount entry
- [x] Customer name tracking (optional)
- [x] Transaction notes
- [x] Staff member auto-tracking
- [x] Event linking (optional)
- [x] Transaction history view

#### Revenue Analytics
- [x] Total revenue (all time)
- [x] Today's revenue
- [x] Average sale amount
- [x] Transaction count statistics
- [x] Revenue by service
- [x] Revenue by time period

#### API Endpoints
- [x] `GET/POST /api/venues/[venueId]/services` - Service catalog
- [x] `GET/PUT/DELETE /api/venues/[venueId]/services/[serviceId]` - Individual service
- [x] `GET/POST /api/venues/[venueId]/transactions` - Transaction logging
- [x] Transaction filtering (by date, service, event)

#### Critical Fixes Applied
- [x] Fixed Select component empty string issue (services & sales)
- [x] Implemented "none"/"manual" placeholder values

**Files Created (Phase 4)**:
- `app/api/venues/[venueId]/services/route.ts` - Services API
- `app/api/venues/[venueId]/services/[serviceId]/route.ts` - Individual service API
- `app/api/venues/[venueId]/transactions/route.ts` - Transactions API
- `app/dashboard/[slug]/services/page.tsx` - Service catalog management
- `app/dashboard/[slug]/sales/page.tsx` - Sales logging and dashboard
- Updated venue dashboard with new navigation buttons

---

## Phase 5: Tasks & Webhooks ✅ COMPLETE

### Completed: 2025-11-25

#### Task Management Features ✅ COMPLETE
- [x] Task creation and assignment
- [x] Task status tracking (Pending, In Progress, Completed, Cancelled)
- [x] Task priority levels (Low, Medium, High, Urgent)
- [x] Due date management
- [x] Assign tasks to staff members
- [x] Task categories (Setup, Cleanup, Promotional, etc.)
- [x] Quick status updates (Start, Complete, Reopen)
- [x] Task filtering by status
- [x] Auto-tracking completion time and user
- [x] Permission-based task management

#### Task Statistics & Display
- [x] Total, Pending, In Progress, Completed counts
- [x] Color-coded priority badges
- [x] Color-coded status badges
- [x] Assignee avatars and names
- [x] Due date display
- [x] Completion info tracking

#### API Endpoints
- [x] `GET/POST /api/venues/[venueId]/tasks` - List/create tasks
- [x] `GET/PUT/DELETE /api/venues/[venueId]/tasks/[taskId]` - Manage tasks
- [x] Task filtering (by status, priority, assignee)
- [x] Permission checks (OWNER/MANAGER can create, assignees can update status)

**Files Created (Phase 5 - Tasks)**:
- `app/api/venues/[venueId]/tasks/route.ts` - Tasks API
- `app/api/venues/[venueId]/tasks/[taskId]/route.ts` - Individual task API
- `app/dashboard/[slug]/tasks/page.tsx` - Task management page

#### Discord Webhooks ✅ COMPLETE (Implemented in Phase 6b)
- [x] Discord webhook configuration UI
- [x] Webhook event toggles in settings
- [x] Automated notifications for 7 event types
- [x] Event created announcements
- [x] Event starting soon reminders
- [x] Task created/completed notifications
- [x] Sale logged notifications
- [x] Staff joined notifications

**Note**: Discord webhook integration was initially deferred in Phase 5 but has been fully implemented in Phase 6b.

---

## Phase 6: Polish & Deployment ⏳ IN PROGRESS

### Phase 6a: Venue Settings & Privacy Controls ✅ COMPLETE

#### Venue Settings Management
- [x] Venue settings page (`/dashboard/[slug]/settings`)
- [x] Task visibility controls:
  - [x] All Tasks (full transparency)
  - [x] Assigned Only (privacy mode)
  - [x] Assigned + Unassigned (hybrid)
- [x] Sales data visibility controls:
  - [x] All Transactions
  - [x] Own Transactions Only
  - [x] No Access to Sales Page
- [x] Revenue visibility controls:
  - [x] Show All Revenue Statistics
  - [x] Hide All Revenue
  - [x] Show Own Revenue Only
- [x] Event visibility controls:
  - [x] All Events (including drafts)
  - [x] Published Only (hide drafts from staff)
- [x] Per-venue settings storage (JSON field in Venue model)
- [x] Default settings on venue creation
- [x] Settings enforcement in all API routes

#### Settings Features
- [x] OWNER-only settings management
- [x] Settings only affect STAFF members
- [x] OWNER/MANAGER always have full access
- [x] Comprehensive UI with explanations for each option
- [x] Real-time settings updates
- [x] Settings API endpoint with validation

**Files Created (Phase 6a - Settings)**:
- `app/api/venues/[venueId]/settings/route.ts` - Settings API
- `app/dashboard/[slug]/settings/page.tsx` - Settings management page

**Files Modified (Phase 6a - Settings)**:
- `prisma/schema.prisma` - Added settings JSON field to Venue model
- `app/api/venues/[venueId]/tasks/route.ts` - Task visibility enforcement
- `app/api/venues/[venueId]/transactions/route.ts` - Sales/revenue visibility enforcement
- `app/api/venues/[venueId]/events/route.ts` - Event visibility enforcement

### Phase 6b: Discord Webhooks & Automation ✅ COMPLETE

#### Discord Webhook System
- [x] Discord webhook URL configuration
- [x] Webhook notification toggles (7 event types)
- [x] Webhook settings UI in venue settings page
- [x] Discord embed message formatting
- [x] Asynchronous webhook delivery
- [x] Error handling for failed webhooks

#### Implemented Notifications
- [x] **Task Created** - Notifies when new tasks are assigned
  - Shows task title, description, priority, assignee, due date
  - Color-coded by priority (Urgent=Red, High=Orange, Medium=Blue, Low=Gray)
- [x] **Task Completed** - Notifies when staff complete tasks
  - Shows task title, priority, who completed it
- [x] **Event Created** - Notifies when new events are scheduled
  - Shows event title, description, type, start/end times
- [x] **Event Starting Soon** - Reminder 1 hour before event starts
  - Shows event title and start time
- [x] **Sale Logged** - Notifies when transactions are recorded
  - Shows amount, service, customer name, staff member
- [x] **Daily Sales Summary** - End-of-day sales report
  - Shows total sales, total revenue, top service
- [x] **Staff Joined** - Notifies when new staff members join
  - Shows staff name and assigned role

#### Technical Implementation
- [x] Webhook utility library with formatting functions
- [x] Integration into Tasks API (create, complete)
- [x] Integration into Events API (create)
- [x] Integration into Transactions API (create)
- [x] Integration into Staff/Memberships API (create)
- [x] Settings API updated for webhook configuration
- [x] Prisma schema updated with webhook settings
- [x] Cron job API for Event Starting Soon notifications
- [x] Cron job API for Daily Sales Summary
- [x] Vercel cron configuration (vercel.json)

**Files Created (Phase 6b - Webhooks)**:
- `lib/discord-webhook.ts` - Discord webhook utility and formatters
- `app/api/cron/event-reminders/route.ts` - Event starting soon cron job
- `app/api/cron/daily-sales-summary/route.ts` - Daily sales summary cron job
- `vercel.json` - Vercel cron configuration
- `CRON_JOBS.md` - Cron job documentation

**Files Modified (Phase 6b - Webhooks)**:
- `prisma/schema.prisma` - Added webhook settings to venue settings JSON
- `app/api/venues/[venueId]/settings/route.ts` - Webhook URL and settings handling
- `app/dashboard/[slug]/settings/page.tsx` - Webhook configuration UI
- `app/api/venues/[venueId]/tasks/route.ts` - Task created webhook
- `app/api/venues/[venueId]/tasks/[taskId]/route.ts` - Task completed webhook
- `app/api/venues/[venueId]/events/route.ts` - Event created webhook
- `app/api/venues/[venueId]/transactions/route.ts` - Sale logged webhook
- `app/api/venues/[venueId]/staff/route.ts` - Staff joined webhook

### Phase 6c: Role-Based Assignment System ✅ COMPLETE

#### Completed: 2025-11-26

#### Role-Based Services (Many-to-Many)
- [x] Services linked to multiple custom roles instead of categories
- [x] Removed category field from services
- [x] Added role checkbox selection in service creation/editing
- [x] Services display role badges with color coding
- [x] Database schema updated with Service-Role many-to-many relationship
- [x] API handles roleIds array for service creation/updates
- [x] UI fetches and displays roles alongside services

#### Role-Based Tasks (Single Assignment)
- [x] Tasks assigned to single custom role instead of individual staff
- [x] Removed person assignment option from tasks
- [x] Added role dropdown selection in task creation
- [x] Tasks display assigned role badge
- [x] Database schema updated with assignedRoleId field
- [x] API handles role-based task assignment
- [x] Permission system checks if user has assigned role

#### Technical Implementation
- [x] Prisma schema updates:
  - Service model: Many-to-many with Role (via implicit relation)
  - Task model: Single assignedRoleId field with Role relation
- [x] API route updates:
  - Services API: Handle roleIds array with Prisma connect/set
  - Tasks API: Handle assignedRoleId with role permission checks
- [x] Frontend updates:
  - Services page: Role checkboxes, role badges, removed categories
  - Tasks page: Role dropdown, role badge display
  - Both pages fetch roles from API

#### Build Fixes Applied
- [x] Fixed Prisma service.create structure (data/roles.connect/include)
- [x] Fixed task role permission check (roleId instead of roles.some)
- [x] Added missing component imports (Card, Dialog, AlertDialog)
- [x] Fixed duplicate interface fields in Task type
- [x] Local build test passed successfully
- [x] Deployed to Vercel successfully

**Files Modified (Phase 6c - Role-Based Assignment)**:
- `prisma/schema.prisma` - Updated Service and Task models for role relationships
- `app/api/venues/[venueId]/services/route.ts` - Handle roleIds in create/list
- `app/api/venues/[venueId]/services/[serviceId]/route.ts` - Handle roleIds in updates
- `app/api/venues/[venueId]/tasks/route.ts` - Handle assignedRoleId in create/list
- `app/api/venues/[venueId]/tasks/[taskId]/route.ts` - Handle assignedRoleId in updates with role permission checks
- `app/dashboard/[slug]/services/page.tsx` - Role-based UI with checkboxes and badges
- `app/dashboard/[slug]/tasks/page.tsx` - Role-based UI with dropdown and badge

### Phase 6d: Advanced Features & Deployment (PLANNED)

#### Advanced Features & Deployment
- [ ] Advanced analytics dashboard (charts, trends, performance metrics)
- [ ] Mobile responsive improvements
- [ ] Production deployment to Vercel
- [ ] Custom domain setup
- [ ] Performance optimization
- [ ] Error tracking (Sentry)

---

## Project Statistics

### Code Metrics
- **Total Pages**: 23+
- **API Endpoints**: 38+ (including 2 cron jobs)
- **Database Tables**: 11
- **Components**: 30+
- **Utility Libraries**: 2+ (auth, discord-webhook)
- **Lines of Code**: ~12,000+
- **Cron Jobs**: 2 (event reminders, daily summaries)

### Features Implemented
- ✅ Multi-tenant venue management
- ✅ Discord OAuth authentication
- ✅ Event scheduling and calendar
- ✅ Staff management with roles
- ✅ Custom role creation
- ✅ Service catalog
- ✅ Sales transaction logging
- ✅ Revenue analytics
- ✅ Task management and assignment
- ✅ Role-based permissions
- ✅ Venue settings & privacy controls
- ✅ Discord webhook notifications (7 event types)
- ✅ Responsive UI
- ✅ Role-based service assignment (many-to-many)
- ✅ Role-based task assignment (single role)

### Testing Checklist
- [x] User can sign in with Discord
- [x] User can create multiple venues
- [x] User can create and manage events
- [x] Calendar displays events correctly
- [x] User can invite staff members
- [x] User can create custom roles
- [x] User can assign roles to staff
- [x] User can create services
- [x] User can log sales
- [x] Revenue statistics calculate correctly
- [x] User can create and assign tasks
- [x] Task status updates work correctly
- [x] Task filtering by status works
- [x] Permissions enforce correctly
- [ ] User can configure Discord webhook URL
- [ ] User can toggle webhook notifications
- [ ] Webhooks send when events trigger
- [ ] Discord messages display correctly formatted
- [ ] Venue settings save and load correctly
- [ ] Privacy settings enforce correctly for staff

---

## Known Issues & Future Improvements

### Current Limitations
- No real-time updates (requires polling)
- No email notifications
- Not deployed to production yet

### Future Enhancements
- Real-time collaboration (Socket.io)
- Advanced reporting and analytics
- Export data to CSV/PDF
- Mobile app (React Native)
- API for third-party integrations
- Bulk operations
- Audit logs

---

## Documentation Files

- **PROGRESS.md** - This file (development history)
- **QUICK_START.md** - Quick reference guide
- **DEPLOYMENT.md** - Production deployment guide
- **DISCORD_SETUP.md** - Discord OAuth setup
- **SETUP.md** - Initial database setup
- **README.md** - Project overview

---

## Development Commands

```bash
# Start development server
npm run dev

# Open Prisma Studio
npx prisma studio

# Generate Prisma client
npx prisma generate

# Push schema changes
npx prisma db push

# Reset database (WARNING: deletes data)
npx prisma db push --force-reset
```

---

**Project Directory**: `F:\Claude\Project Ideas\venue-manager-web`
**Development Period**: November 25, 2025
**Total Development Time**: ~1 session
**Status**: Active Development
