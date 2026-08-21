# Settings Reorganization Plan — Phase 1

## Goal
Move Notifications to user settings, add API Keys section, reorganize venue settings, and wire up notification prefs server-side.

## Scope

### In Scope
1. Move Notifications from venue settings to user settings
2. Add My API Keys section to user settings
3. Reorganize venue settings sections (extract Shift Bot, combine Pot+Inventory)
4. Wire up `notifyVenueOwners()` to check user notification prefs
5. Add `settings` JSON column to User model
6. Add `UserSettings` type to shared types
7. Update `/api/user/profile` to handle notifications
8. Remove `notifications` from `VenueSettings` type and venue settings API schema

### Out of Scope (Phase 2)
- Extract shared API key management component
- Fix ARIA on toggle buttons
- Add dirty state tracking to account settings
- Add `beforeunload` handler
- Consolidate three API key pages into one

---

## File Changes

### Database
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `settings Json?` to User model |

### Types
| File | Change |
|------|--------|
| `packages/types/src/venue-settings.ts` | Remove `notifications` field from `VenueSettings` |
| `packages/types/src/models.ts` | Add `UserSettings` type |

### API Routes
| File | Change |
|------|--------|
| `apps/web/app/api/user/profile/route.ts` | Add `notifications` field to PATCH handler |
| `apps/web/app/api/venues/[venueId]/settings/route.ts` | Remove `notifications` from Zod schema |
| `apps/web/lib/notify.ts` | Check user prefs before sending notifications |

### Venue Settings Page
| File | Change |
|------|--------|
| `apps/web/app/dashboard/[slug]/settings/page.tsx` | Remove Notifications section, extract Shift Bot, combine Pot+Inventory |

### User Settings Page
| File | Change |
|------|--------|
| `apps/web/app/dashboard/account/settings/page.tsx` | Add Notifications + API Keys sections |

---

## Detailed Changes

### 1. Database: Add User Settings Column

```prisma
model User {
  id       String  @id
  name     String?
  email    String? @unique
  image    String?
  settings Json?   // User-level preferences (notifications, etc.)
  // ... existing fields
}
```

### 2. Types: Add UserSettings

```typescript
// packages/types/src/models.ts
export interface UserSettings {
  notifications?: {
    newFollower?: boolean
    eventRsvp?: boolean
    lowStaffCoverage?: boolean
    dailySummary?: boolean
  }
}
```

### 3. Types: Remove notifications from VenueSettings

```typescript
// packages/types/src/venue-settings.ts
// Remove this line:
// notifications?: Record<string, boolean>
```

### 4. API: Update User Profile Route

```typescript
// apps/web/app/api/user/profile/route.ts
const patchSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  notifications: z.object({
    newFollower: z.boolean().optional(),
    eventRsvp: z.boolean().optional(),
    lowStaffCoverage: z.boolean().optional(),
    dailySummary: z.boolean().optional(),
  }).optional(),
})

// In PATCH handler:
if (notifications !== undefined) {
  const current = (user.settings as any) ?? {}
  await prisma.user.update({
    where: { id: session.user.id },
    data: { settings: { ...current, notifications } },
  })
}
```

### 5. API: Remove notifications from venue settings

```typescript
// apps/web/app/api/venues/[venueId]/settings/route.ts
// Remove from updateSettingsSchema:
// notifications: z.record(z.string(), z.boolean()).optional(),
```

### 6. Notify: Check user prefs

```typescript
// apps/web/lib/notify.ts
export async function notifyVenueOwners(venueId, type, payload) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: { memberships: { include: { user: true } } },
  })

  const activeManagers = venue.memberships.filter(m =>
    m.status === 'active' && ['OWNER', 'MANAGER'].includes(m.role)
  )

  for (const membership of activeManagers) {
    const user = membership.user
    const settings = (user.settings as any)?.notifications ?? {}

    // Check if this notification type is enabled for this user
    const prefKey = {
      'NEW_FOLLOWER': 'newFollower',
      'EVENT_RSVP': 'eventRsvp',
      'LOW_STAFF_COVERAGE': 'lowStaffCoverage',
      'DAILY_SUMMARY': 'dailySummary',
    }[type]

    if (prefKey && settings[prefKey] === false) continue

    // Send notification...
  }
}
```

### 7. Venue Settings: Remove Notifications, Reorganize

**Remove:** Lines 1828-1879 (Notifications section)

**Extract Shift Bot to standalone section:**
- Move lines 1292-1462 (Discord Shift Bot) out of Integrations
- Wrap in its own `<section className="panel">`

**Combine Pot Payroll + Bar Inventory:**
- Wrap lines 1465-1591 in a single `<section className="panel">`
- Add "Operations" header

### 8. User Settings: Add Notifications + API Keys

**Notifications Section:**
```tsx
{/* ── Notifications ── */}
<section className="panel">
  <div className="ph">
    <span className="pt">
      <BellIcon />
      Notifications
    </span>
  </div>
  {[
    { key: "newFollower", title: "New follower", desc: "When someone follows your venue." },
    { key: "eventRsvp", title: "Event RSVPs", desc: "When a patron RSVPs to an event." },
    { key: "lowStaffCoverage", title: "Low staff coverage", desc: "When an open shift is unfilled within 24h." },
    { key: "dailySummary", title: "Daily summary", desc: "A nightly recap of sales and attendance." },
  ].map(({ key, title, desc }) => (
    <div key={key} className="setrow">
      <div className="sinfo">
        <div className="stitle">{title}</div>
        <div className="sdesc">{desc}</div>
      </div>
      <button
        type="button"
        onClick={() => setNotifications(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
        className={`toggle${notifications[key as keyof typeof notifications] ? " on" : ""}`}
      />
    </div>
  ))}
</section>
```

**API Keys Section:**
```tsx
{/* ── My API Keys ── */}
<section className="panel">
  <div className="ph">
    <span className="pt">
      <KeyIcon />
      My API Keys
    </span>
  </div>
  <div className="pbody space-y-4">
    {apiKeys.length === 0 ? (
      <p className="text-sm text-[var(--fg-faint)]">No API keys yet. Create one for the Dalamud plugin.</p>
    ) : (
      <div className="space-y-2">
        {apiKeys.map(key => (
          <div key={key.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--blue-015)]">
            <div>
              <div className="text-sm font-medium">{key.name}</div>
              <div className="text-xs text-[var(--fg-faint)]">
                {key.venue?.name ?? "All venues"} · Last used {key.lastUsedAt ? <LocalTime date={key.lastUsedAt} /> : "never"}
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => revokeKey(key.id)}>
              Revoke
            </Button>
          </div>
        ))}
      </div>
    )}
    <div className="flex gap-2">
      <Input
        placeholder="Key name"
        value={newKeyName}
        onChange={e => setNewKeyName(e.target.value)}
      />
      <Button onClick={createKey} disabled={!newKeyName.trim()}>
        Create Key
      </Button>
    </div>
    <Link href="/dashboard/api-keys" className="text-xs text-[var(--xiv-blue)] hover:underline">
      Full key management →
    </Link>
  </div>
</section>
```

---

## Verification

1. `pnpm tsc --noEmit` — TypeScript compiles
2. `pnpm vitest run` — Tests pass
3. `pnpm prisma migrate dev` — Migration applies
4. Manual: venue settings page has no Notifications section
5. Manual: user settings page has Notifications + API Keys sections
6. Manual: toggling notification prefs saves to user record
7. Manual: creating/revoking API keys works
8. Manual: venue settings save still works
9. Manual: notifyVenueOwners respects user prefs
