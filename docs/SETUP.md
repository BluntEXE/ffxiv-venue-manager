# Quick Setup Guide

## Step 1: Add Your Database Connection

1. Open `.env.local` in the project root
2. Replace `YOUR_PASSWORD` with your actual Supabase database password:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xafdagmxihvcvqvycsor.supabase.co:5432/postgres"
DIRECT_URL="postgresql://postgres:YOUR_PASSWORD@db.xafdagmxihvcvqvycsor.supabase.co:5432/postgres"
```

## Step 2: Generate a Secret Key

Generate a random secret for NextAuth:

```bash
# On Windows PowerShell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Copy the output and add it to `.env.local`:

```env
NEXTAUTH_SECRET="paste-the-generated-secret-here"
```

## Step 3: Initialize the Database

Run these commands in order:

```bash
# Generate Prisma Client
npx prisma generate

# Push database schema to Supabase
npx prisma db push
```

You should see output like:
```
✔ Generated Prisma Client
✔ The database is now in sync with the schema
```

## Step 4: Start Development Server

```bash
npm run dev
```

Visit http://localhost:3000

## Troubleshooting

### "Environment variable not found: DATABASE_URL"
- Make sure `.env.local` exists in the project root
- Verify the file has the correct `DATABASE_URL` value

### "Can't reach database server"
- Check your Supabase project is active
- Verify the password is correct
- Ensure your IP isn't blocked in Supabase network restrictions

### "Command not found: npx"
- Restart your terminal after installing Node.js
- Verify Node.js installation: `node --version`

## Next Steps

Once the setup is complete:

1. Review the database schema: `npx prisma studio`
2. Start building features from Phase 1 of the roadmap
3. Check `README.md` for full project documentation

## Optional: Install shadcn/ui Components

When you're ready to build UI components:

```bash
npx shadcn@latest init
```

Follow the prompts to configure your component library.
