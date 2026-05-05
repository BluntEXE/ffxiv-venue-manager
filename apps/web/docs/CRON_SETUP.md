# Cron Job Setup Guide

This application uses **Upstash QStash** for scheduled tasks (cron jobs). QStash is a serverless message queue and scheduling service with a generous free tier.

## 📋 Prerequisites

- Upstash account (free tier available)
- Your application deployed and accessible via HTTPS
- CRON_SECRET already generated in your `.env` file

## 🚀 Quick Setup

### Step 1: Create Upstash QStash Account

1. Go to [Upstash Console](https://console.upstash.com/)
2. Sign up or log in (GitHub/Google sign-in available)
3. Navigate to **QStash** section in the sidebar

### Step 2: Get Your QStash Credentials

1. In the QStash dashboard, you'll see:
   - **QSTASH_URL**: `https://qstash.upstash.io`
   - **QSTASH_TOKEN**: Your API token (starts with `ey...`)
   - **QSTASH_CURRENT_SIGNING_KEY**: Your current signing key
   - **QSTASH_NEXT_SIGNING_KEY**: Your next signing key (for key rotation)

2. Copy these values to your `.env` file:

```bash
# Upstash QStash (for cron jobs)
QSTASH_URL="https://qstash.upstash.io"
QSTASH_TOKEN="ey..."
QSTASH_CURRENT_SIGNING_KEY="sig_..."
QSTASH_NEXT_SIGNING_KEY="sig_..."
```

### Step 3: Deploy Your Application

Make sure your application is deployed and accessible via HTTPS. The cron endpoints are:

- `https://your-domain.com/api/cron/daily-sales-summary`
- `https://your-domain.com/api/cron/event-reminders`

### Step 4: Create Scheduled Jobs in QStash

#### Option A: Using QStash Dashboard (Recommended for beginners)

1. In the QStash console, click **"Schedules"** in the sidebar
2. Click **"Create Schedule"**

**For Daily Sales Summary:**
- **Destination URL**: `https://your-domain.com/api/cron/daily-sales-summary`
- **Schedule (Cron)**: `0 0 * * *` (daily at midnight UTC)
- **Method**: GET
- **Headers**:
  - Key: `Authorization`
  - Value: `Bearer YOUR_CRON_SECRET` (copy from `.env`)
- Click **"Create"**

**For Event Reminders:**
- **Destination URL**: `https://your-domain.com/api/cron/event-reminders`
- **Schedule (Cron)**: `*/15 * * * *` (every 15 minutes)
- **Method**: GET
- **Headers**:
  - Key: `Authorization`
  - Value: `Bearer YOUR_CRON_SECRET`
- Click **"Create"**

#### Option B: Using QStash API (For automation)

You can also create schedules programmatically using the QStash API:

```bash
# Daily Sales Summary (runs at midnight UTC)
curl -X POST https://qstash.upstash.io/v2/schedules \
  -H "Authorization: Bearer YOUR_QSTASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "https://your-domain.com/api/cron/daily-sales-summary",
    "cron": "0 0 * * *",
    "headers": {
      "Authorization": "Bearer YOUR_CRON_SECRET"
    }
  }'

# Event Reminders (runs every 15 minutes)
curl -X POST https://qstash.upstash.io/v2/schedules \
  -H "Authorization: Bearer YOUR_QSTASH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "https://your-domain.com/api/cron/event-reminders",
    "cron": "*/15 * * * *",
    "headers": {
      "Authorization": "Bearer YOUR_CRON_SECRET"
    }
  }'
```

## 📅 Cron Schedule Format

QStash uses standard cron syntax:

```
*    *    *    *    *
┬    ┬    ┬    ┬    ┬
│    │    │    │    │
│    │    │    │    └─── Day of Week (0-6, Sunday=0)
│    │    │    └──────── Month (1-12)
│    │    └───────────── Day of Month (1-31)
│    └────────────────── Hour (0-23)
└─────────────────────── Minute (0-59)
```

**Examples:**
- `0 0 * * *` - Daily at midnight UTC
- `*/15 * * * *` - Every 15 minutes
- `0 9 * * 1` - Every Monday at 9 AM UTC
- `0 */6 * * *` - Every 6 hours

## 🔒 Security

### CRON_SECRET

The `CRON_SECRET` environment variable protects your cron endpoints from unauthorized access. This secret is:

1. Generated automatically (32-byte random string)
2. Required for all cron job requests
3. Sent as `Authorization: Bearer <CRON_SECRET>` header

**Never expose this secret publicly!**

## 📊 Cron Jobs Explained

### 1. Daily Sales Summary (`/api/cron/daily-sales-summary`)

**Purpose**: Sends a Discord notification to each active venue with yesterday's sales statistics.

**Schedule**: `0 0 * * *` (Daily at midnight UTC)

**What it does:**
- Finds all active venues
- Calculates yesterday's total sales and revenue
- Identifies top-selling service
- Sends formatted Discord webhook with summary

**Example Discord message:**
```
📊 Daily Sales Summary
Date: Monday, November 27, 2024

💰 Total Sales: 15
💵 Total Revenue: 2,450,000 gil
🏆 Top Service: VIP Experience (8 sales)
```

### 2. Event Reminders (`/api/cron/event-reminders`)

**Purpose**: Sends Discord notifications for events starting within the next hour.

**Schedule**: `*/15 * * * *` (Every 15 minutes)

**What it does:**
- Finds all published events starting in the next 60 minutes
- Sends reminder notifications via Discord webhook
- Prevents duplicate reminders

**Example Discord message:**
```
⏰ Event Starting Soon!
Event: Grand Opening Gala
Starts in: 45 minutes
```

## 🧪 Testing Your Cron Jobs

### Test Locally (Development)

You can test cron endpoints locally using curl:

```bash
# Test Daily Sales Summary
curl -X GET http://localhost:3000/api/cron/daily-sales-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Test Event Reminders
curl -X GET http://localhost:3000/api/cron/event-reminders \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Test in Production

QStash provides a "Test" button in the dashboard to manually trigger scheduled jobs.

1. Go to **Schedules** in QStash console
2. Find your schedule
3. Click **"Send Now"** or **"Test"**
4. Check your Discord channels for notifications
5. View logs in QStash for debugging

## 📈 Monitoring

### QStash Dashboard

The QStash dashboard provides:
- **Execution History**: See all job runs
- **Success/Failure Rates**: Monitor job health
- **Logs**: Debug failed executions
- **Retry Status**: Automatic retries for failed jobs

### Application Logs

Check your application logs for cron job execution:

```bash
# Vercel logs
vercel logs

# Or check your hosting platform's log viewer
```

Look for:
- `"Error in daily sales summary cron job:"` - Sales summary errors
- `"Error in event reminders cron job:"` - Event reminder errors

## ⚠️ Troubleshooting

### "Unauthorized" Error (401)

**Cause**: CRON_SECRET mismatch or missing Authorization header

**Fix**:
1. Verify `CRON_SECRET` in your `.env` matches the header in QStash schedule
2. Ensure header format is: `Bearer YOUR_CRON_SECRET` (with space)

### "Server misconfiguration" Error (500)

**Cause**: CRON_SECRET not set in environment variables

**Fix**:
1. Add `CRON_SECRET` to your environment variables in hosting platform
2. Redeploy application

### No Discord Notifications

**Possible causes:**
1. Discord webhook URL not configured in venue settings
2. Webhook notifications disabled for specific event types
3. Discord webhook URL is invalid

**Fix**:
1. Check venue settings in application
2. Test webhook URL with curl:
   ```bash
   curl -X POST https://discord.com/api/webhooks/YOUR_WEBHOOK \
     -H "Content-Type: application/json" \
     -d '{"content": "Test message"}'
   ```

### Jobs Not Running on Schedule

**Possible causes:**
1. QStash schedule not created or paused
2. Application URL incorrect or not accessible
3. Free tier limits exceeded (500 requests/day)

**Fix**:
1. Check schedule status in QStash dashboard
2. Verify application is accessible via HTTPS
3. Monitor QStash usage limits

## 💰 Free Tier Limits

Upstash QStash Free Tier includes:
- **500 requests per day**
- **Automatic retries** on failure
- **Message deduplication**
- **Request logs** (retained for 7 days)

With our setup:
- Daily Sales Summary: 1 request/day
- Event Reminders: 96 requests/day (every 15 min)
- **Total**: ~97 requests/day

**Well within free tier limits!** 🎉

## 🔄 Updating Schedules

To change cron schedules:

1. Go to QStash **Schedules**
2. Find the schedule to modify
3. Click **"Edit"** or **"Delete"**
4. Update the cron expression
5. Save changes

No code changes needed!

## 📚 Additional Resources

- [Upstash QStash Documentation](https://upstash.com/docs/qstash)
- [Cron Expression Generator](https://crontab.guru/)
- [Discord Webhook Documentation](https://discord.com/developers/docs/resources/webhook)

## 🆘 Support

If you encounter issues:
1. Check QStash logs in Upstash console
2. Check application logs in your hosting platform
3. Test endpoints manually with curl
4. Verify all environment variables are set correctly

---

**Last Updated**: November 27, 2024
