# Vercel Environment Variables - Exact Steps

## Where You Are Right Now
You're in Vercel, importing your project from GitHub, and you see a screen that says **"Configure Project"** or **"Environment Variables"**.

---

## EXACT Steps to Add Environment Variables

### Step 1: Find the Environment Variables Section

When importing your project in Vercel, you'll see:
- Project Name field (at the top)
- Framework Preset: **Next.js** (auto-detected)
- Root Directory: **./** (leave as default)
- **Environment Variables section** ← This is where you need to add them

### Step 2: Add Each Variable One by One

You'll see **three fields** for each environment variable:
1. **Key** (or "Name") - The variable name
2. **Value** - The actual value
3. **Environments** - Checkboxes for Production, Preview, Development

---

## All 6 Environment Variables to Add

Copy and paste these EXACTLY as shown:

### Variable 1: DATABASE_URL
```
Key: DATABASE_URL
Value: postgresql://postgres.xafdagmxihvcvqvycsor:M1e1AW2NLo4ajI8O@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
Environments: ✅ Production, ✅ Preview, ✅ Development (check all three)
```

Click **"Add"** or press Enter

---

### Variable 2: DIRECT_URL
```
Key: DIRECT_URL
Value: postgresql://postgres.xafdagmxihvcvqvycsor:M1e1AW2NLo4ajI8O@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
Environments: ✅ Production, ✅ Preview, ✅ Development (check all three)
```

Click **"Add"** or press Enter

---

### Variable 3: NEXTAUTH_SECRET
```
Key: NEXTAUTH_SECRET
Value: [PASTE YOUR GENERATED SECRET HERE]
Environments: ✅ Production, ✅ Preview, ✅ Development (check all three)
```

**Example**: If your secret is `abc123XYZ==`, paste exactly that

Click **"Add"** or press Enter

---

### Variable 4: NEXTAUTH_URL
```
Key: NEXTAUTH_URL
Value: https://xivvenuemanager.com
Environments: ✅ Production only (uncheck Preview and Development)
```

**IMPORTANT**:
- Use `https://` (not http)
- Use your actual domain `xivvenuemanager.com`
- Only check "Production" for this one

Click **"Add"** or press Enter

---

### Variable 5: DISCORD_CLIENT_ID
```
Key: DISCORD_CLIENT_ID
Value: 1442821194263957616
Environments: ✅ Production, ✅ Preview, ✅ Development (check all three)
```

Click **"Add"** or press Enter

---

### Variable 6: DISCORD_CLIENT_SECRET
```
Key: DISCORD_CLIENT_SECRET
Value: yJkOQj-MTQV3cZEtaIItlBs6iP6vIyWR
Environments: ✅ Production, ✅ Preview, ✅ Development (check all three)
```

Click **"Add"** or press Enter

---

## After Adding All 6 Variables

You should see a list showing:
1. DATABASE_URL
2. DIRECT_URL
3. NEXTAUTH_SECRET
4. NEXTAUTH_URL
5. DISCORD_CLIENT_ID
6. DISCORD_CLIENT_SECRET

**Now click the "Deploy" button at the bottom**

---

## What If You Already Deployed Without Environment Variables?

If you already clicked Deploy and forgot to add environment variables:

### Option A: Add Variables and Redeploy (Easiest)

1. Go to your Vercel project dashboard
2. Click **"Settings"** (top menu)
3. Click **"Environment Variables"** (left sidebar)
4. Add each variable using the same format above:
   - Key field
   - Value field
   - Select environments (Production, Preview, Development)
   - Click "Save"
5. After adding all 6, go to **"Deployments"** tab
6. Click **"Redeploy"** button on the latest deployment
7. Check **"Use existing Build Cache"** (faster)
8. Click **"Redeploy"**

### Option B: Start Over (If Easier)

1. Delete the project in Vercel
2. Import again from GitHub
3. Add all 6 environment variables before deploying

---

## Screenshot Reference (What You Should See)

### Environment Variables Input Screen
```
┌─────────────────────────────────────────────────────────────┐
│ Environment Variables (Optional)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Key                                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ DATABASE_URL                                            │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Value                                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ postgresql://postgres.xafdagmxihvcvqvycsor:...          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Environments                                                │
│ ☑ Production  ☑ Preview  ☑ Development                    │
│                                                             │
│                                    [Add] or press Enter    │
└─────────────────────────────────────────────────────────────┘

Added Environment Variables:
✓ DATABASE_URL
✓ DIRECT_URL
✓ NEXTAUTH_SECRET
✓ NEXTAUTH_URL
✓ DISCORD_CLIENT_ID
✓ DISCORD_CLIENT_SECRET

                    [Deploy]
```

---

## Common Mistakes to Avoid

❌ **Don't** add quotes around values
- Wrong: `"https://xivvenuemanager.com"`
- Right: `https://xivvenuemanager.com`

❌ **Don't** add spaces before or after values
- Wrong: ` https://xivvenuemanager.com `
- Right: `https://xivvenuemanager.com`

❌ **Don't** use `http://` for NEXTAUTH_URL
- Wrong: `http://xivvenuemanager.com`
- Right: `https://xivvenuemanager.com`

❌ **Don't** forget to check the environment boxes
- All variables need at least "Production" checked
- Most should have all three checked

---

## Verification Checklist

Before clicking Deploy:
- [ ] All 6 variables added
- [ ] NEXTAUTH_SECRET is your generated secret (not the example one)
- [ ] NEXTAUTH_URL uses `https://xivvenuemanager.com`
- [ ] DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET match your Discord app
- [ ] DATABASE_URL and DIRECT_URL are identical
- [ ] All environment checkboxes are correct

---

## Need Help?

If you're stuck, tell me:
1. Which screen are you on in Vercel?
2. What error message do you see (if any)?
3. How many environment variables did you add?

I can guide you through the exact screen you're seeing!
