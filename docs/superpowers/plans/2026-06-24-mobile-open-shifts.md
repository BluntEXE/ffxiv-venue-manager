# Mobile Open Shifts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible "Open Shifts" section to the Home tab so staff can see and claim available shifts from mobile.

**Architecture:** Two new API routes (list open shifts, claim a shift). Home screen gains a new section with collapse state persisted via `expo-secure-store`. Claim uses optimistic concurrency (`updateMany` count check) to handle race conditions.

**Tech Stack:** Next.js 15 API routes, Prisma, React Native / Tamagui, `expo-secure-store` for persistence, existing `requireMobileAuth` / `apiFetch` patterns.

---

## Files

| File | Action |
|------|--------|
| `apps/web/app/api/mobile/my/open-shifts/route.ts` | Create — GET list of open shifts |
| `apps/web/app/api/mobile/my/open-shifts/[shiftId]/route.ts` | Create — POST claim a shift |
| `apps/mobile/app/(app)/home.tsx` | Modify — open shifts section + collapse toggle |

---

### Task 1: GET /api/mobile/my/open-shifts

**Files:**
- Create: `apps/web/app/api/mobile/my/open-shifts/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// apps/web/app/api/mobile/my/open-shifts/route.ts
import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const now = new Date()

  const shifts = await prisma.shift.findMany({
    where: {
      status: "OPEN",
      scheduledStart: { gte: now },
      venue: {
        memberships: {
          some: { userId, status: "active" },
        },
      },
    },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      venue: { select: { id: true, name: true } },
      role: { select: { name: true } },
    },
    orderBy: { scheduledStart: "asc" },
    take: 20,
  })

  return NextResponse.json(
    shifts.map((s) => ({
      id: s.id,
      venueId: s.venue.id,
      venueName: s.venue.name,
      scheduledStart: s.scheduledStart.toISOString(),
      scheduledEnd: s.scheduledEnd.toISOString(),
      roleName: s.role?.name ?? null,
    }))
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/web exec tsc --noEmit 2>&1 | grep -v "node_modules" | grep "error" | head -10 || echo "clean"
```

Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/mobile/my/open-shifts/route.ts
git commit -m "feat(api): add GET /api/mobile/my/open-shifts endpoint"
```

---

### Task 2: POST /api/mobile/my/open-shifts/[shiftId] (claim)

**Files:**
- Create: `apps/web/app/api/mobile/my/open-shifts/[shiftId]/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// apps/web/app/api/mobile/my/open-shifts/[shiftId]/route.ts
import { NextResponse } from "next/server"
import { requireMobileAuth, isAuthFailure } from "@/lib/mobile-auth-guard"
import { prisma } from "@/lib/prisma"
import { logShiftAudit } from "@/lib/shift-audit"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shiftId: string }> }
) {
  const result = await requireMobileAuth(req)
  if (isAuthFailure(result)) return result
  const userId = result

  const { shiftId } = await params
  const body = await req.json().catch(() => ({}))
  const { venueId } = body

  if (!venueId || typeof venueId !== "string") {
    return NextResponse.json({ error: "venueId required" }, { status: 400 })
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, venueId, status: "active" },
  })
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this venue" }, { status: 403 })
  }

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, venueId, status: "OPEN" },
  })
  if (!shift) {
    return NextResponse.json({ error: "Shift not found or already claimed" }, { status: 404 })
  }

  // Optimistic concurrency — only update if still OPEN
  const writeResult = await prisma.shift.updateMany({
    where: { id: shiftId, status: "OPEN" },
    data: { status: "CLAIMED", membershipId: membership.id },
  })
  if (writeResult.count === 0) {
    return NextResponse.json({ error: "Shift was just claimed by someone else" }, { status: 409 })
  }

  await logShiftAudit(shiftId, "CLAIM", userId, "mobile_self")

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/web exec tsc --noEmit 2>&1 | grep -v "node_modules" | grep "error" | head -10 || echo "clean"
```

Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/mobile/my/open-shifts/[shiftId]/route.ts"
git commit -m "feat(api): add POST /api/mobile/my/open-shifts/[shiftId] claim endpoint"
```

---

### Task 3: Open Shifts section on Home tab

**Files:**
- Modify: `apps/mobile/app/(app)/home.tsx`

- [ ] **Step 1: Add import for SecureStore**

Find the existing imports at the top of the file. `expo-secure-store` is already in package.json. Add it:

```typescript
import * as SecureStore from 'expo-secure-store'
```

- [ ] **Step 2: Add OpenShift type**

Add below the existing `FollowedVenue` type:

```typescript
type OpenShift = {
  id: string
  venueId: string
  venueName: string
  scheduledStart: string
  scheduledEnd: string
  roleName: string | null
}
```

- [ ] **Step 3: Add state variables**

Add inside `HomeScreen`, alongside the existing state declarations (`follows`, `refreshing`, etc.):

```typescript
const [openShifts, setOpenShifts] = useState<OpenShift[]>([])
const [openShiftsExpanded, setOpenShiftsExpanded] = useState(true)
const [claiming, setClaiming] = useState<string | null>(null)
const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set())
const [claimErrors, setClaimErrors] = useState<Record<string, string>>({})
```

- [ ] **Step 4: Load persisted collapse state**

Add a `useEffect` after the state declarations:

```typescript
useEffect(() => {
  SecureStore.getItemAsync('@xivvm/openShiftsExpanded').then(val => {
    if (val !== null) setOpenShiftsExpanded(val === 'true')
  })
}, [])
```

- [ ] **Step 5: Add toggle function**

Add alongside the existing `onRefresh` function:

```typescript
function toggleOpenShifts() {
  const next = !openShiftsExpanded
  setOpenShiftsExpanded(next)
  SecureStore.setItemAsync('@xivvm/openShiftsExpanded', String(next))
}
```

- [ ] **Step 6: Fetch open shifts in loadShifts**

Find the existing `loadShifts` function. It currently fetches shifts and follows in a `Promise.all`. Extend it to also fetch open shifts:

```typescript
async function loadShifts(isRefresh = false) {
  if (!isRefresh) setShiftsLoading(true)
  try {
    const [shiftsRes, followsRes, openShiftsRes] = await Promise.all([
      apiFetch('/api/mobile/my/shifts'),
      apiFetch('/api/mobile/my/follows'),
      apiFetch('/api/mobile/my/open-shifts'),
    ])
    if (shiftsRes.ok) setShifts(await shiftsRes.json())
    if (followsRes.ok) setFollows(await followsRes.json())
    if (openShiftsRes.ok) setOpenShifts(await openShiftsRes.json())
  } catch {}
  setShiftsLoading(false)
  setRefreshing(false)
}
```

- [ ] **Step 7: Add claim function**

Add alongside `toggleOpenShifts`:

```typescript
async function claimShift(shiftId: string, venueId: string) {
  setClaiming(shiftId)
  setClaimErrors(e => { const n = { ...e }; delete n[shiftId]; return n })
  try {
    const res = await apiFetch(`/api/mobile/my/open-shifts/${shiftId}`, {
      method: 'POST',
      body: JSON.stringify({ venueId }),
    })
    if (res.status === 409) {
      // Race condition — shift was claimed by someone else
      setOpenShifts(s => s.filter(x => x.id !== shiftId))
      return
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setClaimErrors(e => ({ ...e, [shiftId]: data.error || 'Failed to claim' }))
      return
    }
    setClaimedIds(s => new Set([...s, shiftId]))
  } catch {
    setClaimErrors(e => ({ ...e, [shiftId]: 'Network error' }))
  } finally {
    setClaiming(null)
  }
}
```

- [ ] **Step 8: Render the Open Shifts section**

In the JSX, find the `follows.length > 0` block and add the Open Shifts section directly above it (inside the `<>` fragment, after the upcoming shifts block):

```tsx
{openShifts.length > 0 && (
  <YStack gap="$2" marginTop="$2">
    <XStack alignItems="center" justifyContent="space-between">
      <Text fontFamily="Outfit_600SemiBold" fontSize={16} color="$text">Open Shifts</Text>
      <Button chromeless size="$2" onPress={toggleOpenShifts} paddingHorizontal="$1">
        <Ionicons name={openShiftsExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#a6adc8" />
      </Button>
    </XStack>
    {openShiftsExpanded && openShifts.map((s) => (
      <XStack
        key={s.id}
        backgroundColor="$surface0"
        borderRadius="$2"
        padding="$3"
        alignItems="center"
        gap="$3"
        borderWidth={1}
        borderColor="rgba(0,180,255,0.15)"
      >
        <YStack flex={1} gap="$1">
          <Text color="$text" fontSize={14} fontFamily="Outfit_600SemiBold" numberOfLines={1}>
            {s.venueName}
          </Text>
          <Text color="$subtext0" fontSize={12}>
            {formatST(s.scheduledStart)} – {formatST(s.scheduledEnd)} ST
          </Text>
          {s.roleName && (
            <Text color="$subtext0" fontSize={11}>{s.roleName}</Text>
          )}
          {claimErrors[s.id] && (
            <Text color="$danger" fontSize={11}>{claimErrors[s.id]}</Text>
          )}
        </YStack>
        {claimedIds.has(s.id) ? (
          <XStack backgroundColor="rgba(0,180,255,0.12)" borderRadius="$4" paddingHorizontal="$2" paddingVertical={2}>
            <Text fontSize={11} color="$primary">Pending</Text>
          </XStack>
        ) : (
          <Button
            size="$2"
            backgroundColor="$primary"
            color="$base"
            borderRadius="$2"
            fontFamily="InterBold"
            fontSize={12}
            disabled={claiming === s.id}
            onPress={() => claimShift(s.id, s.venueId)}
            pressStyle={{ opacity: 0.85 }}
          >
            {claiming === s.id ? <Spinner size="small" color="$base" /> : 'Claim'}
          </Button>
        )}
      </XStack>
    ))}
  </YStack>
)}
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
cd /home/ehno/xiv-app && pnpm --filter @xiv-venue-manager/mobile exec tsc --noEmit 2>&1 | grep -v "node_modules\|WARN" | grep "error" | head -10 || echo "clean"
```

Expected: `clean` (or only pre-existing ambient errors like `@expo/vector-icons`)

- [ ] **Step 10: Sync corpus and commit**

```bash
cp "/home/ehno/xiv-app/apps/mobile/app/(app)/home.tsx" \
   "/home/ehno/xiv-graphify-corpus/mobile/app/(app)/home.tsx"
git add "apps/mobile/app/(app)/home.tsx"
git commit -m "feat(mobile): add collapsible Open Shifts section to Home tab"
```

---

### Task 4: Deploy web + trigger EAS build

- [ ] **Step 1: Push and deploy web**

```bash
git push && ssh server@192.168.1.122 "cd ~/xiv-app && git pull && docker compose build venue-manager && docker compose up -d venue-manager"
```

Expected: container restarts with the two new API routes live.

- [ ] **Step 2: Trigger mobile build**

Run in your terminal:
```
! cd ~/xiv-app/apps/mobile && eas build --platform android --profile preview
```
