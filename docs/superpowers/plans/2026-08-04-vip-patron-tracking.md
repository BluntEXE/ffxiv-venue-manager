# VIP Patron Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let OWNER/MANAGER staff flag a patron as VIP from the dashboard, and surface that flag in-game (Dalamud plugin) and on the dashboard's patron profiles table.

**Architecture:** New `Patron` table (canonical identity, previously only a loose `characterName`/`world` string) with an `isVip` boolean. Dashboard PATCH endpoint sets it. A new plugin-facing GET endpoint returns the venue's VIP list; the plugin fetches it once per venue-select (same cache-once lifecycle as roles/services, not live-polled) and uses it to badge the in-game guest list and color the entry chat alert.

**Tech Stack:** Next.js 15 (App Router) + Prisma + PostgreSQL (web), C#/.NET 10 Dalamud plugin (game client). Web tests via Vitest — this repo has no route-level or C# test infrastructure, so this plan follows existing convention: unit test the one piece of pure logic (`patronTag`), no new test scaffolding invented for API routes or the plugin.

---

## Task 1: Add `Patron` model to the schema

**Files:**

- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add the model**

Insert after the `PatronLog` model (ends around line 517, before `model Service` at line 519):

```prisma
model Patron {
  id            String    @id @default(cuid())
  venueId       String
  characterName String
  world         String
  isVip         Boolean   @default(false)
  vipSetAt      DateTime?
  vipSetById    String?
  createdAt     DateTime  @default(now())

  venue    Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)
  vipSetBy User? @relation(fields: [vipSetById], references: [id])

  @@unique([venueId, characterName, world])
  @@index([venueId, isVip])
}
```

- [ ] **Step 2: Add the back-relations**

In `model Venue` (starts line 156), add near the other list relations:

```prisma
  patrons Patron[]
```

In `model User` (starts line 17), add near the other list relations:

```prisma
  vipPatronsSet Patron[]
```

(No explicit `@relation` name needed — `Patron` only relates to `User` once, via `vipSetById`. Named relations are only required when a model has multiple relations to the same target.)

- [ ] **Step 3: Push schema to the database**

This repo uses `prisma db push`, not migrations (no migrations table).

Run: `cd ~/xiv-app/apps/web && pnpm db:push`
Expected: `Your database is now in sync with your Prisma schema.` — creates the `Patron` table.

- [ ] **Step 4: Regenerate the Prisma client**

Run: `cd ~/xiv-app/apps/web && pnpm postinstall` (or `npx prisma generate` if that script isn't present)
Expected: exits 0, `generated/prisma/client` updated with `Patron` types.

- [ ] **Step 5: Typecheck**

Run: `cd ~/xiv-app/apps/web && pnpm typecheck`
Expected: PASS (no consumers reference `Patron` yet, so this just confirms the schema itself is valid).

- [ ] **Step 6: Commit**

```bash
cd ~/xiv-app
git add apps/web/prisma/schema.prisma
git commit -m "feat(web): add Patron model with isVip flag"
```

---

## Task 2: Dashboard API route — toggle VIP status

**Files:**

- Create: `apps/web/app/api/venues/[venueId]/patrons/[patronId]/vip/route.ts`

Follows the exact pattern of `apps/web/app/api/venues/[venueId]/patron-logs/bulk-reclassify/route.ts` (session auth → venue lookup → OWNER/MANAGER membership check → zod body → prisma write → rate limit wrapper).

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const setVipSchema = z.object({
  isVip: z.boolean(),
})

export const PATCH = withRateLimit<{
  params: Promise<{ venueId: string; patronId: string }>
}>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { venueId, patronId } = await context.params

      const venue = await prisma.venue.findUnique({ where: { id: venueId } })
      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      const membership = await prisma.membership.findFirst({
        where: { userId: session.user.id, venueId: venue.id, status: "active" },
      })
      if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
        return NextResponse.json({ error: "Owner or Manager role required" }, { status: 403 })
      }

      const body = await request.json()
      const { isVip } = setVipSchema.parse(body)

      const patron = await prisma.patron.findFirst({
        where: { id: patronId, venueId: venue.id },
        select: { id: true },
      })
      if (!patron) {
        return NextResponse.json({ error: "Patron not found in this venue" }, { status: 404 })
      }

      const updated = await prisma.patron.update({
        where: { id: patronId },
        data: {
          isVip,
          vipSetAt: new Date(),
          vipSetById: session.user.id,
        },
      })

      return NextResponse.json({ id: updated.id, isVip: updated.isVip })
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      console.error("[patrons/vip] error:", err)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 30, window: "1 m" }
)
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/xiv-app/apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/web/app/api/venues/[venueId]/patrons/[patronId]/vip/route.ts
git commit -m "feat(web): add PATCH endpoint to toggle patron VIP status"
```

---

## Task 3: Backfill/upsert `Patron` rows on the patron-logs page, wire `isVip` into `PatronProfile`

**Files:**

- Modify: `apps/web/app/dashboard/[slug]/patron-logs/page.tsx`

The "profiles" tab currently builds `PatronProfile[]` purely from `PatronLog.groupBy`. It needs to also ensure a `Patron` row exists for each distinct `(characterName, world)` pair and pull in `id`/`isVip`.

- [ ] **Step 1: Add the upsert + fetch after the existing `grouped` query**

In the `if (activeTab === "profiles")` block (currently lines 51–87), after the `grouped` query resolves and before building `spendGroups`, insert:

```typescript
// Ensure a canonical Patron row exists for every distinct character
// seen in this venue's logs, then pull isVip/id for the profile list.
const distinctPairs = grouped
  .filter((r) => r.characterName)
  .map((r) => ({ characterName: r.characterName!, world: r.world ?? "" }))

if (distinctPairs.length > 0) {
  await prisma.patron.createMany({
    data: distinctPairs.map((p) => ({
      venueId: venue.id,
      characterName: p.characterName,
      world: p.world,
    })),
    skipDuplicates: true,
  })
}

const patronRecords = await prisma.patron.findMany({
  where: {
    venueId: venue.id,
    OR: distinctPairs.map((p) => ({ characterName: p.characterName, world: p.world })),
  },
  select: { id: true, characterName: true, world: true, isVip: true },
})
const patronMap = new Map(patronRecords.map((p) => [`${p.characterName}|${p.world}`, p]))
```

- [ ] **Step 2: Include `id`/`isVip` in the mapped `patronProfiles`**

Replace the existing `patronProfiles = grouped...map(...)` block (lines 77–86):

```typescript
patronProfiles = grouped
  .filter((r) => r.characterName)
  .sort((a, b) => b._count._all - a._count._all)
  .map((r) => {
    const key = `${r.characterName}|${r.world ?? ""}`
    const patron = patronMap.get(key)
    return {
      id: patron?.id ?? "",
      characterName: r.characterName!,
      world: r.world ?? "",
      visits: r._count._all,
      lastSeen: (r._max.timestamp ?? new Date()).toISOString(),
      totalSpent: spendMap.get(r.characterName!.toLowerCase().trim()) ?? 0,
      isVip: patron?.isVip ?? false,
    }
  })
```

- [ ] **Step 3: Pass `venueId` to the table component**

Find the render call `<PatronProfilesTable profiles={patronProfiles} />` (line 193) and change to:

```tsx
<PatronProfilesTable profiles={patronProfiles} venueId={venue.id} canSetVip={["OWNER", "MANAGER"].includes(userRole)} />
```

(`userRole` is already computed at line 43. Page-level access is already gated to OWNER/MANAGER at line 44, so `canSetVip` is always `true` in practice today — passed explicitly so the prop isn't silently assumed if that page-level gate ever loosens.)

- [ ] **Step 4: Typecheck (will fail until Task 4 updates the component's prop types — expected)**

Run: `cd ~/xiv-app/apps/web && pnpm typecheck`
Expected: FAIL — `Property 'id'/'isVip' is missing in type... PatronProfile`, `venueId`/`canSetVip` not assignable. This confirms the page-side wiring compiles against the _new_ shape; Task 4 makes it match.

- [ ] **Step 5: Commit**

```bash
cd ~/xiv-app
git add apps/web/app/dashboard/[slug]/patron-logs/page.tsx
git commit -m "feat(web): upsert Patron rows and wire isVip into patron profiles"
```

---

## Task 4: Replace the auto-computed VIP tag with the manual `isVip` flag, add toggle

**Files:**

- Modify: `apps/web/components/patron-profiles-table.tsx`
- Test: `apps/web/components/patron-profiles-table.test.ts`

The existing `patronTag()` computes `"vip"` from `visits >= 10`. Per user decision, that auto-tier is unused in this table and gets replaced entirely by the staff-set flag. The `"vip"` case simply becomes `isVip`-driven; `"regular"`/`"new"` tiers (3+ visits / under 3) are untouched.

- [ ] **Step 1: Write the failing test for the updated `patronTag`**

`patronTag` isn't currently exported. Export it as part of this change, then test it.

```typescript
// apps/web/components/patron-profiles-table.test.ts
import { describe, it, expect } from "vitest"
import { patronTag } from "./patron-profiles-table"

describe("patronTag", () => {
  it("returns vip when isVip is true, regardless of visit count", () => {
    expect(patronTag(1, true)).toBe("vip")
  })

  it("returns regular for 3+ visits when not VIP", () => {
    expect(patronTag(3, false)).toBe("regular")
    expect(patronTag(10, false)).toBe("regular")
  })

  it("returns new for under 3 visits when not VIP", () => {
    expect(patronTag(0, false)).toBe("new")
    expect(patronTag(2, false)).toBe("new")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/xiv-app/apps/web && pnpm test patron-profiles-table`
Expected: FAIL — `patronTag` is not exported from `./patron-profiles-table` (or signature mismatch, since it currently takes only `visits`).

- [ ] **Step 3: Update `PatronProfile` type and `patronTag`**

```typescript
export type PatronProfile = {
  id: string
  characterName: string
  world: string
  visits: number
  lastSeen: string // ISO
  totalSpent?: number
  isVip: boolean
}

export function patronTag(visits: number, isVip: boolean): "vip" | "regular" | "new" {
  if (isVip) return "vip"
  if (visits >= 3) return "regular"
  return "new"
}
```

- [ ] **Step 4: Update every call site of `patronTag` in the component to pass `isVip`**

Three call sites: the `counts` object, the `visible` filter, and inside the row map.

```typescript
const counts = {
  all: profiles.length,
  vip: profiles.filter((p) => patronTag(p.visits, p.isVip) === "vip").length,
  regular: profiles.filter((p) => patronTag(p.visits, p.isVip) === "regular").length,
  new: profiles.filter((p) => patronTag(p.visits, p.isVip) === "new").length,
}

const visible = profiles.filter((p) => {
  if (activeTab !== "all" && patronTag(p.visits, p.isVip) !== activeTab) return false
  if (
    search &&
    !p.characterName.toLowerCase().includes(search.toLowerCase()) &&
    !p.world.toLowerCase().includes(search.toLowerCase())
  )
    return false
  return true
})
```

And inside the row map, `const t = patronTag(p.visits)` becomes `const t = patronTag(p.visits, p.isVip)`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ~/xiv-app/apps/web && pnpm test patron-profiles-table`
Expected: PASS (3 tests)

- [ ] **Step 6: Add `venueId`/`canSetVip` props and a toggle control on each row**

Change the component signature and add local optimistic state + a toggle handler:

```typescript
export function PatronProfilesTable({
  profiles,
  venueId,
  canSetVip,
}: {
  profiles: PatronProfile[]
  venueId: string
  canSetVip: boolean
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [search, setSearch] = useState("")
  const [localProfiles, setLocalProfiles] = useState(profiles)

  async function toggleVip(patron: PatronProfile) {
    if (!canSetVip || !patron.id) return
    const nextIsVip = !patron.isVip
    setLocalProfiles((prev) =>
      prev.map((p) => (p.id === patron.id ? { ...p, isVip: nextIsVip } : p))
    )
    try {
      const res = await fetch(`/api/venues/${venueId}/patrons/${patron.id}/vip`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVip: nextIsVip }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      // Roll back on failure
      setLocalProfiles((prev) =>
        prev.map((p) => (p.id === patron.id ? { ...p, isVip: patron.isVip } : p))
      )
    }
  }
```

Replace remaining references to `profiles` in the body (the `counts`/`visible` computations and the `profiles.length` KPI) with `localProfiles`.

- [ ] **Step 7: Make the VIP tag clickable to toggle, in the row's Tags cell**

Replace:

```tsx
{
  t === "vip" && <span className="tag vip">VIP</span>
}
```

with:

```tsx
{
  t === "vip" && <span className="tag vip">VIP</span>
}
{
  canSetVip && (
    <button type="button" onClick={() => toggleVip(p)} className="tag neutral" style={{ cursor: "pointer" }}>
      {t === "vip" ? "Unmark VIP" : "Mark VIP"}
    </button>
  )
}
```

- [ ] **Step 8: Update the row map to iterate `localProfiles`-derived `visible` (already handled by Step 6's rename) — verify no stray `profiles` references remain**

Run: `grep -n "\bprofiles\b" apps/web/components/patron-profiles-table.tsx` from `~/xiv-app`
Expected: only the destructured prop `profiles` in the function signature and the `useState(profiles)` initializer remain — every other usage is `localProfiles`.

- [ ] **Step 9: Typecheck**

Run: `cd ~/xiv-app/apps/web && pnpm typecheck`
Expected: PASS (this also resolves the Task 3 Step 4 failure, since the component now matches the page's prop shape).

- [ ] **Step 10: Run full web test suite**

Run: `cd ~/xiv-app/apps/web && pnpm test`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
cd ~/xiv-app
git add apps/web/components/patron-profiles-table.tsx apps/web/components/patron-profiles-table.test.ts
git commit -m "feat(web): drive VIP tag from staff-set flag, add toggle control"
```

---

## Task 5: Plugin-facing GET endpoint for VIP list

**Files:**

- Create: `apps/web/app/api/plugin/patrons/vip/route.ts`

Follows the exact pattern of `apps/web/app/api/plugin/roles/route.ts` (API-key auth, IP + key rate limits, `auth.venues.includes(venueId)` scoping).

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { validateApiKey } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/plugin/patrons/vip?venueId=…
 *
 * Returns the characterName/world pairs flagged VIP at this venue, for
 * the plugin to badge its in-game guest list. Fetched once per
 * venue-select on the plugin side (see AutoLoadXivAppDataAsync /
 * LoadVenueDataWithFeedbackAsync) — not a live feed.
 */
export async function GET(request: NextRequest) {
  try {
    const __ipLimited = await enforcePluginIpRateLimit(request)
    if (__ipLimited) return __ipLimited

    const apiKey = request.headers.get("x-api-key")
    if (!apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, "read")
    if (limited) return limited

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get("venueId")
    if (!venueId || !auth.venues.includes(venueId)) {
      return NextResponse.json({ error: "Invalid venue" }, { status: 400 })
    }

    const vipPatrons = await prisma.patron.findMany({
      where: { venueId, isVip: true },
      select: { characterName: true, world: true },
    })

    return NextResponse.json({ vipPatrons })
  } catch (error) {
    console.error("[Plugin API] Error fetching VIP patrons:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/xiv-app/apps/web && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd ~/xiv-app
git add apps/web/app/api/plugin/patrons/vip/route.ts
git commit -m "feat(web): add GET /api/plugin/patrons/vip for plugin VIP badge fetch"
```

---

## Task 6: Plugin — VIP models and API client method

**Files:**

- Modify: `VenueManager/XIVAppApiModels.cs`
- Modify: `VenueManager/XIVAppVenueApi.cs`

- [ ] **Step 1: Add `VipPatron`/`VipPatronsResponse` models**

In `XIVAppApiModels.cs`, add after `RolesResponse` (after line 65):

```csharp
  public class VipPatron
  {
    [JsonPropertyName("characterName")]
    public string CharacterName { get; set; } = "";

    [JsonPropertyName("world")]
    public string World { get; set; } = "";
  }

  public class VipPatronsResponse
  {
    [JsonPropertyName("vipPatrons")]
    public List<VipPatron> VipPatrons { get; set; } = new();
  }
```

- [ ] **Step 2: Add `GetVipPatronsAsync` to `XIVAppVenueApi.cs`**

Add after `GetRolesAsync` (after line 79), following its exact structure:

```csharp
    public async Task<List<VipPatron>> GetVipPatronsAsync(string venueId)
    {
      if (!_client.IsConfigured) return new List<VipPatron>();
      try
      {
        var response = await _client.Http.GetAsync($"{_client.BaseUrl}/api/plugin/patrons/vip?venueId={venueId}");
        if (!response.IsSuccessStatusCode)
        {
          Plugin.Log.Warning($"Failed to get VIP patrons: {response.StatusCode}");
          return new List<VipPatron>();
        }
        var result = await response.Content.ReadFromJsonAsync<VipPatronsResponse>();
        return result?.VipPatrons ?? new List<VipPatron>();
      }
      catch (Exception ex)
      {
        Plugin.Log.Warning($"Error fetching VIP patrons: {ex.Message}");
        return new List<VipPatron>();
      }
    }
```

- [ ] **Step 3: Build the plugin**

Run: `cd ~/VenueManager && dotnet build`
Expected: `Build succeeded.` — confirm with the user before running this, since it touches the live dev-plugin path (per prior session convention).

- [ ] **Step 4: Commit**

```bash
cd ~/VenueManager
git add VenueManager/XIVAppApiModels.cs VenueManager/XIVAppVenueApi.cs
git commit -m "feat: add VipPatron model and GetVipPatronsAsync client method"
```

---

## Task 7: Plugin — cache VIP list, fetch on startup and venue reselect

**Files:**

- Modify: `VenueManager/Plugin.cs`
- Modify: `VenueManager/UI/Tabs/SettingsTab.cs`

- [ ] **Step 1: Add the cache field in `Plugin.cs`**

Near `public List<Role> xivAppRoles = new();` (line 89), add:

```csharp
    public List<VipPatron> xivAppVipPatrons = new();
```

- [ ] **Step 2: Fetch it in `AutoLoadXivAppDataAsync`**

In `Plugin.cs`, after the services fetch block (after line 152, the `Log.Information("Auto-loaded {Count} service(s)...")` line), add:

```csharp
        xivAppVipPatrons = await xivAppClient.Venue.GetVipPatronsAsync(target.Id);
        Log.Information("Auto-loaded {Count} VIP patron(s) for venue {VenueId}", xivAppVipPatrons.Count, target.Id);
```

- [ ] **Step 3: Fetch it in `SettingsTab.cs`'s `LoadVenueDataWithFeedbackAsync`**

Replace the method body (lines 687–696):

```csharp
  private async Task LoadVenueDataWithFeedbackAsync(string venueId, string venueName)
  {
    xivAppStatus = $"Loading roles + services for {venueName}…";
    xivAppStatusColor = Colors.XivOverlay0;

    await FetchXivAppRolesAsync(venueId);
    await FetchXivAppServicesAsync(venueId);
    await FetchXivAppVipPatronsAsync(venueId);

    xivAppStatus = $"✓ Loaded: {plugin.xivAppRoles.Count} roles, {plugin.availableServices.Count} services, {plugin.xivAppVipPatrons.Count} VIPs";
    xivAppStatusColor = StatusOk;
  }

  private async Task FetchXivAppVipPatronsAsync(string venueId)
  {
    try {
      if (plugin.xivAppClient == null || !plugin.xivAppClient.IsConfigured) return;

      var vipPatrons = await plugin.xivAppClient.Venue.GetVipPatronsAsync(venueId);
      plugin.xivAppVipPatrons = vipPatrons;
      Plugin.Log.Information("Fetched {Count} VIP patron(s) for venue {VenueId}", vipPatrons.Count, venueId);
    } catch (Exception ex) {
      Plugin.Log.Error("Failed to fetch VIP patrons: {0}", ex.Message);
    }
  }
```

- [ ] **Step 4: Build the plugin**

Run: `cd ~/VenueManager && dotnet build` (confirm with the user first — live dev-plugin path)
Expected: `Build succeeded.`

- [ ] **Step 5: Commit**

```bash
cd ~/VenueManager
git add VenueManager/Plugin.cs VenueManager/UI/Tabs/SettingsTab.cs
git commit -m "feat: fetch and cache VIP patron list on startup and venue reselect"
```

---

## Task 8: Plugin — VIP badge on the live guest list

**Files:**

- Modify: `VenueManager/UI/Widgets/GuestListWidget.cs`

- [ ] **Step 1: Add a lookup helper and use it in the name cell**

Add a small private method near the top of the class (after the constructor, before `draw`):

```csharp
  private bool isVip(Player player)
  {
    return plugin.xivAppVipPatrons.Any(v => v.CharacterName == player.Name && v.World == player.WorldName);
  }
```

Add `using System.Linq;` if not already present — it already is (line 2).

- [ ] **Step 2: Use it in `drawGuestTable`, in the Name column**

Replace:

```csharp
        ImGui.TableNextColumn();
        ImGui.TextColored(playerColor, player.Value.Name);
        if (ImGui.IsItemClicked()) {
          plugin.chatPlayerLink(player.Value);
        }
```

with:

```csharp
        ImGui.TableNextColumn();
        if (isVip(player.Value)) {
          ImGui.TextColored(VenueManager.UI.Colors.XivGold, "★ ");
          ImGui.SameLine(0, 0);
        }
        ImGui.TextColored(playerColor, player.Value.Name);
        if (ImGui.IsItemClicked()) {
          plugin.chatPlayerLink(player.Value);
        }
```

- [ ] **Step 3: Build the plugin**

Run: `cd ~/VenueManager && dotnet build` (confirm with the user first)
Expected: `Build succeeded.`

- [ ] **Step 4: Commit**

```bash
cd ~/VenueManager
git add VenueManager/UI/Widgets/GuestListWidget.cs
git commit -m "feat: show VIP star badge in live guest list"
```

---

## Task 9: Plugin — VIP entry chat alert

**Files:**

- Modify: `VenueManager/Plugin.cs`

- [ ] **Step 1: Add a VIP check helper**

Near `showGuestEnterChatAlert` (before it, so it's in scope), add:

```csharp
    private bool isVipPatron(Player player)
    {
      return xivAppVipPatrons.Any(v => v.CharacterName == player.Name && v.World == player.WorldName);
    }
```

- [ ] **Step 2: Prefix the chat message for VIP entries**

In `showGuestEnterChatAlert` (around line 1246, right before `// Show text alert for guests`), add:

```csharp
      // Show text alert for guests
      if (this.Configuration.showPluginNameInChat) messageBuilder.AddText($"[{Name}] ");

      if (isVipPatron(player))
      {
        messageBuilder.AddText("★ VIP ");
      }

      // Player Color
```

(This slots between the existing `if (this.Configuration.showPluginNameInChat)` line and the `// Player Color` comment — same snooze/`showChatAlerts` gating already applies above this point in the method, so no bypass is introduced.)

- [ ] **Step 3: Build the plugin**

Run: `cd ~/VenueManager && dotnet build` (confirm with the user first)
Expected: `Build succeeded.`

- [ ] **Step 4: Commit**

```bash
cd ~/VenueManager
git add VenueManager/Plugin.cs
git commit -m "feat: prefix VIP patron entry chat alerts"
```

---

## Task 10: Manual verification

**No automated test covers the full flow end-to-end** (no route-level or C# test infra in this repo, per the Tech Stack note above). Verify manually:

- [ ] **Step 1: Dashboard flow**

1. Load `/dashboard/<slug>/patron-logs` as an OWNER/MANAGER.
2. Confirm the Patron Profiles tab loads without error (Patron rows get created on this load per Task 3).
3. Click "Mark VIP" on a row — confirm the row re-renders with the `VIP` tag and button flips to "Unmark VIP" without a page reload.
4. Refresh the page — confirm the VIP flag persisted (Task 2's PATCH wrote to the DB).

- [ ] **Step 2: Plugin flow**

1. In Settings tab, reselect the venue (or restart the plugin) to trigger `LoadVenueDataWithFeedbackAsync` / `AutoLoadXivAppDataAsync`.
2. Confirm the status line shows a VIP count.
3. Have the VIP-flagged character enter the venue in-game — confirm the guest list row shows the gold star and the chat alert shows "★ VIP {name} has entered {venue}".
4. Have a non-VIP character enter — confirm no star, normal chat alert.
