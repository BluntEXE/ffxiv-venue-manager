# Deployment Guide - Making Your App Live

## Overview

We'll use **Vercel** (free tier) to deploy your Next.js app. Vercel is made by the creators of Next.js and offers:
- ✅ Free hosting for hobby projects
- ✅ Automatic HTTPS/SSL
- ✅ Easy custom domain setup
- ✅ Automatic deployments from Git
- ✅ Environment variable management
- ✅ Global CDN

---

## Step 1: Prepare Your Project for Deployment

### 1.1 Create a GitHub Repository

```bash
# Initialize git (if not already done)
cd "F:\Claude\Project Ideas\venue-manager-web"
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: FFXIV Venue Manager"

# Create a new repository on GitHub
# Then connect it:
git remote add origin https://github.com/YOUR_USERNAME/ffxiv-venue-manager.git
git branch -M main
git push -u origin main
```

### 1.2 Update `.gitignore`

Make sure these are in your `.gitignore` (already configured):
```
.env*
.env.local
.env.production
node_modules/
.next/
```

**IMPORTANT**: Never commit your `.env.local` file with secrets!

---

## Step 2: Deploy to Vercel

### 2.1 Sign Up for Vercel

1. Go to https://vercel.com
2. Click "Sign Up"
3. Choose "Continue with GitHub"
4. Authorize Vercel to access your repositories

### 2.2 Import Your Project

1. Click "Add New..." → "Project"
2. Find your `ffxiv-venue-manager` repository
3. Click "Import"
4. Vercel will detect Next.js automatically

### 2.3 Configure Environment Variables

**CRITICAL**: Add these environment variables in Vercel:

Click "Environment Variables" and add:

```env
# Database (use the same from your .env.local)
DATABASE_URL="postgresql://postgres.xafdagmxihvcvqvycsor:M1e1AW2NLo4ajI8O@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"

DIRECT_URL="postgresql://postgres.xafdagmxihvcvqvycsor:M1e1AW2NLo4ajI8O@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"

# NextAuth (IMPORTANT: Generate a NEW secret for production!)
NEXTAUTH_SECRET="GENERATE_NEW_SECRET_FOR_PRODUCTION"
NEXTAUTH_URL="https://your-app-name.vercel.app"

# Discord OAuth (use same credentials)
DISCORD_CLIENT_ID="1442821194263957616"
DISCORD_CLIENT_SECRET="yJkOQj-MTQV3cZEtaIItlBs6iP6vIyWR"
```

**Generate a new NEXTAUTH_SECRET**:
```bash
# On Windows PowerShell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2.4 Deploy

1. Click "Deploy"
2. Wait 2-3 minutes for build to complete
3. Your app will be live at: `https://your-app-name.vercel.app`

---

## Step 3: Update Discord OAuth

### 3.1 Add Production Redirect URL

1. Go to https://discord.com/developers/applications
2. Select your application
3. Go to "OAuth2" → "Redirects"
4. Add your production URL:
   ```
   https://your-app-name.vercel.app/api/auth/callback/discord
   ```
5. Click "Save Changes"

Now you have TWO redirect URLs:
- `http://localhost:3000/api/auth/callback/discord` (development)
- `https://your-app-name.vercel.app/api/auth/callback/discord` (production)

---

## Step 4: Add Your Custom Domain

### Option A: Buy a Domain (Recommended Services)

**Where to Buy**:
- **Namecheap**: ~$10-15/year (.com domains)
- **Cloudflare**: ~$10/year (at-cost pricing)
- **Porkbun**: ~$8-12/year (good prices)
- **Google Domains**: ~$12/year (now Squarespace)

**Domain Suggestions**:
- `ffxiv-venues.com`
- `eorzean-venues.com`
- `venue-manager.gg`
- `your-name-venues.com`

### Option B: Use a Free Subdomain

While learning, you can use:
- `your-app.vercel.app` (free, provided by Vercel)
- Later upgrade to custom domain

---

## Step 5: Connect Custom Domain to Vercel

### 5.1 In Vercel Dashboard

1. Go to your project settings
2. Click "Domains"
3. Enter your domain: `yourdomain.com`
4. Click "Add"

### 5.2 Configure DNS Records

Vercel will show you DNS records to add. Go to your domain registrar (Namecheap, Cloudflare, etc.):

**Type A Record**:
```
Type: A
Name: @ (or leave blank for root domain)
Value: 76.76.21.21
TTL: Auto or 300
```

**Type A Record (www subdomain)**:
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: Auto or 300
```

### 5.3 Wait for DNS Propagation

- DNS changes take 5 minutes to 48 hours
- Usually works in 10-30 minutes
- Check status at: https://dnschecker.org

### 5.4 Enable HTTPS

Vercel automatically provisions SSL certificate:
- Usually takes 5-10 minutes after DNS is configured
- Your site will be available at:
  - `https://yourdomain.com`
  - `https://www.yourdomain.com`

---

## Step 6: Update Discord OAuth (Again)

Add your custom domain redirect:

1. Discord Developer Portal → OAuth2 → Redirects
2. Add: `https://yourdomain.com/api/auth/callback/discord`
3. Add: `https://www.yourdomain.com/api/auth/callback/discord`
4. Save

Update Vercel environment variable:
```env
NEXTAUTH_URL="https://yourdomain.com"
```

Redeploy your app (Vercel will auto-deploy when you change env vars, or click "Redeploy" manually).

---

## Deployment Workflow (After Initial Setup)

### Local Development
```bash
# Make changes locally
npm run dev

# Test thoroughly
# Commit changes
git add .
git commit -m "Description of changes"
git push
```

### Automatic Deployment
- Vercel watches your `main` branch
- Every push triggers automatic deployment
- Takes 2-3 minutes to deploy
- You get a notification when done

### Preview Deployments
- Every pull request gets a preview URL
- Test changes before merging
- Share preview with others

---

## Cost Breakdown

### Free Tier (Perfect for Starting)
- **Vercel**: $0/month
  - Unlimited deployments
  - 100 GB bandwidth
  - Automatic HTTPS
  - Good for <1,000 users

- **Supabase**: $0/month
  - 500 MB database
  - 1 GB data transfer
  - Auto-pauses after inactivity
  - Good for 10-20 venues

**Total**: $0/month + ~$10/year for domain

### When You Grow (20+ Active Venues)
- **Vercel Pro**: $20/month (more bandwidth)
- **Supabase Pro**: $25/month (no auto-pause, backups)
- **Domain**: ~$10/year

**Total**: ~$45/month + domain

---

## Security Checklist Before Going Live

- [x] `.env.local` is in `.gitignore`
- [x] New `NEXTAUTH_SECRET` generated for production
- [x] Discord OAuth redirects include production URL
- [x] Database credentials are secure
- [x] Supabase project has Row Level Security (optional but recommended)
- [ ] Consider enabling network restrictions on Supabase
- [ ] Set up monitoring (Vercel Analytics)

---

## Monitoring & Analytics (Optional)

### Vercel Analytics (Free)
```bash
npm install @vercel/analytics
```

Add to `app/layout.tsx`:
```tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### Error Tracking (Optional)
- **Sentry**: Free tier available
- **LogRocket**: Session replay
- **Vercel Logs**: Built-in error logs

---

## Testing Your Production Deployment

1. ✅ Visit your production URL
2. ✅ Sign in with Discord
3. ✅ Create a test venue
4. ✅ Create a test event
5. ✅ Check all pages load correctly
6. ✅ Test on mobile device
7. ✅ Check HTTPS is working (🔒 in browser)
8. ✅ Test with different browsers

---

## Troubleshooting

### "Application Error" on Vercel
- Check Vercel deployment logs
- Verify environment variables are set
- Ensure database is accessible from Vercel

### Discord OAuth Not Working
- Verify redirect URLs in Discord Developer Portal
- Check `NEXTAUTH_URL` matches your domain
- Clear browser cookies and try again

### Database Connection Error
- Check Supabase is allowing connections
- Verify `DATABASE_URL` is correct
- Check Supabase project isn't paused

### Custom Domain Not Working
- Check DNS records are correct
- Wait for DNS propagation (up to 48 hours)
- Use `dig yourdomain.com` to check DNS

### "CORS Error" or "Blocked"
- Ensure `NEXTAUTH_URL` is set correctly
- Check browser console for specific error
- Verify all URLs use HTTPS

---

## Rollback Plan

If something goes wrong:

1. **Instant Rollback in Vercel**:
   - Go to Deployments tab
   - Find previous working deployment
   - Click "..." → "Promote to Production"

2. **Revert Git Commit**:
   ```bash
   git revert HEAD
   git push
   ```

---

## Production Environment Variables Summary

```env
# Production .env (set in Vercel dashboard, NOT in code)

# Database
DATABASE_URL="your-supabase-connection-string"
DIRECT_URL="your-supabase-connection-string"

# NextAuth (NEW secret for production!)
NEXTAUTH_SECRET="NEW_RANDOM_SECRET_HERE"
NEXTAUTH_URL="https://yourdomain.com"

# Discord OAuth (same as development)
DISCORD_CLIENT_ID="your-client-id"
DISCORD_CLIENT_SECRET="your-client-secret"
```

---

## When to Deploy?

**Now**: You can deploy right now! Your app is production-ready.

**Later**: Wait until you've built more features (Staff, Tasks, etc.)

**Recommendation**: Deploy to Vercel now (free) without a custom domain, just to test. Add domain later when you're ready to share publicly.

---

## Quick Deploy Checklist

- [ ] Push code to GitHub
- [ ] Sign up for Vercel
- [ ] Import project from GitHub
- [ ] Add environment variables in Vercel
- [ ] Generate new NEXTAUTH_SECRET for production
- [ ] Deploy
- [ ] Update Discord OAuth redirects
- [ ] Test production site
- [ ] (Optional) Buy and connect custom domain
- [ ] (Optional) Update NEXTAUTH_URL to custom domain

---

## Step 7: Set Up Free Cron Jobs (for Discord Webhooks)

**Important**: Vercel Free doesn't support cron jobs, but we can use **cron-job.org** (free forever!) for the 2 automated Discord webhooks.

### 7.1 What Needs Cron Jobs?

**5 webhooks work instantly** (no cron needed):
- ✅ Task Created
- ✅ Task Completed
- ✅ Event Created
- ✅ Sale Logged
- ✅ Staff Joined

**2 webhooks need cron jobs**:
- ⏰ Event Starting Soon (1-hour reminders)
- 📊 Daily Sales Summary (midnight reports)

### 7.2 Sign Up for cron-job.org

1. Go to https://cron-job.org
2. Click "Sign Up" (free forever)
3. Verify your email
4. Sign in

### 7.3 Create Cron Job #1: Event Reminders

1. Click "Create Cron Job"
2. **Title**: `Venue Manager - Event Reminders`
3. **URL**: `https://your-app-name.vercel.app/api/cron/event-reminders`
4. **Enabled**: ✅ (checked)
5. **Schedule**:
   - Click "Advanced"
   - Pattern: `*/15 * * * *` (every 15 minutes)
6. **Request Method**: GET
7. **(Optional) Add Security**:
   - Expand "Headers"
   - Click "Add Header"
   - Key: `Authorization`
   - Value: `Bearer your-cron-secret` (use same as CRON_SECRET in Vercel)
8. Click "Create"

### 7.4 Create Cron Job #2: Daily Sales Summary

1. Click "Create Cron Job"
2. **Title**: `Venue Manager - Daily Sales Summary`
3. **URL**: `https://your-app-name.vercel.app/api/cron/daily-sales-summary`
4. **Enabled**: ✅ (checked)
5. **Schedule**:
   - Click "Advanced"
   - Pattern: `0 0 * * *` (daily at midnight UTC)
6. **Request Method**: GET
7. **(Optional) Add Security**:
   - Expand "Headers"
   - Click "Add Header"
   - Key: `Authorization`
   - Value: `Bearer your-cron-secret`
8. Click "Create"

### 7.5 Test the Cron Jobs

1. In cron-job.org dashboard, click "Run Now" on each job
2. Check "Execution History" for green checkmark (success)
3. If you have Discord webhooks configured, check Discord for notifications
4. Check response shows `"success": true`

### 7.6 Monitor Cron Jobs

- View execution history: https://console.cron-job.org
- Check for failures (red X)
- Get email alerts if jobs fail (enable in settings)

---

**Estimated Time**: 30-60 minutes for first deployment + 10 minutes for cron setup
**Cost**: $0 (or $10/year if you buy a domain)

### Cost Summary
- **Vercel Free**: $0/month
- **Supabase Free**: $0/month
- **cron-job.org Free**: $0/month
- **Discord OAuth**: $0/month
- **Total**: **$0/month** 🎉

### When to Upgrade?
- **Vercel Pro** ($20/month): If you get 1,000+ monthly users or want native cron jobs
- **Supabase Pro** ($25/month): If database exceeds 500 MB or you need backups
- Keep using free tier until you actually need more!

---

*For detailed Next.js deployment docs, see: https://nextjs.org/docs/deployment*
*For detailed cron job docs, see: `CRON_JOBS.md` in project root*
