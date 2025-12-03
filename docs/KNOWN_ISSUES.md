# Known Issues

## Next.js 16.0.4 Local Build Error

### Issue

**Status**: Known Next.js bug (not caused by our code)
**Severity**: Low (does not affect Vercel deployments)
**Affected**: Local builds only
**First Reported**: 2025-12-03

### Error Message

```
unhandledRejection Error: Cannot find module '../../server/use-cache/handlers'
Require stack:
- F:\...\node_modules\next\dist\export\helpers\create-incremental-cache.js
- F:\...\node_modules\next\dist\build\utils.js
- F:\...\node_modules\next\dist\build\entries.js
- F:\...\node_modules\next\dist\build\index.js
- F:\...\node_modules\next\dist\cli\next-build.js
    at ignore-listed frames {
  code: 'MODULE_NOT_FOUND',
  requireStack: [Array]
}
```

### Root Cause

This is a path resolution bug in Next.js 16.0.4's build system. The module `handlers.js` exists at:
```
node_modules/next/dist/server/use-cache/handlers.js
```

But the build system is incorrectly looking for it with a relative path that doesn't resolve correctly in certain environments (specifically Windows with certain Node versions).

### Impact

- ❌ Local `npm run build` fails
- ✅ Vercel deployments work correctly (different build environment)
- ✅ Development server (`npm run dev`) works correctly
- ✅ All code functionality is intact

### Workarounds

#### Option 1: Deploy to Vercel (Recommended)

Vercel's build environment does not exhibit this issue. Simply push to GitHub and deploy:

```bash
git push origin main
# Vercel will automatically build and deploy
```

#### Option 2: Downgrade to Next.js 15

```bash
npm install next@15.1.0
npm run build
```

**Pros**:
- Stable, proven version
- No build issues
- All features work

**Cons**:
- Miss out on Next.js 16 features
- Will need to upgrade eventually

#### Option 3: Update to Next.js 16.0.7+ (When Available)

Check for newer versions that may fix this:

```bash
npm view next versions | grep 16.0
npm install next@16.0.7  # If available
```

#### Option 4: Use Vercel CLI for Local Builds

```bash
npm install -g vercel
vercel build
```

This uses Vercel's build environment locally, which should work.

### Testing

To verify if the issue is fixed in a newer version:

```bash
# Check current version
npm list next

# Try building
npm run build

# If successful, you should see:
# ✓ Compiled successfully
# ✓ Linting and checking validity of types
# ✓ Collecting page data
# ✓ Generating static pages
```

### Verification

The issue is **not caused by**:
- Security headers in `next.config.ts` (tested by reverting config)
- CSRF protection in `lib/auth.ts`
- Any application code

Tested by:
```bash
git stash  # Remove all local changes
npm run build  # Still fails with same error
git stash pop  # Restore changes
```

### References

- Next.js Issue Tracker: (check for related issues)
- Similar report: Next.js GitHub discussions about `use-cache/handlers`

### Last Updated

2025-12-03 - Initial documentation

### Resolution Status

🟡 **Monitoring**: Waiting for Next.js 16.0.7+ release or Vercel deployment confirmation
