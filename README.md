# XIV Venue Manager

**A comprehensive web-based venue management system for Final Fantasy XIV roleplaying venues**


## Overview

XIV Venue Manager is a modern, full-featured platform designed specifically for FFXIV roleplaying venue owners and staff. Manage multiple venues, coordinate events, track staff, handle sales, assign tasks, and automate Discord notifications—all from one powerful dashboard.

### Key Benefits

- **Multi-venue Management**: Unlimited venues from a single account
- **Role-Based Access**: Fine-grained permissions for owners, managers, and staff
- **Discord Integration**: Automated webhooks for events, tasks, sales, and updates
- **Mobile-First Design**: Fully responsive on all devices
- **Real-Time Collaboration**: Invite staff, assign tasks, coordinate in real-time
- **Financial Tracking**: Sales, transactions, and payroll management
- **Event Scheduling**: Recurring events with automatic Discord reminders

---

## Features

### Events Management
- Create and manage venue events with full scheduling
- Recurring events (daily, weekly, custom intervals)
- Automatic Discord announcements and reminders
- Draft mode for planning future events
- Visibility controls (published vs. all events)

### Staff Management
- Role-based access control (Owner, Manager, Staff)
- Staff invitations with custom roles
- Permission management and visibility settings
- Activity tracking and Discord notifications

### Task Management
- Create and assign tasks to staff members
- Task status tracking (Pending, In Progress, Completed)
- Priority levels and due dates
- Configurable visibility settings
- Discord notifications

### Services & Sales
- Define venue services and offerings
- Log sales transactions with customer info
- Track revenue and commission
- Sales analytics and reporting
- Daily sales summaries via Discord

### Payroll System
- Track hours worked by staff
- Calculate and log payroll payments
- Payment history and analytics
- Owner/manager-only access

### Discord Integration
- Separate webhooks for different notification types
- Selective notification toggles per webhook
- Task, event, sales, and staff notifications
- Customizable per venue

---

## Technology Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Next.js API Routes
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Authentication**: NextAuth.js with Discord OAuth
- **Rate Limiting**: Upstash Redis
- **Hosting**: Vercel

---

## Quick Start

See [QUICK_START.md](./QUICK_START.md) for detailed setup instructions.

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Discord application
- Upstash Redis account

### Installation
```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

---

## User Roles & Permissions

### Owner
- Full access to everything
- Can delete venue
- Can manage all settings and view all financial data

### Manager
- Full access except venue deletion and owner-level settings
- Can manage staff and assign roles
- Can configure visibility settings

### Staff
- Access controlled by venue settings:
  - **Tasks**: See all, assigned only, or assigned + unassigned
  - **Sales**: See all, own only, or no access
  - **Revenue**: See all, own only, or hidden
  - **Events**: See all or published only
- Cannot access Settings or Payroll

---

## Mobile Navigation

- **Dashboard Pages**: Top-right hamburger with user info, venues, feedback
- **Venue Pages**: Bottom-right floating button with comprehensive sidebar:
  - User information and venue switcher
  - All venue sections (Overview, Events, Staff, Tasks, Services, Sales, Payroll, Settings)
  - Feedback and Support buttons
  - Sign out option

---

## Support the Project

XIV Venue Manager is free and open-source. Support development:

- ☕ [Buy me a coffee on Ko-fi](https://ko-fi.com/ehnocure)
- ⭐ Star the repository
- 📢 Share with your venue community
- 🐛 Report bugs and suggest features

Your support helps cover hosting, database costs, and continuous development.