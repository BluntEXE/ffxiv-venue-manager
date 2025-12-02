# Quick Start Guide for XIV Venue Manager

Get your FFXIV venue up and running in minutes!

---

## For Venue Owners/Users

### Step 1: Sign In with Discord
1. Visit [xivvenuemanager.com](https://xivvenuemanager.com)
2. Click **"Sign In"** in the top-right corner
3. Authorize with your Discord account
4. You'll be redirected to your dashboard

### Step 2: Create Your First Venue
1. Click **"Create New Venue"** button
2. Fill in your venue details:
   - **Venue Name**: Your venue's name (e.g., "The Crystal Rose")
   - **Slug**: URL-friendly identifier (e.g., "crystal-rose")
   - **Data Center**: Select your DC (e.g., "Crystal")
   - **World**: Select your world (e.g., "Balmung")
   - **Location**: Optional (e.g., "Lavender Beds, Ward 12, Plot 42")
   - **Description**: Brief description of your venue
3. Click **"Create Venue"**

### Step 3: Invite Your Staff
1. Navigate to **Staff** in the sidebar
2. Click **"Invite Staff Member"**
3. Enter their Discord username
4. Select their role (Owner, Manager, or Staff)
5. Click **"Send Invitation"**
6. They'll receive an invite link via the app

### Step 4: Configure Settings
1. Go to **Settings** in the sidebar
2. **Set Visibility Permissions** for your staff:
   - Tasks: Who can see which tasks
   - Sales: Control access to transaction data
   - Revenue: Show/hide financial statistics
   - Events: Published only or include drafts
3. **Add Discord Webhooks** (optional):
   - **Staff Operations Channel**: Task and staff notifications
   - **Events Channel**: Event announcements and reminders
   - **Revenue Channel**: Sales logs and daily summaries
4. **Toggle Notifications**: Enable/disable specific notification types
5. Click **"Save Settings"**

### Step 5: Create Your First Event
1. Click **Events** in the sidebar
2. Click **"Create Event"**
3. Fill in event details:
   - **Title**: Event name
   - **Description**: What's happening
   - **Start Date/Time**: When it begins
   - **End Date/Time**: When it ends
   - **Status**: Draft or Published
   - **Recurring**: Optional (Daily, Weekly, Custom)
4. Click **"Create Event"**

---

## Common Tasks

### Adding a Task
1. Go to **Tasks** section
2. Click **"Create Task"**
3. Fill in:
   - Title
   - Description
   - Due date
   - Priority (Low/Medium/High)
   - Assignee (optional)
4. Click **"Create"**

### Logging a Sale
1. Go to **Sales** section
2. Click **"Log Sale"**
3. Enter:
   - Customer name
   - Service provided
   - Amount
   - Notes (optional)
4. Click **"Log Sale"**

### Adding a Service
1. Go to **Services** section
2. Click **"Add Service"**
3. Enter:
   - Service name
   - Description
   - Price
   - Duration (optional)
4. Click **"Add Service"**

---

## Pro Tips

### Discord Webhooks
- Create separate channels for different notification types
- Use the same webhook URL for all if you want everything in one place
- Disable notifications you don't need to reduce noise

### Staff Management
- Assign **Manager** role to trusted staff who help run the venue
- Use **Staff** role for general employees
- Configure visibility settings to control what staff can see

### Event Reminders
- Enable "Event Starting Soon" webhook for automatic reminders
- Events will notify at 24h, 1h, and "starting now"

### Mobile Access
- Use the floating action button (bottom-right) on venue pages
- All features work on mobile devices
- Sidebar includes quick access to everything

---

## Troubleshooting

### Can't see staff invitations
- Make sure the invited user has signed in at least once
- Check that you entered their Discord username correctly

### Discord webhooks not working
- Verify webhook URLs are correct (should start with `https://discord.com/api/webhooks/`)
- Make sure the Discord channel still exists
- Check that the webhook hasn't been deleted in Discord

### Rate limit errors
- Wait a few seconds before trying again
- The app limits requests to prevent abuse
- Contact support if you consistently hit limits

---

## Need Help?

- Use the **Feedback** button in the navbar to report issues
- Check the [full documentation](./README.md) for advanced features
- Visit our [GitHub repository](https://github.com/BluntEXE/ffxiv-venue-manager) for technical details

---

**Support the Project**: If you find XIV Venue Manager useful, consider [buying me a coffee](https://ko-fi.com/ehnocure) to help cover hosting costs and support continued development!

Happy venue managing! 🎉
