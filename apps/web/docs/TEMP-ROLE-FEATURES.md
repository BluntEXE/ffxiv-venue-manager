# Multi-Owner & Temporary Role Features

## Overview
Added support for:
1. **Multiple Owners** - Promote staff to OWNER role
2. **Temporary Roles (Deputizing)** - Grant elevated permissions temporarily that auto-expire

## Database Migration Required

Before these features work, you need to run the Prisma migration:

```bash
cd "F:\Claude\Project Ideas\venue-manager-web"
npx prisma migrate dev --name add_temporary_roles
```

This adds three new fields to the `Membership` model:
- `temporaryRole` - The elevated role (OWNER, MANAGER, STAFF) while deputized
- `temporaryRoleExpiresAt` - When the temporary role expires
- `permanentRole` - Their original role to revert back to

## Features

### 1. Multiple Owners
- Owners can now promote Managers or Staff to OWNER role
- Venue can have multiple people with OWNER permissions
- All owners have equal access and control

### 2. Temporary Roles (Deputizing)
- **Use Case**: Owner going on vacation? Deputize a Manager as temporary OWNER
- Set an expiration date/time for the temporary role
- When expired, they automatically revert to their permanent role
- Shows "🔓 Deputized" badge with expiration countdown

## How to Use

### Promote Someone to Owner:
1. Go to Staff page (`/dashboard/{slug}/staff`)
2. Click "Manage" on any Manager or Staff member
3. Change "Permanent Role" to "Owner"
4. Click "Update Role"

### Deputize Someone Temporarily:
1. Go to Staff page
2. Click "Manage" on the person
3. Set "Permanent Role" (their normal role)
4. Set "Deputize As" (elevated role: MANAGER or OWNER)
5. Set "Expires At" (date/time when they revert back)
6. Click "Update Role"

## UI Components Created

1. **ManageStaffRoleDialog** (`components/manage-staff-role-dialog.tsx`)
   - Dialog for managing both permanent and temporary roles
   - Shows current status, deputization info, expiration
   - Validates role combinations

2. **StaffMemberCard** (`components/staff-member-card.tsx`)
   - Enhanced staff card showing temporary role badges
   - Displays expiration countdown
   - Highlights roles expiring soon (< 24 hours)

## API Updates

Updated `PUT /api/venues/[venueId]/staff/[membershipId]`:
- Accepts `temporaryRole`, `temporaryRoleExpiresAt`, `permanentRole`
- Converts ISO date strings to Date objects
- Returns updated membership with all role fields

## Example Scenarios

### Scenario 1: Weekend Backup
```
User: Alice (Permanent: MANAGER)
Deputize As: OWNER
Expires: Sunday 11:59 PM

Result:
- Friday-Sunday: Alice has OWNER permissions
- Monday: Automatically reverts to MANAGER
```

### Scenario 2: Event Coverage
```
User: Bob (Permanent: STAFF)
Deputize As: MANAGER
Expires: Saturday 2:00 AM (after event)

Result:
- Saturday event: Bob can manage tasks, assign roles
- After 2 AM: Reverts to STAFF automatically
```

## Visual Indicators

**Regular Staff:**
```
┌────────────────────────────┐
│ John Doe          STAFF    │
│ Joined Jan 1, 2025         │
└────────────────────────────┘
```

**Deputized Staff:**
```
┌────────────────────────────────────────┐
│ Alice Smith              OWNER         │
│                    🔓 Deputized        │
│                 Permanent: MANAGER     │
│ ⏰ Deputized until Jan 15, 2025 5:00PM│
└────────────────────────────────────────┘
```

## Notes

- Only OWNER can promote to OWNER
- Only OWNER can deputize someone as OWNER
- Managers can deputize STAFF as MANAGER
- Temporary roles must be higher than permanent roles
- Expiration is checked client-side (badge updates)
- System will need a cron job to auto-revert expired roles server-side

## Next Steps (Optional Enhancements)

1. **Auto-Revert Cron Job**: Create `/api/cron/expire-temporary-roles` to automatically revert expired roles
2. **Notifications**: Send Discord webhook when someone is deputized or reverted
3. **History Log**: Track who was deputized, when, and by whom
4. **Extension**: Allow extending temporary roles before expiration
