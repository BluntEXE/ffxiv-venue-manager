# Cron Jobs Documentation

This document explains the automated background jobs (cron jobs) for Discord webhook notifications.

---

## Overview

The application has **2 automated cron jobs** that send Discord notifications:

1. **Event Reminders** - Sends notifications 1 hour before events start
2. **Daily Sales Summary** - Sends end-of-day sales reports

---

## 1. Event Starting Soon Reminders ⏰

**Endpoint**: `/api/cron/event-reminders`
**Schedule**: Every 15 minutes (`*/15 * * * *`)
**Purpose**: Notifies venues about events starting in the next hour

### How It Works

1. Runs every 15 minutes
2. Queries for PUBLISHED events starting within the next hour
3. For each event:
   - Checks if venue has Discord webhook configured
   - Checks if "Event Starting Soon" notification is enabled
   - Sends Discord notification with event details

### Discord Message Format

```
⏰ Event Starting Soon!
──────────────────────
[Event Title] starts in less than 1 hour!

Start Time: [Date/Time]
```

### Testing Locally

**Option 1: Manual API Call**
```bash
# Using curl
curl http://localhost:3000/api/cron/event-reminders

# Using browser
# Navigate to: http://localhost:3000/api/cron/event-reminders
```

**Option 2: Create Test Event**
1. Create an event with start time = current time + 30 minutes
2. Enable "Event Starting Soon" notification in settings
3. Call the endpoint manually
4. Check Discord for notification

**Expected Response**:
```json
{
  "success": true,
  "timestamp": "2025-11-25T12:00:00.000Z",
  "eventsChecked": 1,
  "notifications": [
    {
      "success": true,
      "eventId": "...",
      "venueName": "Your Venue"
    }
  ]
}
```

---

## 2. Daily Sales Summary 📊

**Endpoint**: `/api/cron/daily-sales-summary`
**Schedule**: Daily at midnight UTC (`0 0 * * *`)
**Purpose**: Sends daily sales reports for the previous day

### How It Works

1. Runs once per day at midnight (UTC)
2. Calculates sales for the previous day (00:00 to 23:59)
3. For each venue with webhook enabled:
   - Counts total transactions
   - Sums total revenue
   - Finds top-selling service
   - Sends summary to Discord

### Discord Message Format

```
📊 Daily Sales Summary
──────────────────────
Sales report for Monday, November 25, 2025

Total Sales: 15 transactions
Total Revenue: 750,000 Gil
Top Service: Cocktails (8 sales)
```

### Testing Locally

**Option 1: Manual API Call**
```bash
# Using curl
curl http://localhost:3000/api/cron/daily-sales-summary

# Using browser
# Navigate to: http://localhost:3000/api/cron/daily-sales-summary
```

**Option 2: Create Test Data**
1. Log several sales transactions (with different dates if needed)
2. Enable "Daily Sales Summary" notification in settings
3. Call the endpoint manually
4. Check Discord for summary

**Expected Response**:
```json
{
  "success": true,
  "timestamp": "2025-11-26T00:00:00.000Z",
  "dateRange": {
    "from": "2025-11-25T00:00:00.000Z",
    "to": "2025-11-26T00:00:00.000Z"
  },
  "venuesProcessed": 1,
  "summaries": [
    {
      "success": true,
      "venueId": "...",
      "venueName": "Your Venue",
      "totalSales": 15,
      "totalRevenue": 750000
    }
  ]
}
```

---

## Deployment Configuration

### Vercel (Recommended)

The cron jobs are configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/event-reminders",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/daily-sales-summary",
      "schedule": "0 0 * * *"
    }
  ]
}
```

**On Vercel Pro Plan**:
- Cron jobs run automatically
- No additional setup needed
- View logs in Vercel dashboard

**On Vercel Hobby Plan**:
- Cron jobs are **NOT available**
- Use external cron service instead (see below)

### External Cron Services (Alternative)

If not using Vercel Pro, use an external service:

**Option 1: cron-job.org**
1. Sign up at https://cron-job.org
2. Create job for event reminders:
   - URL: `https://your-domain.com/api/cron/event-reminders`
   - Schedule: Every 15 minutes
   - Method: GET
3. Create job for daily summary:
   - URL: `https://your-domain.com/api/cron/daily-sales-summary`
   - Schedule: Daily at midnight
   - Method: GET

**Option 2: GitHub Actions**
Create `.github/workflows/cron-jobs.yml`:
```yaml
name: Cron Jobs

on:
  schedule:
    - cron: '*/15 * * * *'  # Event reminders
    - cron: '0 0 * * *'     # Daily summary

jobs:
  event-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Event Reminders
        run: curl -X GET https://your-domain.com/api/cron/event-reminders

  daily-summary:
    runs-on: ubuntu-latest
    if: github.event.schedule == '0 0 * * *'
    steps:
      - name: Trigger Daily Summary
        run: curl -X GET https://your-domain.com/api/cron/daily-sales-summary
```

---

## Security

### Cron Secret (Optional)

To prevent unauthorized access to cron endpoints, add a secret token:

1. **Add to Environment Variables**:
   ```env
   CRON_SECRET=your-random-secret-token-here
   ```

2. **Call with Authorization Header**:
   ```bash
   curl -H "Authorization: Bearer your-random-secret-token-here" \
     https://your-domain.com/api/cron/event-reminders
   ```

3. **Configure in External Services**:
   - Add custom header: `Authorization: Bearer your-secret`

### Without Cron Secret

If `CRON_SECRET` is not set, the endpoints are publicly accessible. This is fine for development but **NOT recommended for production**.

---

## Monitoring

### Check Cron Job Status

**View Logs**:
- Vercel: Dashboard → Your Project → Logs
- External services: Check service dashboard

**Successful Response Indicators**:
- Status code: 200
- Response includes: `"success": true`
- `notifications` array shows successful sends

**Common Issues**:
- `eventsChecked: 0` - No upcoming events found
- `success: false` - Webhook not configured or disabled
- 401 error - Cron secret mismatch
- 500 error - Database or network issue

---

## Cron Schedule Reference

| Expression | Description |
|-----------|-------------|
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` | Every hour at minute 0 |
| `0 0 * * *` | Daily at midnight UTC |
| `0 0 * * 0` | Weekly on Sunday at midnight |
| `0 9 * * 1-5` | Weekdays at 9:00 AM |

---

## Troubleshooting

### Event Reminders Not Sending

**Check:**
1. Is "Event Starting Soon" enabled in venue settings?
2. Does the venue have a Discord webhook URL configured?
3. Is there an event starting within the next hour?
4. Is the event status = PUBLISHED?

**Debugging**:
```bash
# Call endpoint and check response
curl http://localhost:3000/api/cron/event-reminders
```

### Daily Summary Not Sending

**Check:**
1. Is "Daily Sales Summary" enabled in venue settings?
2. Were there any sales yesterday?
3. Is the cron job scheduled correctly?

**Debugging**:
```bash
# Call endpoint and check response
curl http://localhost:3000/api/cron/daily-sales-summary
```

### Discord Rate Limits

If processing many venues:
- Discord webhooks are rate-limited to ~30 messages/minute
- The code includes 100ms delays between webhooks
- For 100+ venues, consider batching

---

## Future Enhancements

Potential cron job additions:
- Weekly performance reports
- Monthly revenue summaries
- Automated task reminders (overdue tasks)
- Event attendance reminders (1 day before)
- Staff performance metrics
- Automated backup reports

---

## Testing Checklist

Before deploying to production:

- [ ] Test event reminders endpoint manually
- [ ] Test daily summary endpoint manually
- [ ] Verify Discord messages display correctly
- [ ] Confirm cron schedule in vercel.json
- [ ] Set CRON_SECRET in production environment
- [ ] Test with CRON_SECRET authorization header
- [ ] Monitor first few automated runs in production
- [ ] Check Vercel logs for errors

---

Good luck! 🚀
