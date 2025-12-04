# FFXIV Venue Manager - Venue Owner's Guide

Welcome to FFXIV Venue Manager! This guide will help you understand and use all the features available to manage your roleplay venue.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Events Management](#events-management)
4. [Event Templates](#event-templates)
5. [Staff Management](#staff-management)
6. [Tasks & Assignments](#tasks--assignments)
7. [Services Catalog](#services-catalog)
8. [Sales & Revenue Tracking](#sales--revenue-tracking)
9. [Staff Payroll](#staff-payroll)
10. [Analytics](#analytics)
11. [Venue Settings](#venue-settings)
12. [Discord Integration](#discord-integration)

---

## Getting Started

### Creating Your Venue

1. Sign in with Discord at https://xivvenuemanager.com
2. Click "Create New Venue" from your dashboard
3. Fill in your venue details:
   - **Venue Name**: Your venue's display name
   - **URL**: URL-friendly identifier (e.g., "my-tavern")
   - **Data Center & World**: Your FFXIV location
   - **Description**: What makes your venue special
   - **Location**: In-game address (housing ward, plot)
4. Click "Create Venue"

### Your Role

As the venue creator, you are automatically the **OWNER** with full permissions.

**Role Hierarchy**:
- **OWNER**: Full access to everything
- **MANAGER**: All of Staff actions + can manage events, staff, services, payroll
- **STAFF**: Can view schedules, complete tasks, log sales

---

## Dashboard Overview

Your main dashboard (`/dashboard/[your-venue]`) shows:

### Quick Stats
- **Total Revenue**: All-time sales total
- **Active Events**: Currently running events
- **Pending Tasks**: Tasks awaiting completion
- **Staff Members**: Total team size

### Quick Actions
- 📅 **Create Event**: Schedule a new event
- 👥 **Invite Staff**: Send invite links to your team
- ✅ **Add Task**: Create task assignments
- 🛍️ **Log Sale**: Record a transaction
- 💵 **Staff Payroll** (OWNER/MANAGER only): Manage staff payments

### Recent Activity
- Latest sales transactions
- Recent task completions
- Upcoming events

### Analytics Preview
- Revenue trends (last 7 events)
- Task completion status
- Quick visual insights

---

## Events Management

### Creating an Event

**Method 1: From Venue Page**
1. Click Events Card
2. Click "Create Event" button
3. Fill in event details (see below)

**Method 2: From Events Page**
1. Navigate to **Events** (📅) in sidebar
2. Click "Create Event" button
3. Fill in event details (see below)

**Event Details**:
- **Event Title**: Descriptive name (e.g., "Live Music Night")
- **Event Type**: PERFORMANCE, GAME_NIGHT, SPECIAL, SOCIAL, PRIVATE, OTHER
- **Description**: What attendees can expect
- **Start Time**: When the event begins
- **End Time**: When the event ends
- **Status**:
  - **DRAFT**: Only visible to staff (Will not start automatically)
  - **PUBLISHED**: Ready to be automatically started at Event time.

**💡 Pro Tip**: Use Event Templates (see next section) to save time on recurring events!

### Event Lifecycle

Events automatically transition through statuses via the cron system:

1. **DRAFT** → **PUBLISHED**: When you manually publish
2. **PUBLISHED** → **ACTIVE**: When event start time arrives (auto)
3. **ACTIVE** → **COMPLETED**: When event end time passes (auto)
4. **CANCELLED**: Manual status if event is cancelled

### Viewing Events

**Events Page** shows:
- Calendar view of all events
- View status (Upcoming, Active, Completed, Cancelled)
- Event cards with title, type, date/time, status badge

**Event Details** include:
- Title, description, type
- Date and time
- Current status
- Attendance count (if tracked)
- Revenue linked to this event

### Editing Events

1. Click on an event card
2. Click "Edit Event" button
3. Modify any field
4. Save changes

### Deleting Events

1. Click on event card
2. Click "Delete" button
3. Confirm deletion (this is permanent!)

---

## Event Templates

**Event Templates** save time when creating recurring events (e.g., weekly trivia nights).

### Creating a Template

1. Navigate to **Event Templates** (📋) in sidebar (OWNER/MANAGER only)
2. Click "New Template" button
3. Fill in template details:
   - **Template Name**: Internal name (e.g., "Weekly Trivia Night")
   - **Event Title**: The title to use when creating events (e.g., "Trivia Night at The Golden Saucer")
   - **Description**: Default description for this type of event
   - **Event Type**: Category (GAME_NIGHT, PERFORMANCE, etc.)
   - **Default Start Time**: Typical start time in 24-hour format (e.g., 19:00 for 7 PM)
   - **Default End Time**: Typical end time (e.g., 22:00 for 10 PM)
4. Click "Create Template"

**Time Format Notes**:
- Use 24-hour format: 00:00 = midnight, 12:00 = noon, 19:00 = 7 PM
- Times are suggestions and can be adjusted when creating events

### Using a Template

1. Go to "Create Event" page
2. At the top, select a template from the dropdown
3. Form automatically fills with template data:
   - Title, description, event type are pre-filled
   - Start/end times are set to today at the template's default times
4. Adjust the date/time as needed
5. Click "Create Event"

**💡 Pro Tip**: Templates are great for:
- Weekly/bi-weekly events
- Seasonal events with similar structure
- Events that always run the same time slots

### Managing Templates

**View Templates**: Event Templates page shows all your templates in a grid

**Edit Template**: Click edit icon (✏️) on template card

**Delete Template**: Click trash icon (🗑️) and confirm

**Template Cards Show**:
- Template name and event title
- Event type badge
- Default time range
- Description preview
- Creator name

---

## Staff Management

### Inviting Staff Members

1. Navigate to **Staff** (👥) in sidebar
2. Click "Invite Staff" button
3. Enter staff member details:
   - **Discord Username** (optional, for display)
   - **Email** (optional, for reference)
   - **Role**: MANAGER or STAFF
   - **Custom Role** (optional): Assign a custom role if created
4. Copy the invite link
5. Share the link with your staff member via Discord/DM

**Invite Links**:
- Valid for 7 days
- One-time use
- Staff must be signed in to accept
- Shows as "Pending" until accepted

### Staff List

The Staff page shows:
- **Name/Username**: Discord username
- **Role**: OWNER, MANAGER, or STAFF
- **Custom Role**: If assigned (e.g., "Bartender", "Host")
- **Hire Date**: When they joined
- **Status**: Active or Pending (for invites)

### Editing Staff Members

**Change Role** (OWNER only):
1. Click on staff member card
2. Click "Edit" button
3. Change their role (MANAGER ↔ STAFF)
4. Save changes

**Assign Custom Role** (OWNER/MANAGER):
1. Create custom roles in **Settings** first
2. Edit staff member
3. Select custom role from dropdown
4. Save changes

### Removing Staff

1. Click on staff member
2. Click "Remove" button
3. Confirm removal (OWNER only for permanent removal)

**⚠️ Warning**: Removing staff also removes:
- Their task assignments
- Their transaction history links
- Their payroll entries

---

## Tasks & Assignments

### Creating Tasks

1. Navigate to **Tasks** (✅) in sidebar
2. Click "Create Task" button
3. Fill in task details:
   - **Title**: Short description (e.g., "Set up bar decorations")
   - **Description**: Detailed instructions
   - **Priority**: LOW, MEDIUM, HIGH, URGENT
   - **Category**: setup, cleanup, promotional, etc.
   - **Assign To**: Choose a staff member or role
   - **Due Date**: When task should be completed (optional)
4. Click "Create Task"

### Task Assignment Options

**Assign to Role**:
- Select a custom role (e.g., "Bartenders")
- Any staff with that role can see and complete it
- Good for shared responsibilities

### Task Statuses

- **PENDING**: Not started yet
- **IN_PROGRESS**: Someone is working on it
- **COMPLETED**: Task is done
- **CANCELLED**: Task was cancelled

### Task List View

**Filter Tasks**:
- All
- Pending
- In Progress
- Completed

**Task Cards Show**:
- Title and description
- Priority badge (color-coded)
- Assigned role
- Due date/Creation date
- Status
- Complete button (if assigned to you)

### Completing Tasks

**As Staff Member**:
1. View your assigned tasks
2. Click "Mark Complete" button
3. Task moves to Completed status
4. Completion is logged with your name and timestamp

---

## Services Catalog

Your **Services Catalog** lists all services/items your venue offers.

### Creating a Service

1. Navigate to **Services** (🛍️) in sidebar or click Services Card
2. Click "Add Service" button
3. Fill in service details:
   - **Name**: Service/item name (e.g., "Cocktail", "Private Show")
   - **Price**: Cost in Gil
   - **Roles**: Who can provide service?
   - **Description (Optional)**: What's included
   - **Active Slider**: Is service available for sale?
4. Click "Create Service"

### Service List

Services are displayed as cards showing:
- Service name
- Description
- Price
- Roles badge
- Active/inactive status

### Editing Services

1. Click on service card
2. Click "Edit" button
3. Update name, price, roles, description, or if active
4. Save changes

---

## Sales & Revenue Tracking

### Logging a Sale

1. Navigate to **Sales** (💰) in sidebar
2. Click "Log Sale" button

**Sale Details**:
- **Service**: Select from your catalog (or leave blank for manual entry)
- **Event**: Link sale to an event
- **Amount**: Sale price in Gil
- **Customer Name**: Optional (for record-keeping)
- **Notes**: Optional details

**💡 Pro Tip**: When an event is ACTIVE, it's automatically selected in the Event field!

### Sales History

The Sales page shows:
- **Total Revenue**: Sum of all sales
- **Today's Revenue**: Sum of all sales logged today
- **Average Sale**: Average sum across all transactions
- **Transaction History**: Chronological list of all sales

**Transaction Cards Show**:
- Date and time
- Service name (or "Manual Sale")
- Amount in Gil
- Customer name (if provided)
- Linked event (if applicable)
- Staff member who logged it

### Exporting Sales Data

1. Go to Sales page
2. Click "Export to CSV" button (📥)
3. CSV downloads with columns:
   - Date
   - Event
   - Service
   - Amount (gil)
4. Open in Excel/Google Sheets for analysis

---

## Staff Payroll (This feature is still in progress and may not work)

**Payroll** is available to OWNER and MANAGER roles only.

### Creating a Payroll Entry

1. Navigate to **Payroll** (💵) from dashboard or sidebar
2. Click "Add Payroll Entry" button
3. Fill in payroll details:
   - **Staff Member**: Select from active staff
   - **Payment Type**
     - **Fixed Salary**: Set amount paid per period
     - **Hourly**: Pay rate × hours worked
   - **Fixed Amount/Hourly Rate**: Gil per period (salary) or per hour (hourly)
   - **Hours Worked**: Only for hourly payments
   - **Bonus Amount**: Optional additional payment
   - **Pay Period**: Start and end dates
   - **Notes**: Optional details (reason for bonus, etc.)
   - **Total Amount**: Shows total payment amount 
4. Click "Create Entry"

**Total Calculation**:
- **Fixed Salary**: Fixced Amount + Bonus
- **Hourly**: (Hourly Rate × Hours Worked) + Bonus

### Payroll Summary

The Payroll page shows:
- **Unpaid Total**: All pending payments
- **Paid Total**: All completed payments
- **Grand Total**: Sum of all entries

**Filter Tabs**:
- All entries
- Unpaid only
- Paid only

### Payroll Entry Cards

Each card displays:
- Staff member avatar and name
- Payment status badge (Paid/Unpaid)
- Hourly indicator (if applicable)
- Pay period dates
- Calculation breakdown:
  - Base: X Gil
  - Hours: X hours (hourly only)
  - Bonus: X Gil (if applicable)
  - **Total: X Gil**
- Notes
- Payment audit trail (who marked as paid, when)

### Marking as Paid

1. Locate payroll entry
2. Click "Mark as Paid" button
3. Entry updates with:
   - Status: Paid
   - Paid Date: Timestamp
   - Paid By: Your name

**Undo Payment**:
- Click "Mark as Unpaid" to revert
- Clears paid date and paid by fields
- Useful if marked by mistake

### Payroll Reports

Export payroll data for accounting:
**Future Feature**: CSV export for payroll coming soon!

---

## Analytics

### Dashboard Analytics

Quick view on main dashboard shows:
- **Revenue Trend**: Last 7 events (scatter plot with trendline)
- **Task Completion**: Pending vs Completed ratio (bar chart)

### Full Analytics Page

Navigate to **Analytics** (📊) in sidebar for detailed insights:

#### A. Revenue Analytics
**Last 10 Events Revenue** (Scatter Chart)
- Shows revenue per event
- Linear regression trendline shows growth
- Hover for exact amounts

**Patrons Visits in last 7 Events** (Bar Chart)
- Shows patron count per event
- Helps identify popular events
- Tracks growth over time

**Top Services by Revenue** (Pie Chart)
- Which services generate most income
- Percentage breakdown
- Legend shows all services

**💡 Analytics Tips**:
- Check analytics weekly to spot trends
- Compare event types to see what works
- Use data to adjust pricing
- Share with staff to motivate

---

## Venue Settings

Navigate to **Settings** (⚙️) in sidebar.

### Visibility Settings

Control who can see what:

**Task Visibility**:
- **All**: Everyone sees all tasks
- **Assigned Only**: Staff see only their tasks
- **Role-Based**: Staff see tasks for their role

**Sales Data Visibility**:
- **All**: Everyone sees all transactions
- **Managers Only**: Only OWNER/MANAGER see sales
- **Role-Based**: Custom visibility rules

**Revenue Visibility**:
- **All**: Everyone sees revenue data
- **Managers Only**: Only OWNER/MANAGER see totals
- **Hidden**: Revenue is private

**Event Visibility**:
- **All**: Everyone sees all events
- **Published Only**: Staff see only published events

### Coming Soon

**Venue Details**:
- Name, description
- Data Center, World
- In-game location

**Update**:
1. Edit any field
2. Click "Save Changes"

---

## Discord Integration

### Discord Webhooks

Automate notifications to your Discord server:

1. Create webhook URLs in Discord:
   - Server Settings → Integrations → Webhooks
   - Create webhook for each channel
2. On XIV Venue Manager go to Settings
3. Scroll down to Discord Webhooks
4. Paste webhook URLs:
   - **Staff Operations Channel**: Staff updates, task notifications
   - **Events Channel**: Event reminders (Event Status updates coming soon)
   - **Revenue Channel**: Sales summaries
5. Enable desired notifications:
   - ✅ Task Created
   - ✅ Task Completed
   - ✅ Staff Joined
   - ✅ Event Created
   - ✅ Event Starting Soon (1 hour reminder)
   - ✅ Sale Logged
   - ✅ Daily Sales Summary (midnight UTC)
5. Click "Save Webhooks"

### Discord OAuth Login

Staff sign in with Discord:
- No passwords needed
- Automatic avatar import
- Easy to remember
- Secure authentication

**How It Works**:
1. Staff click "Sign In with Discord"
2. Discord asks for permission
3. They're logged in instantly
4. Display name and avatar imported

---

## Tips for Success

### 1. Start Small
- Create your venue
- Invite 2-3 core staff members
- Create your first event
- Log a few test sales

### 2. Use Templates
- Create templates for recurring events
- Saves 5+ minutes per event
- Ensures consistency

### 3. Assign Roles
- Create custom roles (Host, Bartender, Dancer, etc.)
- Assign roles to staff
- Use role-based task assignment

### 4. Track Everything
- Log all sales immediately
- Link sales to events
- Complete tasks when done
- Review analytics weekly

### 5. Communicate
- Set up Discord webhooks
- Staff get instant notifications
- Share invite links via DM
- Use Notes fields for context

### 6. Regular Payroll
- Create payroll entries weekly/bi-weekly
- Mark as paid when completed
- Add bonus notes for transparency
- Keep staff motivated

### 7. Review Analytics
- Check revenue trends monthly
- Identify best-selling services
- Track attendance patterns
- Adjust strategy based on data

---

## Keyboard Shortcuts

- **Ctrl + K**: Quick search (coming soon)
- **Esc**: Close dialogs
- **Enter**: Submit forms
- **Tab**: Navigate form fields

---

## Mobile Support

The venue manager is fully responsive:
- Works on phones and tablets
- Mobile menu (☰) in bottom-right corner
- Touch-friendly interface
- Swipe to navigate cards

---

## Getting Help

### Support
- Share feedback via the button on XIV Venue Manager
- Contact Ehno on Discord

### Common Issues

**"Can't see payroll page"**
- Payroll is OWNER/MANAGER only
- Ask your venue owner to promote you

**"Event won't go ACTIVE"**
- Check start time is in the past
- Verify time format (use 24-hour: 00:00 for midnight)
- Wait 15 minutes for cron job (runs every 15 min)

**"Invite link expired"**
- Links expire after 7 days
- Venue owner can create a new invite

**"Sales not showing in analytics"**
- Make sure sales are linked to events
- Use Event field when logging sale
- Analytics only show event-linked revenue

**"Forgot which venue I manage"**
- Sign out and sign back in
- Dashboard shows all your venues
- Click venue name to switch

---

## Feature Roadmap

Coming soon (maybe):
- 📱 Mobile app (React Native)
- 📊 Advanced analytics dashboard
- 📧 Email notifications
- 🔔 In-app notification center
- 📄 PDF report generation
- 🎨 Custom theme colors

---

## Credits

**FFXIV Venue Manager**
- Built with Next.js 15, React 19, TypeScript
- Powered by Supabase (PostgreSQL)
- Deployed on Vercel
- Rate limiting via Upstash Redis
- Cron jobs via Upstash QStash
- Authentication via Discord OAuth

**Created by**: Ehno (Discord OAuth integration)
**Version**: 1.0.0
**Last Updated**: 2025-12-04

---

**Thank you for using FFXIV Venue Manager!** 🎉

*May your venue thrive and your gil overflow!* 💰