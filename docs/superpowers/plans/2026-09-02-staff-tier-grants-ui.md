# Staff Tier-Grant Elevation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a venue owner temporarily deputise a staff member to Manager (with a required expiry, revocable early) from the staff member-detail page, using xvm-api's tier-grants endpoints that landed in xvm-api#63/#55.

**Architecture:** New xvm-api client wrapper functions in `lib/api/xvm-api.ts`, two new Next.js proxy routes under `app/api/venues/[venueId]/staff/[membershipId]/tier-grants/`, a `baseRole` field added to the existing `toStaffShape` mapper (needed so the UI can tell "base role" apart from "effective role, live grant included" — currently only the latter is exposed), and a new "Temporary Elevation" card on the member-detail page.

**Tech Stack:** Next.js 15 App Router API routes, React (client component), zod for request validation, existing `Dialog`/`AlertDialog`/`Input`/`Label` shadcn components, `LocalTime` from `components/server-time.tsx` for date display.

**Design decisions made (not left open):**
- **Duration input:** a native `<input type="datetime-local">`, not a custom picker (the browser already has one; xvm-bot needed a custom picker because Discord has no native input, this is a regular web page).
- **Grant history shows no granter name.** `TierGrantRow.granted_by_person_id` is a bare number; resolving it to a display name would need a person-id → name lookup that doesn't exist client-side yet (the roster fetch only covers currently-employed members, and a past granter may have left). Deferred — status, granted-at, and expires-at are enough to answer "is someone currently elevated and until when," which is the actual question this UI exists to answer.
- **No client-side role gate on who sees the "Deputise" button.** Every other mutation on this page (Base Role, Positions, Remove Staff) already relies on xvm-api's own 403 rather than a client-side permission check — matching that existing pattern rather than inventing a new "am I an owner" fetch this page doesn't otherwise need.
- **"Deputise" is hidden (not just disabled) once the target's effective role is already Manager or Owner**, since xvm-api refuses that with a 409 ("already holds that rank or higher") — no reason to let someone hit a guaranteed error.

---

### Task 1: xvm-api client functions

**Files:**
- Modify: `apps/web/lib/api/xvm-api.ts` (insert after `setTier`, ends around line 686)

- [ ] **Step 1: Add the `TierGrantRow` type and three wrapper functions**

Insert immediately after the closing brace of `setTier` (currently ending at line 686, right before `export async function terminateMembership`):

```typescript
export interface TierGrantRow {
  id: number
  tier: string
  granted_at: string
  expires_at: string | null
  granted_by_person_id: number | null
  revoked_at: string | null
  is_live: boolean
}

// Deputise a member to manager until a stated moment. xvm-api hard-codes the
// grantable tier to "manager" (Literal["manager"] server-side) and requires
// expires_at - there is no untimed grant, that's just PUT tier.
export async function grantTier(
  personToken: string,
  venueId: string,
  membershipId: number,
  expiresAt: string
): Promise<TierGrantRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TierGrantRow>(
    `/venues/${venueId}/memberships/${membershipId}/tier-grants`,
    { method: "POST", body: JSON.stringify({ tier: "manager", expires_at: expiresAt }) },
    personToken
  )
}

export async function listTierGrants(
  personToken: string,
  venueId: string,
  membershipId: number
): Promise<TierGrantRow[]> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TierGrantRow[]>(`/venues/${venueId}/memberships/${membershipId}/tier-grants`, {}, personToken)
}

export async function revokeTierGrant(
  personToken: string,
  venueId: string,
  membershipId: number,
  grantId: number
): Promise<TierGrantRow> {
  if (!process.env.XVM_API_BASE_URL) throw new Error("XVM_API_BASE_URL is not set")
  return xvmFetch<TierGrantRow>(
    `/venues/${venueId}/memberships/${membershipId}/tier-grants/${grantId}/revoke`,
    { method: "POST" },
    personToken
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api/xvm-api.ts
git commit -m "feat(staff): add xvm-api client functions for tier grants"
```

---

### Task 2: Expose base tier through `toStaffShape`

The member-detail page currently only receives `role`, which `toStaffShape` sets to `member.effective_tier` (base tier + any live grant folded in — this is what the roster is supposed to show). The new UI needs the *base* tier too, to know whether "Deputise" even makes sense (it doesn't, if the base role is already Manager/Owner) and to display "Base role: Staff, currently elevated to Manager" accurately. `MembershipRow.tier` (the raw base field) already exists in the client type from Task 1's file — just wasn't threaded through.

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/staff/route.ts:36-57` (`toStaffShape`)
- Modify: `apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts:52-73` (`toStaffShape`, the per-route duplicate)

- [ ] **Step 1: Add `baseRole` to both `toStaffShape` functions**

In `apps/web/app/api/venues/[venueId]/staff/route.ts`, change:

```typescript
function toStaffShape(member: MembershipRow, positionsById: Map<number, PositionRow>, venueId: string) {
  return {
    id: member.id,
    role: member.effective_tier.toUpperCase(),
    customRole: null,
```

to:

```typescript
function toStaffShape(member: MembershipRow, positionsById: Map<number, PositionRow>, venueId: string) {
  return {
    id: member.id,
    role: member.effective_tier.toUpperCase(),
    baseRole: member.tier.toUpperCase(),
    customRole: null,
```

Make the identical change in `apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts`'s copy of `toStaffShape` (same shape, same two lines).

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors (both functions return an inferred object type, nothing downstream destructures this object exhaustively today, so adding a field is additive and safe).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/staff/route.ts apps/web/app/api/venues/[venueId]/staff/[membershipId]/route.ts
git commit -m "feat(staff): expose base tier alongside effective tier in toStaffShape"
```

---

### Task 3: Proxy route — list + create tier grants

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/staff/[membershipId]/tier-grants/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { grantTier, listTierGrants } from "@/lib/api/xvm-api"

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
    select: { xvmApiVenueId: true },
  })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

const grantSchema = z.object({
  expiresAt: z.string().datetime({ message: "expiresAt must be an ISO 8601 datetime" }),
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, membershipId } = await context.params
    const id = Number(membershipId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const grants = await listTierGrants(token, gate.xvmApiVenueId!, id)
      return NextResponse.json(grants)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff/tier-grants] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, membershipId } = await context.params
    const id = Number(membershipId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof grantSchema>
    try {
      data = grantSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const grant = await grantTier(token, gate.xvmApiVenueId!, id, data.expiresAt)
      return NextResponse.json(grant, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff/tier-grants] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/venues/[venueId]/staff/[membershipId]/tier-grants/route.ts
git commit -m "feat(staff): add list/create proxy route for tier grants"
```

---

### Task 4: Proxy route — revoke a tier grant

**Files:**
- Create: `apps/web/app/api/venues/[venueId]/staff/[membershipId]/tier-grants/[grantId]/revoke/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { revokeTierGrant } from "@/lib/api/xvm-api"

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
    select: { xvmApiVenueId: true },
  })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string; grantId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, membershipId, grantId } = await context.params
    const id = Number(membershipId)
    const grant = Number(grantId)
    if (!Number.isInteger(id) || !Number.isInteger(grant)) {
      return NextResponse.json({ error: "Staff member or grant not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const revoked = await revokeTierGrant(token, gate.xvmApiVenueId!, id, grant)
      return NextResponse.json(revoked)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff/tier-grants/revoke] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/staff/[membershipId]/tier-grants/[grantId]/revoke/route.ts"
git commit -m "feat(staff): add revoke proxy route for tier grants"
```

---

### Task 5: Member-detail page UI

**Files:**
- Modify: `apps/web/app/dashboard/[slug]/staff/[membershipId]/page.tsx`

- [ ] **Step 1: Update imports and the `StaffMember` interface**

Add `baseRole` to the interface, and add the new UI imports. Change:

```typescript
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { PageLoading } from "@/components/ui/loading-spinner"
import { VenueLayoutClient } from "@/components/venue-layout-client"

// xvm-api's Position model has no primary/secondary distinction the way
// Prisma's customRole vs additionalRoles did - every assigned position is
// one flat, equally-weighted set (see Position Management below).
interface StaffMember {
  id: number
  role: "OWNER" | "MANAGER" | "STAFF"
  joinedAt: string | null
  nickname: string | null
  additionalRoles: { id: number; name: string; color: number | null }[]
  user: {
    id: number
    name: string | null
    displayName: string | null
    image: string | null
  } | null
}
```

to:

```typescript
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { PageLoading } from "@/components/ui/loading-spinner"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { LocalTime } from "@/components/server-time"

// xvm-api's Position model has no primary/secondary distinction the way
// Prisma's customRole vs additionalRoles did - every assigned position is
// one flat, equally-weighted set (see Position Management below).
interface StaffMember {
  id: number
  role: "OWNER" | "MANAGER" | "STAFF"
  baseRole: "OWNER" | "MANAGER" | "STAFF"
  joinedAt: string | null
  nickname: string | null
  additionalRoles: { id: number; name: string; color: number | null }[]
  user: {
    id: number
    name: string | null
    displayName: string | null
    image: string | null
  } | null
}

interface TierGrant {
  id: number
  tier: string
  granted_at: string
  expires_at: string | null
  granted_by_person_id: number | null
  revoked_at: string | null
  is_live: boolean
}
```

- [ ] **Step 2: Add grant state and fetch logic**

Change the state block:

```typescript
  // Form state
  const [selectedRole, setSelectedRole] = useState<"OWNER" | "MANAGER" | "STAFF">("STAFF")
  const [selectedPositionIds, setSelectedPositionIds] = useState<number[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
```

to:

```typescript
  // Form state
  const [selectedRole, setSelectedRole] = useState<"OWNER" | "MANAGER" | "STAFF">("STAFF")
  const [selectedPositionIds, setSelectedPositionIds] = useState<number[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Tier grants
  const [grants, setGrants] = useState<TierGrant[]>([])
  const [deputiseOpen, setDeputiseOpen] = useState(false)
  const [deputiseExpiresAt, setDeputiseExpiresAt] = useState("")
  const [isDeputising, setIsDeputising] = useState(false)
  const [deputiseError, setDeputiseError] = useState("")
  const [revokingGrantId, setRevokingGrantId] = useState<number | null>(null)
```

Add a grant-fetching function and call it from the existing data-fetch effect. Change:

```typescript
        setStaffMember(member)
        setSelectedRole(member.role)
        setSelectedPositionIds(member.additionalRoles.map((r) => r.id))
```

to:

```typescript
        setStaffMember(member)
        setSelectedRole(member.role)
        setSelectedPositionIds(member.additionalRoles.map((r) => r.id))

        const grantsResponse = await fetch(`/api/venues/${slug}/staff/${membershipId}/tier-grants`)
        if (grantsResponse.ok) {
          setGrants(await grantsResponse.json())
        }
```

- [ ] **Step 3: Add deputise/revoke handlers**

Add these two functions after `handleRemove` (before the `if (!slug || !membershipId)` render guard):

```typescript
  const refreshGrants = async () => {
    const response = await fetch(`/api/venues/${slug}/staff/${membershipId}/tier-grants`)
    if (response.ok) {
      setGrants(await response.json())
    }
  }

  const handleDeputise = async () => {
    if (!deputiseExpiresAt) {
      setDeputiseError("Pick an expiry.")
      return
    }

    setIsDeputising(true)
    setDeputiseError("")

    try {
      const response = await fetch(`/api/venues/${slug}/staff/${membershipId}/tier-grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: new Date(deputiseExpiresAt).toISOString() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to grant temporary elevation")
      }

      setDeputiseOpen(false)
      setDeputiseExpiresAt("")
      await refreshGrants()
      router.refresh()
    } catch (error: unknown) {
      setDeputiseError(error instanceof Error ? error.message : "Failed to grant temporary elevation")
    } finally {
      setIsDeputising(false)
    }
  }

  const handleRevoke = async (grantId: number) => {
    setRevokingGrantId(grantId)
    setError("")

    try {
      const response = await fetch(`/api/venues/${slug}/staff/${membershipId}/tier-grants/${grantId}/revoke`, {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to revoke elevation")
      }

      await refreshGrants()
      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to revoke elevation")
    } finally {
      setRevokingGrantId(null)
    }
  }
```

- [ ] **Step 4: Render the Temporary Elevation card**

Insert a new card between the "Role Management" card and the "Danger Zone" card. Find:

```typescript
        {/* Danger Zone */}
        <Card className="border-red-200">
```

and insert immediately before it:

```typescript
        {/* Temporary Elevation */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Temporary Elevation</CardTitle>
            <CardDescription>Deputise this member to Manager until a stated time, or review past grants.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const liveGrant = grants.find((g) => g.is_live)
              return liveGrant ? (
                <Alert className="bg-blue-500/10 border-blue-500/20">
                  <AlertDescription>
                    Currently elevated to <strong>Manager</strong>
                    {liveGrant.expires_at ? (
                      <>
                        {" "}
                        until <LocalTime date={liveGrant.expires_at} formatStr="datetimelong" />
                      </>
                    ) : null}
                    .{" "}
                    <Button
                      variant="link"
                      className="h-auto p-0 text-destructive"
                      disabled={revokingGrantId === liveGrant.id}
                      onClick={() => handleRevoke(liveGrant.id)}
                    >
                      {revokingGrantId === liveGrant.id ? "Revoking..." : "Revoke now"}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : staffMember.baseRole === "STAFF" ? (
                <Dialog open={deputiseOpen} onOpenChange={setDeputiseOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">Deputise to Manager</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Deputise to Manager</DialogTitle>
                      <DialogDescription>
                        {staffMember.user?.name} will act as Manager until the time you pick, then automatically
                        return to Staff.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                      <Label htmlFor="deputise-expires">Elevated until</Label>
                      <Input
                        id="deputise-expires"
                        type="datetime-local"
                        value={deputiseExpiresAt}
                        onChange={(e) => setDeputiseExpiresAt(e.target.value)}
                      />
                    </div>
                    {deputiseError && (
                      <Alert className="bg-destructive/10 border-destructive/20">
                        <AlertDescription className="text-destructive">{deputiseError}</AlertDescription>
                      </Alert>
                    )}
                    <DialogFooter>
                      <Button onClick={handleDeputise} disabled={isDeputising}>
                        {isDeputising ? "Granting..." : "Grant"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Already {staffMember.baseRole === "OWNER" ? "an owner" : "a manager"} - nothing to deputise.
                </p>
              )
            })()}

            {grants.length > 0 && (
              <div className="pt-4 border-t space-y-2">
                <p className="text-sm font-medium">History</p>
                {grants.map((grant) => (
                  <div key={grant.id} className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Manager, <LocalTime date={grant.granted_at} formatStr="datetime" /> →{" "}
                      {grant.expires_at ? <LocalTime date={grant.expires_at} formatStr="datetime" /> : "—"}
                    </span>
                    <Badge variant={grant.is_live ? "default" : "outline"}>
                      {grant.is_live ? "Live" : grant.revoked_at ? "Revoked" : "Expired"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Lint**

Run: `cd apps/web && npx eslint "app/dashboard/[slug]/staff/[membershipId]/page.tsx"`
Expected: no new errors (pre-existing warnings on this file, if any, are unrelated and untouched).

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/dashboard/[slug]/staff/[membershipId]/page.tsx"
git commit -m "feat(staff): add temporary elevation UI to member-detail page"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full lint**

Run: `cd apps/web && npx eslint .`
Expected: 0 errors (existing warnings elsewhere in the repo are pre-existing and unrelated).

- [ ] **Step 3: Full test suite**

Run: `cd apps/web && npx vitest run`
Expected: same pass count as before this branch (this plan adds no new `.test.ts` files — matches this repo's existing convention where `setTier`/`terminateMembership`/`rehireMembership`/`createInvite` in `lib/api/xvm-api.ts` also have no dedicated unit tests; only `Tasks API` and `Public hours batch` do).

- [ ] **Step 4: Live check against the running dev server**

Per this repo's CLAUDE.md, static checks alone aren't sufficient. Start the local stack per `docs/LOCAL_DEV.md`, sign in as a venue owner, open a staff member's detail page, and click through:
- Deputise a Staff member to Manager with a near-future expiry — confirm the live-grant banner appears with the correct time and the member's effective role updates elsewhere in the dashboard (e.g. the staff list badge).
- Revoke it early — confirm the banner disappears and the history row shows "Revoked."
- Grant again and let it actually expire (or manually adjust a grant's `expires_at` in the xvm-api test DB to the past) — confirm the banner disappears without a revoke action, and history shows "Expired."
- Attempt to deputise a member who is already base-role Manager or Owner — confirm the button doesn't appear (base role gate) rather than confirm the 409 path, since Step 4's design already hides the button in that case.

- [ ] **Step 5: Commit any live-check fixes, then done**

If the live check surfaces anything, fix it, re-run steps 1-4, and commit. Otherwise this plan is complete.
