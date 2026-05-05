# Deploying XIVVenueManager.com - Step by Step

## What You Have
- ✅ Domain: XIVVenueManager.com (GoDaddy)
- ✅ Database: Supabase PostgreSQL (already configured)
- ✅ Discord OAuth: Already set up
- ✅ Code: Ready and backed up

## What You Need
- GitHub account (free)
- Vercel account (free)
- 30-60 minutes

---

## Step 1: Create GitHub Repository

### 1.1 Create Repository on GitHub
1. Go to https://github.com
2. Sign in (or create free account)
3. Click "+" → "New repository"
4. **Name**: `ffxiv-venue-manager` (or any name)
5. **Visibility**: Private (recommended) or Public
6. **DO NOT** initialize with README (your project already has files)
7. Click "Create repository"

### 1.2 Push Your Code to GitHub

GitHub will show you commands. Run these in PowerShell:

```powershell
cd "F:\Claude\Project Ideas\venue-manager-web"

# Connect to your new GitHub repository (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/ffxiv-venue-manager.git

# Push your code
git branch -M main
git push -u origin main
```

**Note**: If you have 2FA enabled on GitHub, you'll need a Personal Access Token instead of password. GitHub will guide you through this.

---

## Step 2: Deploy to Vercel

### 2.1 Sign Up for Vercel
1. Go to https://vercel.com
2. Click "Sign Up"
3. Choose "Continue with GitHub"
4. Authorize Vercel to access your GitHub

### 2.2 Import Your Project
1. In Vercel dashboard, click "Add New..." → "Project"
2. Find your `ffxiv-venue-manager` repository
3. Click "Import"
4. Vercel will auto-detect it's a Next.js app

### 2.3 Configure Environment Variables

**CRITICAL**: Click "Environment Variables" and add these EXACTLY:

```
DATABASE_URL
postgresql://postgres.xafdagmxihvcvqvycsor:M1e1AW2NLo4ajI8O@aws-1-eu-central-1.pooler.supabase.com:5432/postgres

DIRECT_URL
postgresql://postgres.xafdagmxihvcvqvycsor:M1e1AW2NLo4ajI8O@aws-1-eu-central-1.pooler.supabase.com:5432/postgres

NEXTAUTH_URL
https://xivvenuemanager.com

DISCORD_CLIENT_ID
1442821194263957616

DISCORD_CLIENT_SECRET
yJkOQj-MTQV3cZEtaIItlBs6iP6vIyWR
```

**Generate NEW NEXTAUTH_SECRET for production**:
```powershell
# Run this command to generate a secure secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output and add it as:
```
NEXTAUTH_SECRET
[paste the generated secret here]
```

### 2.4 Deploy
1. Click "Deploy"
2. Wait 2-3 minutes
3. You'll get a temporary URL like: `https://ffxiv-venue-manager-abc123.vercel.app`
4. **Don't visit it yet** - we need to connect your domain first

---

## Step 3: Connect XIVVenueManager.com to Vercel

### 3.1 In Vercel Dashboard
1. Go to your project
2. Click "Settings" → "Domains"
3. Enter: `xivvenuemanager.com` (lowercase, no www)
4. Click "Add"
5. Vercel will show DNS configuration instructions

### 3.2 Configure GoDaddy DNS

1. Log in to GoDaddy: https://dcc.godaddy.com
2. Go to "My Products" → Find your domain → Click "DNS"
3. **Delete existing A records** for `@` (if any)
4. **Add these new records**:

**Record 1 (Root domain)**:
```
Type: A
Name: @
Value: 76.76.21.21
TTL: 600 (default)
```

**Record 2 (www subdomain)**:
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: 1 Hour (default)
```

5. Click "Save"

### 3.3 Wait for DNS Propagation
- Usually takes 10-30 minutes
- Can take up to 48 hours (rare)
- Check status: https://dnschecker.org/?domain=xivvenuemanager.com

### 3.4 Verify in Vercel
- Go back to Vercel → Domains
- Wait for Vercel to verify DNS (green checkmark)
- Vercel will automatically provision SSL certificate
- Your site will be live at:
  - https://xivvenuemanager.com
  - https://www.xivvenuemanager.com

---

## Step 4: Update Discord OAuth

### 4.1 Add Production Redirect URLs
1. Go to https://discord.com/developers/applications
2. Select your application (ID: 1442821194263957616)
3. Go to "OAuth2" → "Redirects"
4. **Add these URLs** (keep the localhost one too):
   ```
   http://localhost:3000/api/auth/callback/discord
   https://xivvenuemanager.com/api/auth/callback/discord
   https://www.xivvenuemanager.com/api/auth/callback/discord
   ```
5. Click "Save Changes"

---

## Step 5: Run Database Migration

Your production database needs the temporary roles fields. Run this from your local machine:

```powershell
cd "F:\Claude\Project Ideas\venue-manager-web"
npx prisma migrate deploy
```

This will apply all migrations (including the temporary roles migration) to your production database.

---

## Step 6: Test Your Production Site

1. Visit https://xivvenuemanager.com
2. Click "Sign in with Discord"
3. Authorize the app
4. Create a test venue
5. Test all features:
   - ✅ Create events
   - ✅ Add staff
   - ✅ Create tasks
   - ✅ Log sales
   - ✅ Discord webhooks
   - ✅ Temporary roles

---

## Step 7: Set Up Automated Cron Jobs (Free)

**IMPORTANT**: Vercel's free plan only supports daily cron jobs, but we need 15-minute intervals for event reminders. That's why we use **cron-job.org** (free forever, no limitations) to handle both cron jobs externally.

Two webhooks need cron jobs:
- Event reminders (every 15 minutes)
- Daily sales summary (midnight UTC)

### 7.1 Sign Up for cron-job.org
1. Go to https://cron-job.org
2. Sign up (free forever, unlimited cron jobs)
3. Verify email

### 7.2 Create Event Reminders Cron
1. Click "Create Cron Job"
2. **Title**: Venue Manager - Event Reminders
3. **URL**: `https://xivvenuemanager.com/api/cron/event-reminders`
4. **Schedule**: `*/15 * * * *` (every 15 minutes)
5. **Method**: GET
6. Click "Create"

### 7.3 Create Daily Sales Summary Cron
1. Click "Create Cron Job"
2. **Title**: Venue Manager - Daily Sales Summary
3. **URL**: `https://xivvenuemanager.com/api/cron/daily-sales-summary`
4. **Schedule**: `0 0 * * *` (daily at midnight UTC)
5. **Method**: GET
6. Click "Create"

### 7.4 Test Cron Jobs
- Click "Run Now" on each job
- Check execution history for success (green checkmark)

---

## Cost Summary

- **Vercel Hosting**: $0/month (Hobby plan)
- **Supabase Database**: $0/month (500MB free)
- **Cron Jobs (cron-job.org)**: $0/month (free forever, unlimited)
- **Discord OAuth**: $0/month
- **Domain (GoDaddy)**: ~$20/year (already purchased)

**Total**: $0/month 🎉

### Why External Cron Jobs?
- ✅ Vercel Hobby plan only allows daily cron jobs
- ✅ cron-job.org is free forever with no limitations
- ✅ More reliable (dedicated cron service)
- ✅ Easy monitoring and execution history
- ✅ No need to upgrade to Vercel Pro ($20/month)

---

## Troubleshooting

### "Application Error" on Vercel
- Check Vercel deployment logs
- Verify all environment variables are set
- Check database connection

### Discord Login Not Working
- Verify redirect URLs in Discord Developer Portal
- Check `NEXTAUTH_URL` is set to `https://xivvenuemanager.com`
- Clear browser cache and cookies

### Domain Not Working
- Wait 10-30 minutes for DNS propagation
- Verify GoDaddy DNS records are correct
- Check https://dnschecker.org

### SSL Certificate Pending
- Vercel auto-provisions SSL after DNS is verified
- Usually takes 5-10 minutes
- Check Vercel dashboard for status

---

## Future Updates

After initial deployment, your workflow is:

1. Make changes locally
2. Test with `npm run dev`
3. Commit changes: `git add . && git commit -m "Description"`
4. Push to GitHub: `git push`
5. Vercel automatically deploys in 2-3 minutes

---

## Rollback Plan

If something goes wrong:

1. Go to Vercel → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

Or revert in git:
```powershell
git revert HEAD
git push
```

---

## Support

- Vercel Docs: https://vercel.com/docs
- Supabase Docs: https://supabase.com/docs
- Next.js Docs: https://nextjs.org/docs

---

**Estimated Time**: 30-60 minutes for first deployment

**Status After Completion**:
- ✅ Live at https://xivvenuemanager.com
- ✅ Automatic HTTPS
- ✅ Discord authentication working
- ✅ Database connected
- ✅ Automated webhooks running
- ✅ Zero monthly cost
