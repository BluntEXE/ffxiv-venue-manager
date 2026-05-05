# CRITICAL: Database Credential Rotation Guide

## ⚠️ URGENT ACTION REQUIRED

Your Supabase database credentials are currently exposed in:
1. `.env` file (plaintext password)
2. Git history (if committed)
3. Any documentation or logs that reference them

**Database Details Exposed:**
- Host: `aws-1-eu-central-1.pooler.supabase.com`
- Port: 6543 (pooler), 5432 (direct)
- Username: `postgres.xafdagmxihvcvqvycsor`
- Password: `M1e1AW2NLo4ajI8O` ⚠️ **EXPOSED**

## 🚨 Immediate Steps (Do This NOW)

### Step 1: Reset Supabase Database Password

1. **Go to Supabase Dashboard**:
   - Visit: https://supabase.com/dashboard
   - Log in to your account
   - Select your project

2. **Navigate to Database Settings**:
   - Click **Settings** (gear icon) in left sidebar
   - Click **Database** under settings

3. **Reset Database Password**:
   - Scroll to **Connection Pooling** section
   - Click **"Reset database password"** button
   - Copy the NEW password (you won't see it again!)
   - Keep it in a secure location (password manager)

4. **Update Connection Strings**:
   - After resetting, Supabase will show new connection strings
   - Copy both:
     - **Transaction pooler** (port 6543) - for DATABASE_URL
     - **Direct connection** (port 5432) - for DIRECT_URL

### Step 2: Update Local .env File

Replace your current credentials in `.env`:

```bash
# OLD (COMPROMISED):
DATABASE_URL="postgresql://postgres.xafdagmxihvcvqvycsor:M1e1AW2NLo4ajI8O@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# NEW (use your new password from Supabase):
DATABASE_URL="postgresql://postgres.xafdagmxihvcvqvycsor:NEW_PASSWORD_HERE@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
```

### Step 3: Update Production Environment Variables

If your application is deployed, update environment variables on your hosting platform:

**For Vercel:**
```bash
# Via CLI
vercel env rm DATABASE_URL production
vercel env add DATABASE_URL production
# Paste new value when prompted

vercel env rm DIRECT_URL production
vercel env add DIRECT_URL production
# Paste new value when prompted
```

**Or via Vercel Dashboard:**
1. Go to your project on vercel.com
2. Click **Settings** → **Environment Variables**
3. Delete old `DATABASE_URL` and `DIRECT_URL`
4. Add new ones with updated credentials
5. Redeploy your application

**For Other Platforms:**
- **Netlify**: Site settings → Environment variables
- **Railway**: Project settings → Variables
- **Heroku**: Settings → Config Vars

### Step 4: Clean Git History (If Credentials Were Committed)

⚠️ **IMPORTANT**: If you committed the `.env` file to git, the credentials are in your git history.

**Option A: Remove from Recent Commits (If Not Pushed)**
```bash
# If you haven't pushed yet
git reset --soft HEAD~1
git restore --staged .env
```

**Option B: Remove from Git History (If Already Pushed)**
```bash
# WARNING: This rewrites history and affects all collaborators

# Remove .env from all commits
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (coordinate with team first!)
git push origin --force --all
```

**Option C: Treat Repository as Compromised (Safest)**
1. Rotate ALL credentials
2. Consider creating a new repository
3. Copy code (excluding .env) to new repo
4. Never commit .env again

### Step 5: Verify .gitignore

Ensure `.env` is properly ignored:

```bash
# Check if .env is in .gitignore
grep -E "^\.env$" .gitignore

# If not found, add it
echo ".env" >> .gitignore
```

### Step 6: Test New Credentials

```bash
# Test database connection
npx prisma db pull

# If successful, test the application
npm run dev
```

## 🔒 Preventing Future Exposure

### 1. Never Commit Secrets

**Always use:**
- `.env` for local development (gitignored)
- `.env.example` for templates (committed, no real values)
- Environment variables in production (hosting platform)

### 2. Use Secret Management Tools

**Recommended Services:**
- **Doppler** - Free tier, easy integration
- **1Password** - For team secret sharing
- **AWS Secrets Manager** - For AWS deployments
- **HashiCorp Vault** - For enterprise

### 3. Rotate Credentials Regularly

**Best Practice Schedule:**
- Every 90 days: Rotate database passwords
- Every 30 days: Rotate API keys
- Immediately: If exposure suspected

### 4. Use Read-Only Credentials Where Possible

Create separate database users with limited permissions:

```sql
-- Create read-only user for analytics
CREATE USER analytics_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE postgres TO analytics_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_user;
```

### 5. Monitor Access

**In Supabase Dashboard:**
- Check **Database** → **Query Performance**
- Review connection logs for suspicious activity
- Set up alerts for unusual patterns

## 📊 Credential Audit Checklist

After rotation, verify:

- [ ] New password generated in Supabase
- [ ] Local `.env` updated with new credentials
- [ ] Production environment variables updated
- [ ] Application redeployed (if needed)
- [ ] Database connection tested successfully
- [ ] `.env` is in `.gitignore`
- [ ] No secrets in git history
- [ ] Team members notified of rotation
- [ ] Old credentials confirmed as revoked
- [ ] Password stored in secure location (password manager)

## 🆘 If Database Was Compromised

If you suspect unauthorized access:

1. **Immediately Reset Password** (Step 1 above)

2. **Audit Database Activity**:
   ```sql
   -- Check for unusual queries (in Supabase SQL Editor)
   SELECT * FROM pg_stat_activity
   WHERE datname = 'postgres'
   ORDER BY query_start DESC
   LIMIT 100;
   ```

3. **Review Recent Changes**:
   ```sql
   -- Check for data modifications
   SELECT schemaname, tablename
   FROM pg_tables
   WHERE schemaname = 'public';

   -- Review table row counts
   SELECT
     relname AS table_name,
     n_live_tup AS row_count
   FROM pg_stat_user_tables
   ORDER BY n_live_tup DESC;
   ```

4. **Backup Your Data**:
   ```bash
   # Export database
   pg_dump -h aws-1-eu-central-1.pooler.supabase.com \
     -U postgres.xafdagmxihvcvqvycsor \
     -d postgres \
     -f backup_$(date +%Y%m%d).sql
   ```

5. **Contact Supabase Support**:
   - Email: support@supabase.io
   - Report suspected unauthorized access

## 🔐 Long-Term Security Improvements

### 1. Implement Connection Pooling Limits

In Supabase Dashboard → Database → Connection Pooling:
- Set **Pool size** appropriate for your usage
- Enable **Connection timeout**

### 2. Enable SSL/TLS Enforcement

In Supabase Dashboard → Settings → Database:
- Ensure **Enforce SSL** is enabled
- Use `?sslmode=require` in connection strings

### 3. Restrict Network Access

In Supabase Dashboard → Settings → Database:
- Add specific IP addresses to allowlist
- Remove `0.0.0.0/0` (allow all) if present

### 4. Set Up Supabase Vault (For Sensitive Data)

```sql
-- Store sensitive data in Supabase Vault
INSERT INTO vault.secrets (name, secret)
VALUES ('api_key', 'your-sensitive-value');

-- Access in queries
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'api_key';
```

### 5. Enable Database Audit Logging

Contact Supabase support for:
- Query audit logs
- Connection audit logs
- Failed authentication attempts

## 📝 Documentation Updates

After credential rotation:

1. Update `README.md` with secret management instructions
2. Update `.env.example` to ensure no real values
3. Document rotation procedure for team
4. Add credential rotation to onboarding checklist

## 🔗 Additional Resources

- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Git Secret Scanning with git-secrets](https://github.com/awslabs/git-secrets)
- [Doppler Secret Management](https://www.doppler.com/)

---

**Created**: November 27, 2024
**Status**: URGENT - ACTION REQUIRED
**Severity**: CRITICAL
