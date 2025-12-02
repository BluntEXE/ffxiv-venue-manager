# Quick Cron Job Test

## Test the endpoints are working

### 1. Start your dev server
```bash
npm run dev
```

### 2. Test Event Reminders Endpoint

**In your browser, navigate to:**
```
http://localhost:3000/api/cron/event-reminders
```

**Expected result:**
- Status: 200 OK
- JSON response showing:
  ```json
  {
    "success": true,
    "timestamp": "...",
    "eventsChecked": 0,
    "notifications": []
  }
  ```
- `eventsChecked: 0` is normal if you don't have events starting soon

### 3. Test Daily Sales Summary Endpoint

**In your browser, navigate to:**
```
http://localhost:3000/api/cron/daily-sales-summary
```

**Expected result:**
- Status: 200 OK
- JSON response showing:
  ```json
  {
    "success": true,
    "timestamp": "...",
    "dateRange": { ... },
    "venuesProcessed": 1,
    "summaries": [...]
  }
  ```

---

## Test with Real Data

### Test Event Reminders

1. **Create a test event:**
   - Go to your venue dashboard
   - Create new event
   - **Set start time = current time + 30 minutes**
   - Status = PUBLISHED
   - Save event

2. **Enable webhook:**
   - Go to Settings
   - Add Discord webhook URL
   - Enable "Event Starting Soon" checkbox
   - Save settings

3. **Trigger the cron job:**
   - Visit: `http://localhost:3000/api/cron/event-reminders`
   - Check response shows `eventsChecked: 1`
   - **Check Discord for the notification!**

### Test Daily Sales Summary

1. **Create test sales:**
   - Log 3-5 sales transactions
   - Use different services
   - Note: These should be from "yesterday" to show up in summary

2. **Enable webhook:**
   - Go to Settings
   - Ensure Discord webhook URL is set
   - Enable "Daily Sales Summary" checkbox
   - Save settings

3. **Trigger the cron job:**
   - Visit: `http://localhost:3000/api/cron/daily-sales-summary`
   - Check response shows your venue in `summaries`
   - **Check Discord for the summary!**

---

## If Something Goes Wrong

**No Discord notification received:**
- Check webhook URL is correct
- Check notification toggle is enabled
- Check browser console for errors
- Check dev server terminal for logs

**500 Error:**
- Check database connection
- Check dev server terminal for error details
- Verify Prisma client is working

**401 Unauthorized:**
- Remove CRON_SECRET from .env for local testing
- Or add Authorization header with the secret

---

## Next Steps

Once both endpoints are working locally:
✅ Ready to deploy to production!
✅ Vercel will automatically run these on schedule
✅ Or configure external cron service

---

Quick test complete! 🎉
