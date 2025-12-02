# Manual Testing Guide
**FFXIV Venue Manager - Quality Assurance**

Follow this guide to thoroughly test all features of the application.

---

## 🎯 Pre-Testing Setup

###  1. Create Test Discord Webhook

1. Open Discord
2. Go to a test server/channel
3. Settings → Integrations → Webhooks → "New Webhook"
4. Copy the webhook URL
5. Keep Discord open to monitor notifications

### 2. Test User Accounts

You'll need to test with 3 different user accounts:
- **User A** - Venue OWNER
- **User B** - MANAGER
- **User C** - STAFF

Use different browsers or incognito windows for different users.

---

## Part 1: Discord Webhook Testing 🔔

### Test Setup
1. Sign in as **OWNER**
2. Go to `/dashboard/[your-venue]/settings`
3. Paste your Discord webhook URL
4. Enable ALL 7 notification types
5. Click "Save Settings"

### Test Cases

#### ✅ 1. Task Created Notification
1. Go to Tasks page
2. Create a new task:
   - Title: "Test Task - High Priority"
   - Priority: HIGH
   - Assign to: Any staff member
   - Due date: Tomorrow
3. **Expected**: Discord receives an embed message showing:
   - 📋 Title: "New Task Created"
   - Task title, description
   - Assigned to staff name
   - Priority (orange color for HIGH)
   - Due date

#### ✅ 2. Task Completed Notification
1. Go to the task you just created
2. Click "Mark as Complete" or change status to COMPLETED
3. **Expected**: Discord receives:
   - ✅ Title: "Task Completed"
   - Task title
   - Completed by (your name)
   - Green color

#### ✅ 3. Event Created Notification
1. Go to Events → "Create Event"
2. Create a test event:
   - Title: "Test Performance"
   - Type: PERFORMANCE
   - Start time: Tomorrow 8:00 PM
   - End time: Tomorrow 10:00 PM
3. Click "Create Event"
4. **Expected**: Discord receives:
   - 📅 Title: "New Event Created"
   - Event title, description
   - Event type
   - Start/end times
   - Blue color

#### ✅ 4. Sale Logged Notification
1. Go to Sales page
2. Log a new transaction:
   - Service: Pick any service (create one if needed)
   - Amount: 50000
   - Customer name: "Test Customer"
3. Click "Log Sale"
4. **Expected**: Discord receives:
   - 💰 Title: "Sale Logged"
   - Amount in Gil
   - Service name
   - Customer name
   - Your name (logged by)
   - Green color

#### ✅ 5. Staff Joined Notification
1. Go to Staff → "Invite Staff"
2. Enter a test email: `test@example.com`
3. Select role: STAFF
4. Click "Invite Staff Member"
5. **Expected**: Discord receives:
   - 👥 Title: "New Staff Member Joined"
   - Staff name
   - Role assigned
   - Green color

#### ⏰ 6. Event Starting Soon (Manual)
This requires an event starting in less than 1 hour.
1. Create an event with start time = current time + 30 minutes
2. Wait and monitor Discord
3. **Expected**: Should receive notification 1 hour before (needs cron job implementation)
4. **Note**: ⚠️ This feature requires a cron job/scheduled task - NOT YET IMPLEMENTED

#### 📊 7. Daily Sales Summary (Manual)
This runs automatically at end of day.
1. **Expected**: Sends daily summary at midnight
2. Shows total sales, revenue, top service
3. **Note**: ⚠️ This feature requires a cron job/scheduled task - NOT YET IMPLEMENTED

---

## Part 2: Privacy Settings Testing 🔒

### Setup
1. Create 3 users (use different browsers/incognito):
   - **User A**: OWNER (you)
   - **User B**: MANAGER (invite via email)
   - **User C**: STAFF (invite via email)

### Test Case 1: Task Visibility

#### Scenario A: "All Tasks" (Default)
1. As **OWNER**, go to Settings
2. Set Task Visibility = "All Tasks"
3. Save settings
4. Create 3 tasks:
   - Task 1: Assigned to User B (MANAGER)
   - Task 2: Assigned to User C (STAFF)
   - Task 3: Unassigned
5. Sign in as **User C** (STAFF)
6. Go to Tasks page
7. **Expected**: User C can see ALL 3 tasks

#### Scenario B: "Assigned Only"
1. As **OWNER**, go to Settings
2. Set Task Visibility = "Assigned Only"
3. Save settings
4. Sign in as **User C** (STAFF)
5. Go to Tasks page
6. **Expected**: User C can ONLY see Task 2 (assigned to them)

#### Scenario C: "Assigned + Unassigned"
1. As **OWNER**, set Task Visibility = "Assigned + Unassigned"
2. Save settings
3. Sign in as **User C** (STAFF)
4. **Expected**: User C can see Task 2 (assigned to them) + Task 3 (unassigned)

### Test Case 2: Sales Visibility

#### Scenario A: "All Transactions"
1. As **OWNER**, create 2 sales:
   - Sale 1: Logged by OWNER
   - Sale 2: Logged by User C (sign in as them)
2. Set Sales Visibility = "All Transactions"
3. Sign in as **User C** (STAFF)
4. Go to Sales page
5. **Expected**: User C can see BOTH sales

#### Scenario B: "Own Only"
1. As **OWNER**, set Sales Visibility = "Own Only"
2. Sign in as **User C** (STAFF)
3. **Expected**: User C can ONLY see Sale 2 (that they logged)

#### Scenario C: "No Access"
1. As **OWNER**, set Sales Visibility = "No Access"
2. Sign in as **User C** (STAFF)
3. Try to navigate to Sales page
4. **Expected**: User C gets 403 error or "Access Denied" message

### Test Case 3: Revenue Visibility

1. As **OWNER**, go to Dashboard
2. Note the revenue stats displayed
3. Log several sales to generate revenue data
4. As **OWNER**, set Revenue Visibility = "Hide All"
5. Sign in as **User C** (STAFF)
6. Go to Dashboard
7. **Expected**: Revenue cards should be hidden or show "---"

### Test Case 4: Event Visibility

#### Scenario A: "All Events"
1. Create 2 events:
   - Event 1: Status = DRAFT
   - Event 2: Status = PUBLISHED
2. Set Event Visibility = "All Events"
3. Sign in as **User C** (STAFF)
4. Go to Events page
5. **Expected**: User C can see BOTH events

#### Scenario B: "Published Only"
1. As **OWNER**, set Event Visibility = "Published Only"
2. Sign in as **User C** (STAFF)
3. **Expected**: User C can ONLY see Event 2 (published)

---

## Part 3: Role-Based Permissions Testing 👥

### OWNER Permissions
✅ Test that OWNER can:
- [ ] Create/edit/delete events
- [ ] Invite staff
- [ ] Assign roles
- [ ] Create tasks
- [ ] Assign tasks to anyone
- [ ] View all sales data
- [ ] Access settings page
- [ ] Change venue settings
- [ ] View ALL data regardless of privacy settings

### MANAGER Permissions
✅ Test that MANAGER can:
- [ ] Create/edit/delete events
- [ ] Invite staff
- [ ] Create tasks
- [ ] Assign tasks
- [ ] View all sales data
- [ ] View ALL data regardless of privacy settings
- [ ] **CANNOT** access settings page

### STAFF Permissions
✅ Test that STAFF can:
- [ ] View events (based on privacy settings)
- [ ] Log sales
- [ ] View their assigned tasks
- [ ] Update their own task status
- [ ] View sales data (based on privacy settings)
- [ ] **CANNOT** create events
- [ ] **CANNOT** invite staff
- [ ] **CANNOT** create tasks
- [ ] **CANNOT** access settings
- [ ] Respects ALL privacy settings

---

## Part 4: User Experience Testing 💫

### Loading States
Check that buttons/forms show loading state:
- [ ] Staff invite form shows "Inviting..." during submission
- [ ] Event creation shows loading
- [ ] Task creation shows loading
- [ ] Settings save shows "Saving..."
- [ ] Login button shows loading

### Error Messages
Trigger errors and verify messages are user-friendly:
- [ ] Try inviting staff with invalid email
- [ ] Try creating event with past date
- [ ] Try accessing unauthorized page
- [ ] Disconnect internet and try saving

### Success Messages
Verify success feedback:
- [ ] Staff invite shows "Successfully invited"
- [ ] Event created shows success
- [ ] Settings saved shows confirmation
- [ ] Task completed shows success

### Empty States
Check pages with no data:
- [ ] Events page with no events
- [ ] Tasks page with no tasks
- [ ] Sales page with no transactions
- [ ] Staff page with just owner

---

## Part 5: Edge Cases & Bug Hunting 🐛

### Test Invalid Data
- [ ] Create task with no title
- [ ] Create event with end time before start time
- [ ] Invite staff with duplicate email
- [ ] Set Discord webhook to invalid URL

### Test Boundary Conditions
- [ ] Create very long task title (200 chars)
- [ ] Create very long venue name
- [ ] Upload very large logo image (if implemented)
- [ ] Create 100+ tasks (pagination)

### Test Navigation
- [ ] Back button works correctly
- [ ] Refresh page maintains state
- [ ] Breadcrumbs navigate correctly
- [ ] Deep links work (copy/paste URL)

---

## Part 6: Cross-Browser Testing 🌐

Test in all browsers:
- [ ] Chrome (Windows/Mac)
- [ ] Firefox
- [ ] Safari (Mac/iOS)
- [ ] Edge
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

---

## 📋 Testing Results Template

```markdown
## Test Session: [Date]
**Tester**: [Your Name]
**Environment**: [Local/Production]

### Tests Passed: __ / __
### Tests Failed: __ / __

### Bugs Found:
1. [Bug description]
   - **Severity**: High/Medium/Low
   - **Steps to Reproduce**: ...
   - **Expected**: ...
   - **Actual**: ...

2. [Next bug...]

### Notes:
- [Any observations or suggestions]
```

---

## 🎯 Priority Testing Order

1. **Discord Webhooks** (Most important new feature)
2. **Privacy Settings** (Core security feature)
3. **Role Permissions** (Critical for multi-user)
4. **Loading States** (UX quality)
5. **Edge Cases** (Nice to have)

---

Good luck testing! 🚀
