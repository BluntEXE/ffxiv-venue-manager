# Discord OAuth Setup Guide

To enable Discord authentication for your FFXIV Venue Manager, you need to create a Discord application and add the credentials to your environment variables.

## Step 1: Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** in the top right
3. Give it a name (e.g., "FFXIV Venue Manager")
4. Click **"Create"**

## Step 2: Configure OAuth2

1. In your application, go to the **"OAuth2"** section in the left sidebar
2. Under **"Redirects"**, click **"Add Redirect"**
3. Add the following redirect URL:
   ```
   http://localhost:3000/api/auth/callback/discord
   ```
4. Click **"Save Changes"**

## Step 3: Get Your Credentials

1. Still in the **"OAuth2"** section, look for:
   - **CLIENT ID**: Copy this value
   - **CLIENT SECRET**: Click **"Reset Secret"** if needed, then copy the value

## Step 4: Add to Environment Variables

1. Open `.env.local` in your project root
2. Replace the placeholder values:

```env
DISCORD_CLIENT_ID="paste-your-client-id-here"
DISCORD_CLIENT_SECRET="paste-your-client-secret-here"
```

3. Save the file
4. Restart your development server

## Step 5: Test Authentication

1. Make sure your dev server is running: `npm run dev`
2. Go to http://localhost:3000
3. Click **"Go to Dashboard"** (you'll be redirected to sign in)
4. Click **"Sign in with Discord"**
5. Authorize the application
6. You should be redirected back to your dashboard!

## Production Setup

When deploying to production, you'll need to:

1. Add your production URL as a redirect URI in Discord:
   ```
   https://yourdomain.com/api/auth/callback/discord
   ```

2. Update your environment variables on your hosting platform (Vercel, etc.):
   ```
   NEXTAUTH_URL=https://yourdomain.com
   DISCORD_CLIENT_ID=your-client-id
   DISCORD_CLIENT_SECRET=your-client-secret
   ```

## Troubleshooting

### "Configuration" Error
- Make sure `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are set in `.env.local`
- Restart your development server after changing environment variables

### "AccessDenied" Error
- The user clicked "Cancel" during Discord authorization
- Have them try signing in again

### "Invalid Redirect URI" Error
- Make sure the redirect URI in Discord matches exactly: `http://localhost:3000/api/auth/callback/discord`
- Check for typos or extra slashes

## Need Help?

Check the NextAuth.js Discord Provider documentation:
https://next-auth.js.org/providers/discord
