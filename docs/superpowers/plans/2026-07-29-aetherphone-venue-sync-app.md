# Aetherphone "Venue Sync" App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-class "Venue Sync" app inside the Aetherphone Dalamud plugin covering member clock in/out, shift claiming, sales logging, and account setup, reusing xivvenuemanager.com's existing `/api/plugin/*` endpoints plus one new small backend endpoint for character linking.

**Architecture:** Two codebases. (1) `~/plugin-research/FFXIV-Aetherphone` — new `Core/VenueSync/` (data/API layer) + `Apps/VenueSync/` (ImGui UI layer), following the same split as the existing `Core/Venues`/`Apps/Venues`, registered into `AppRegistry.BuildDefault`. Stack navigation via `ViewRouter<VenueSyncRoute>`. (2) `/home/ehno/xiv-app` (apps/web) — one new `POST /api/plugin/characters` route, x-api-key authenticated, independent of and not blocking the Aetherphone work.

**Tech Stack:** C# / Dalamud / ImGui.NET (Aetherphone side), `System.Text.Json` source-gen serialization; Next.js 16 API route + Prisma (xiv-app side).

---

## File Structure

```
~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/
  Core/VenueSync/
    VenueSyncApiModels.cs      — DTOs (mirrors ~/VenueManager's XIVAppApiModels.cs shapes)
    VenueSyncJsonContext.cs    — System.Text.Json source-gen context for the DTOs
    VenueSyncApiClient.cs      — thin HTTP wrapper over HttpService, one method per endpoint
    VenueSyncState.cs          — in-memory session state (current venue, shifts, session sale totals)
  Apps/VenueSync/
    VenueSyncRoute.cs          — route enum for ViewRouter
    VenueSyncApp.cs            — IPhoneApp implementation, router wiring, Draw dispatch
    VenueSyncApp.Dashboard.cs  — dashboard/root screen (partial class)
    VenueSyncApp.Shifts.cs     — shifts screen (partial class)
    VenueSyncApp.Sales.cs      — sales screen (partial class)
    VenueSyncApp.Settings.cs   — settings screen (partial class)
    ShiftRow.cs                — static row-card component for a single shift
    SaleSummaryRow.cs          — static row for the "this session" summary line

/home/ehno/xiv-app/apps/web/
  app/api/plugin/characters/route.ts   — new POST endpoint
  prisma/schema.prisma                 — no changes (UserCharacter already exists)
```

`VenueSyncApiClient` and the DTOs deliberately mirror `~/VenueManager`'s `XIVAppApiModels.cs`/`XIVAppShiftApi.cs`/`XIVAppVenueApi.cs`/`XIVAppPatronApi.cs` field-for-field — same server, same JSON contract, just a different HTTP client implementation (Aetherphone's `HttpService` + source-gen JSON instead of whatever `~/VenueManager` uses).

---

## Task 1: Backend — `POST /api/plugin/characters`

**Files:**
- Create: `/home/ehno/xiv-app/apps/web/app/api/plugin/characters/route.ts`

This task is fully independent of every other task in this plan — do it first or last, doesn't matter, and it unblocks nothing else (Task 8's Settings screen calls it, but can be stubbed/tested against a deployed dev version).

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { validateApiKey } from "@/lib/api/plugin-auth"
import { enforcePluginRateLimit, enforcePluginIpRateLimit } from "@/lib/api/plugin-rate-limit"

/**
 * POST /api/plugin/characters
 *
 * Links the calling API key's owner to an FFXIV character (name + world).
 * Unlike POST /api/user-characters (session-auth, manual web form), this is
 * x-api-key authenticated so a Dalamud plugin can push the locally-detected
 * character without the member re-logging into the website.
 *
 * Body: { characterName: string, world: string }
 */
export async function POST(request: NextRequest) {
  try {
    const ipLimited = await enforcePluginIpRateLimit(request)
    if (ipLimited) return ipLimited

    const apiKey = request.headers.get("x-api-key")
    if (!apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const auth = await validateApiKey(apiKey)
    if (!auth || !auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const limited = await enforcePluginRateLimit(apiKey, "write")
    if (limited) return limited

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const characterName = (body.characterName ?? "").trim()
    const world = (body.world ?? "").trim()
    if (!characterName || !world) {
      return NextResponse.json(
        { error: "characterName and world are required" },
        { status: 400 }
      )
    }

    const existing = await prisma.userCharacter.findUnique({
      where: { characterName_world: { characterName, world } },
    })

    if (existing && existing.userId !== auth.userId) {
      return NextResponse.json(
        { error: "That character is already linked to a different account" },
        { status: 409 }
      )
    }

    if (existing) {
      // Already linked to this same user — idempotent no-op.
      return NextResponse.json({
        character: {
          id: existing.id,
          characterName: existing.characterName,
          world: existing.world,
          isPrimary: existing.isPrimary,
        },
      })
    }

    const created = await prisma.userCharacter.create({
      data: { userId: auth.userId, characterName, world },
      select: { id: true, characterName: true, world: true, isPrimary: true },
    })

    return NextResponse.json({ character: created }, { status: 201 })
  } catch (error) {
    console.error("Error linking character:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

Note: `UserCharacter.id` has `@default(cuid())` (`prisma/schema.prisma:98`) — omit `id` from `data:` and let Prisma generate it, unlike the session-auth route which uses `nanoid()` explicitly. Follow the schema default here since there's no reason to diverge.

- [ ] **Step 2: Verify the Prisma unique-constraint lookup name**

Run: `cd /home/ehno/xiv-app/apps/web && grep -A2 "model UserCharacter" prisma/schema.prisma`

Expected: confirms `@@unique([characterName, world])` — Prisma's generated compound-key name is `characterName_world` (field names joined with `_`, alphabetical-by-declaration-order not alphabetical-sort). If the generated client uses a different compound name, adjust `findUnique`'s `where` key to match (check `node_modules/.prisma/client/index.d.ts` for the exact `UserCharacterWhereUniqueInput` type if unsure).

- [ ] **Step 3: Manual verification against local dev**

Start the dev server if not already running:

```bash
cd /home/ehno/xiv-app/apps/web && npm run dev
```

Get a real API key value from the local dev DB (or use an existing one from `api_keys` table via the SSH-tunneled DB per this project's established access pattern), then:

```bash
curl -s -X POST http://localhost:3000/api/plugin/characters \
  -H "Content-Type: application/json" \
  -H "x-api-key: vm_..." \
  -d '{"characterName":"Test Character","world":"Zalera"}' | python3 -m json.tool
```

Expected: `201` with `{"character": {"id": "...", "characterName": "Test Character", "world": "Zalera", "isPrimary": false}}`.

Run the same command again — expected: `200` (not `201`) with the same character, confirming the idempotent-no-op path.

Run it a third time with a *different* `x-api-key` belonging to a different user but the same `characterName`/`world` — expected: `409` with `{"error": "That character is already linked to a different account"}`.

- [ ] **Step 4: Commit**

```bash
cd /home/ehno/xiv-app
git add apps/web/app/api/plugin/characters/route.ts
git commit -m "feat(plugin-api): add POST /api/plugin/characters for x-api-key-authenticated character linking"
```

---

## Task 2: Core/VenueSync — DTOs and JSON context

**Files:**
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Core/VenueSync/VenueSyncApiModels.cs`
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Core/VenueSync/VenueSyncJsonContext.cs`

- [ ] **Step 1: Write the DTOs**

Mirrors `~/VenueManager`'s `XIVAppApiModels.cs` field-for-field (same server, same wire format), plus the new `LinkCharacterRequest`/`LinkCharacterResponse` for Task 1's endpoint.

```csharp
using System.Text.Json.Serialization;

namespace Aetherphone.Core.VenueSync;

internal sealed class VenueSyncShift
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("scheduledStart")] public string ScheduledStart { get; set; } = "";
    [JsonPropertyName("scheduledEnd")] public string ScheduledEnd { get; set; } = "";
    [JsonPropertyName("actualStart")] public string? ActualStart { get; set; }
    [JsonPropertyName("actualEnd")] public string? ActualEnd { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = "";
    [JsonPropertyName("notes")] public string? Notes { get; set; }
}

internal sealed class VenueSyncOpenShift
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("scheduledStart")] public string ScheduledStart { get; set; } = "";
    [JsonPropertyName("scheduledEnd")] public string ScheduledEnd { get; set; } = "";
    [JsonPropertyName("roleName")] public string? RoleName { get; set; }
}

internal sealed class VenueSyncShiftsResponse
{
    [JsonPropertyName("shifts")] public List<VenueSyncShift> Shifts { get; set; } = new();
    [JsonPropertyName("openShifts")] public List<VenueSyncOpenShift> OpenShifts { get; set; } = new();
}

internal sealed class VenueSyncClockResult
{
    [JsonPropertyName("success")] public bool Success { get; set; }
    [JsonPropertyName("error")] public string? Error { get; set; }
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("hoursWorked")] public double? HoursWorked { get; set; }
}

internal sealed class VenueSyncShiftIdRequest
{
    [JsonPropertyName("shiftId")] public string ShiftId { get; set; } = "";
}

internal sealed class VenueSyncService
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("price")] public string Price { get; set; } = "";
    [JsonPropertyName("category")] public string? Category { get; set; }
}

internal sealed class VenueSyncServicesResponse
{
    [JsonPropertyName("services")] public List<VenueSyncService> Services { get; set; } = new();
    [JsonPropertyName("userRole")] public string? UserRole { get; set; }
}

internal sealed class VenueSyncTransactionRequest
{
    [JsonPropertyName("venueId")] public string VenueId { get; set; } = "";

    [JsonPropertyName("serviceId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ServiceId { get; set; }

    [JsonPropertyName("amount")] public decimal Amount { get; set; }

    [JsonPropertyName("customerName")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CustomerName { get; set; }

    [JsonPropertyName("notes")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Notes { get; set; }
}

internal sealed class VenueSyncTransactionResult
{
    [JsonPropertyName("success")] public bool Success { get; set; }
    [JsonPropertyName("error")] public string? Error { get; set; }
}

internal sealed class VenueSyncVenue
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("slug")] public string Slug { get; set; } = "";
    [JsonPropertyName("role")] public string Role { get; set; } = "";
}

internal sealed class VenueSyncVenuesResponse
{
    [JsonPropertyName("venues")] public List<VenueSyncVenue> Venues { get; set; } = new();
}

internal sealed class VenueSyncLinkCharacterRequest
{
    [JsonPropertyName("characterName")] public string CharacterName { get; set; } = "";
    [JsonPropertyName("world")] public string World { get; set; } = "";
}

internal sealed class VenueSyncCharacter
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("characterName")] public string CharacterName { get; set; } = "";
    [JsonPropertyName("world")] public string World { get; set; } = "";
    [JsonPropertyName("isPrimary")] public bool IsPrimary { get; set; }
}

internal sealed class VenueSyncLinkCharacterResponse
{
    [JsonPropertyName("character")] public VenueSyncCharacter? Character { get; set; }
    [JsonPropertyName("error")] public string? Error { get; set; }
}
```

- [ ] **Step 2: Write the source-gen JSON context**

`HttpService.GetJsonAsync<T>`/`PostJsonAsync<TRequest,TResponse>` require `JsonTypeInfo<T>` (AOT-safe source-gen, per `VenueJsonContext`'s existing precedent — grep `Core/Venues/` for the exact file name and copy its `[JsonSerializable]` attribute style).

```csharp
using System.Text.Json.Serialization;

namespace Aetherphone.Core.VenueSync;

[JsonSourceGenerationOptions(PropertyNameCaseInsensitive = true)]
[JsonSerializable(typeof(VenueSyncShiftsResponse))]
[JsonSerializable(typeof(VenueSyncClockResult))]
[JsonSerializable(typeof(VenueSyncShiftIdRequest))]
[JsonSerializable(typeof(VenueSyncServicesResponse))]
[JsonSerializable(typeof(VenueSyncTransactionRequest))]
[JsonSerializable(typeof(VenueSyncTransactionResult))]
[JsonSerializable(typeof(VenueSyncVenuesResponse))]
[JsonSerializable(typeof(VenueSyncLinkCharacterRequest))]
[JsonSerializable(typeof(VenueSyncLinkCharacterResponse))]
internal partial class VenueSyncJsonContext : JsonSerializerContext
{
}
```

- [ ] **Step 3: Build**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: builds clean. The source generator runs at compile time — any DTO shape typo (e.g. mismatched `JsonPropertyName`) still compiles fine here since it's structural, not validated until Task 3's live calls.

- [ ] **Step 4: Commit**

```bash
cd ~/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Core/VenueSync/VenueSyncApiModels.cs src/Aetherphone/Core/VenueSync/VenueSyncJsonContext.cs
git commit -m "feat(venue-sync): add DTOs and JSON source-gen context"
```

---

## Task 3a: HttpService — add x-api-key header support

**Discovered during implementation, not anticipated in the original design:** `HttpService`'s only auth mechanism is `bearer` → sent as `Authorization: Bearer <value>` (`Core/Net/HttpService.cs:295-306`, `ApplyHeaders`). The xivvenuemanager.com `/api/plugin/*` endpoints authenticate via a plain `x-api-key` header (confirmed against `app/api/plugin/venues/route.ts` and siblings), not Bearer. No existing Aetherphone app calls an x-api-key-authenticated API through `HttpService` — Venues/Aethernet only hit public unauthenticated third-party APIs. This is a small, additive change to shared infrastructure: a new optional `apiKey` parameter threaded through the two methods Venue Sync actually needs (`GetJsonAsync`, `PostJsonAsync`) down to `ApplyHeaders`, defaulting to `null` so every existing caller is unaffected.

**Files:**
- Modify: `src/Aetherphone/Core/Net/HttpService.cs`

- [ ] **Step 1: Add the parameter to `ApplyHeaders`**

```csharp
private static void ApplyHeaders(HttpRequestMessage request, string? bearer, string? appScope, string? apiKey = null)
{
    if (!string.IsNullOrEmpty(bearer))
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
    if (!string.IsNullOrEmpty(appScope))
        request.Headers.TryAddWithoutValidation("X-Aep-App", appScope);
    if (!string.IsNullOrEmpty(apiKey))
        request.Headers.TryAddWithoutValidation("x-api-key", apiKey);
}
```

- [ ] **Step 2: Thread `apiKey` through `GetJsonAsync` and `PostJsonAsync` down to `SendForJsonAsync`/`SendJsonAsync`**

Add `string? apiKey = null` as a new optional trailing parameter on `GetJsonAsync<T>` (`HttpService.cs:89-94`), `PostJsonAsync<TRequest,TResponse>` (`:96-101`), `SendJsonAsync<TRequest,TResponse>` (`:103-111`), and `SendForJsonAsync<T>` (`:228-...`) — pass it straight through each call chain to the final `ApplyHeaders(request, bearer, appScope, apiKey)` call at `:237`. Also update the `GetJsonAsync` call site at `:93`'s `SendForJsonAsync(request, typeInfo, bearer, onStatus, appScope, token)` to include `apiKey`.

Do NOT modify `PutBytesAsync`, `SendJsonForStatusAsync`, `SendAsync`, or `RequestJsonAsync` — Venue Sync doesn't need those paths, and touching every overload for a feature that only needs two of them is unnecessary surface area.

- [ ] **Step 3: Build**

```bash
cd /home/ehno/plugin-research/FFXIV-Aetherphone && dotnet build 2>&1 | tail -60
```

Expected: 0 errors. All existing call sites across the codebase call these methods without the new trailing optional parameter, so nothing else needs to change — confirm this by checking the build has no new errors outside `HttpService.cs` itself.

- [ ] **Step 4: Commit**

```bash
cd /home/ehno/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Core/Net/HttpService.cs
git commit -m "feat(http): add optional x-api-key header support to GetJsonAsync/PostJsonAsync"
```

---

## Task 3: Core/VenueSync — API client

**Files:**
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Core/VenueSync/VenueSyncApiClient.cs`

**Context:** wraps `HttpService` (constructed with `services.Http`, same DI pattern `VenuesApp` uses at `VenuesApp.cs:53-65`). Base URL and API key come from `Configuration` (Task 6 adds the fields). Every call passes the API key as the `bearer` parameter of `HttpService`'s methods — check `Core/Venues/VenuesService.cs`'s actual call site for whether `bearer` expects a raw key or an `Authorization: Bearer` prefix already applied internally; match whatever that file does exactly, since `HttpService` is shared infrastructure and Venue Sync must not reimplement auth-header formatting.

- [ ] **Step 1: Write the client**

```csharp
using System.Text.Json;
using Aetherphone.Core.Http;

namespace Aetherphone.Core.VenueSync;

internal sealed class VenueSyncApiClient
{
    private readonly HttpService http;
    private readonly Configuration configuration;

    public VenueSyncApiClient(HttpService http, Configuration configuration)
    {
        this.http = http;
        this.configuration = configuration;
    }

    private string BaseUrl => string.IsNullOrEmpty(configuration.VenueSyncServerUrl)
        ? "https://xivvenuemanager.com"
        : configuration.VenueSyncServerUrl;

    private string? ApiKey => string.IsNullOrEmpty(configuration.VenueSyncApiKey)
        ? null
        : configuration.VenueSyncApiKey;

    public Task<VenueSyncVenuesResponse?> GetVenuesAsync(CancellationToken token) =>
        http.GetJsonAsync($"{BaseUrl}/api/plugin/venues", VenueSyncJsonContext.Default.VenueSyncVenuesResponse,
            null, token, appScope: "venue-sync", apiKey: ApiKey);

    public Task<VenueSyncShiftsResponse?> GetShiftsAsync(string venueId, CancellationToken token) =>
        http.GetJsonAsync($"{BaseUrl}/api/plugin/shifts?venueId={Uri.EscapeDataString(venueId)}",
            VenueSyncJsonContext.Default.VenueSyncShiftsResponse, null, token, appScope: "venue-sync", apiKey: ApiKey);

    public Task<VenueSyncClockResult?> ClockInAsync(string shiftId, CancellationToken token) =>
        http.PostJsonAsync($"{BaseUrl}/api/plugin/shifts/clock-in", new VenueSyncShiftIdRequest { ShiftId = shiftId },
            VenueSyncJsonContext.Default.VenueSyncShiftIdRequest, VenueSyncJsonContext.Default.VenueSyncClockResult,
            null, token, appScope: "venue-sync", apiKey: ApiKey);

    public Task<VenueSyncClockResult?> ClockOutAsync(string shiftId, CancellationToken token) =>
        http.PostJsonAsync($"{BaseUrl}/api/plugin/shifts/clock-out", new VenueSyncShiftIdRequest { ShiftId = shiftId },
            VenueSyncJsonContext.Default.VenueSyncShiftIdRequest, VenueSyncJsonContext.Default.VenueSyncClockResult,
            null, token, appScope: "venue-sync", apiKey: ApiKey);

    public Task<VenueSyncClockResult?> ClaimShiftAsync(string shiftId, CancellationToken token) =>
        http.PostJsonAsync($"{BaseUrl}/api/plugin/shifts/claim", new VenueSyncShiftIdRequest { ShiftId = shiftId },
            VenueSyncJsonContext.Default.VenueSyncShiftIdRequest, VenueSyncJsonContext.Default.VenueSyncClockResult,
            null, token, appScope: "venue-sync", apiKey: ApiKey);

    public Task<VenueSyncServicesResponse?> GetServicesAsync(string venueId, CancellationToken token) =>
        http.GetJsonAsync($"{BaseUrl}/api/plugin/services?venueId={Uri.EscapeDataString(venueId)}",
            VenueSyncJsonContext.Default.VenueSyncServicesResponse, null, token, appScope: "venue-sync", apiKey: ApiKey);

    public Task<VenueSyncTransactionResult?> LogTransactionAsync(VenueSyncTransactionRequest request,
        CancellationToken token) =>
        http.PostJsonAsync($"{BaseUrl}/api/plugin/transactions", request,
            VenueSyncJsonContext.Default.VenueSyncTransactionRequest,
            VenueSyncJsonContext.Default.VenueSyncTransactionResult, null, token, appScope: "venue-sync", apiKey: ApiKey);

    public Task<VenueSyncLinkCharacterResponse?> LinkCharacterAsync(string characterName, string world,
        CancellationToken token) =>
        http.PostJsonAsync($"{BaseUrl}/api/plugin/characters",
            new VenueSyncLinkCharacterRequest { CharacterName = characterName, World = world },
            VenueSyncJsonContext.Default.VenueSyncLinkCharacterRequest,
            VenueSyncJsonContext.Default.VenueSyncLinkCharacterResponse, null, token, appScope: "venue-sync", apiKey: ApiKey);
}
```

- [ ] **Step 2: Build**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: fails to build until Task 6 adds `Configuration.VenueSyncServerUrl`/`VenueSyncApiKey`, and until `Core.Http` namespace/`HttpService` import path is confirmed correct — if the build errors on the `using Aetherphone.Core.Http;` line, grep `Core/Venues/VenuesService.cs`'s own `using` statements for the real namespace and fix this file to match. Also confirm `appScope` is a real optional parameter on `HttpService` (it was reported present at `HttpService.cs:89,96` in research — if the build disagrees, drop the argument).

Do not proceed past this step with a broken build — fix real compile errors before moving to Task 4. It's fine for this task's build to fail if it's *only* failing because `Configuration.VenueSyncServerUrl`/`VenueSyncApiKey` don't exist yet (Task 6 adds them) — note that as expected and move on; but any other error (namespace, missing method, wrong overload) must be fixed now.

- [ ] **Step 3: Commit**

```bash
cd ~/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Core/VenueSync/VenueSyncApiClient.cs
git commit -m "feat(venue-sync): add API client wrapping /api/plugin/* endpoints"
```

---

## Task 4: Core/VenueSync — session state

**Files:**
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Core/VenueSync/VenueSyncState.cs`

**Context:** Follows `VenuesService`'s `EnsureFresh(bool force)` + `Interlocked.CompareExchange` fire-and-forget-refresh pattern exactly (see Task 3 research: `VenuesService.cs` state machine). No local "am I clocked in" flag per the spec — every `EnsureFresh` re-fetches from the server.

- [ ] **Step 1: Write the state class**

```csharp
using Aetherphone.Core.VenueSync;

namespace Aetherphone.Core.VenueSync;

internal enum VenueSyncLoadState { Idle, Loading, Ready, Failed }

internal sealed class VenueSyncState
{
    private readonly VenueSyncApiClient client;
    private readonly Configuration configuration;

    private volatile VenueSyncLoadState shiftsState = VenueSyncLoadState.Idle;
    private int refreshing;
    private DateTime lastRefreshUtc = DateTime.MinValue;
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromSeconds(30);

    public VenueSyncShiftsResponse? Shifts { get; private set; }
    public string? LastError { get; private set; }
    public VenueSyncLoadState ShiftsState => shiftsState;

    // Session-only counters, reset on plugin reload — mirrors ~/VenueManager's
    // SessionSalesTotal/SessionSalesCount (Plugin.cs:474-475), intentionally not persisted.
    public int SessionSalesCount { get; private set; }
    public decimal SessionSalesTotal { get; private set; }

    public VenueSyncState(VenueSyncApiClient client, Configuration configuration)
    {
        this.client = client;
        this.configuration = configuration;
    }

    public void EnsureShiftsFresh(bool force)
    {
        if (string.IsNullOrEmpty(configuration.VenueSyncSelectedVenueId)) return;
        if (Volatile.Read(ref refreshing) == 1) return;

        var stale = shiftsState == VenueSyncLoadState.Idle ||
                    DateTime.UtcNow - lastRefreshUtc >= RefreshInterval;
        if (!force && !stale) return;
        if (Interlocked.CompareExchange(ref refreshing, 1, 0) != 0) return;

        if (shiftsState != VenueSyncLoadState.Ready) shiftsState = VenueSyncLoadState.Loading;
        _ = RefreshShiftsAsync(configuration.VenueSyncSelectedVenueId);
    }

    private async Task RefreshShiftsAsync(string venueId)
    {
        try
        {
            var response = await client.GetShiftsAsync(venueId, CancellationToken.None);
            if (response != null)
            {
                Shifts = response;
                shiftsState = VenueSyncLoadState.Ready;
                LastError = null;
            }
            else
            {
                shiftsState = VenueSyncLoadState.Failed;
                LastError = "Failed to load shifts.";
            }
        }
        catch (Exception exception)
        {
            shiftsState = VenueSyncLoadState.Failed;
            LastError = exception.Message;
        }
        finally
        {
            lastRefreshUtc = DateTime.UtcNow;
            Interlocked.Exchange(ref refreshing, 0);
        }
    }

    public void RecordSale(decimal amount)
    {
        SessionSalesCount++;
        SessionSalesTotal += amount;
    }
}
```

- [ ] **Step 2: Build**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: still fails on the missing `Configuration` fields (Task 6) — confirm no *other* new errors introduced by this file specifically.

- [ ] **Step 3: Commit**

```bash
cd ~/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Core/VenueSync/VenueSyncState.cs
git commit -m "feat(venue-sync): add session state with fetch-on-stale shift caching"
```

---

## Task 5: Apps/VenueSync — route enum and row components

**Files:**
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Apps/VenueSync/VenueSyncRoute.cs`
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Apps/VenueSync/ShiftRow.cs`
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Apps/VenueSync/SaleSummaryRow.cs`

- [ ] **Step 1: Write the route enum**

Simple enum, not a struct-with-payload like `VenueRoute` (which carries a `Venue` object for its `Detail` screen) — Venue Sync's screens don't need per-route payload data, they read from shared `VenueSyncState`/`Configuration` instead.

```csharp
namespace Aetherphone.Apps.VenueSync;

internal enum VenueSyncRoute
{
    Dashboard,
    Shifts,
    Sales,
    Settings,
}
```

- [ ] **Step 2: Write ShiftRow**

Static `Draw(rect, ...)` returning an action enum — same shape as `VenueCard.Draw` (Task 3's research, `VenueCard.cs:21-90`). Each row computes its own hover state internally via `Marquee.DrawLeftAuto` for the two lines of text (venue/role on one line, time range on the next) — this is the direct fix for the shared-hover marquee bug class: two stacked text lines must never share one externally-computed `hovered` bool.

```csharp
using Aetherphone.Core.VenueSync;
using Aetherphone.Windows.Components;

namespace Aetherphone.Apps.VenueSync;

internal enum ShiftRowAction { None, ClockIn, ClockOut, Claim }

internal static class ShiftRow
{
    public const float Height = 56f;

    public static ShiftRowAction Draw(Rect row, VenueSyncShift shift, bool isOpen, string? roleName,
        PhoneTheme theme, string idSuffix)
    {
        var titleText = isOpen ? (roleName ?? "Open Shift") : $"Shift · {shift.Status}";
        var timeText = FormatTimeRange(shift.ScheduledStart, shift.ScheduledEnd);

        // Independent hover per line — never share one bool across two Marquee calls.
        Marquee.DrawLeftAuto($"shiftrow-title-{idSuffix}", titleText, row.Min.X, row.Min.Y, row.Width * 0.65f,
            TextStyle.Body, theme.TextPrimary);
        Marquee.DrawLeftAuto($"shiftrow-time-{idSuffix}", timeText, row.Min.X, row.Min.Y + 20f, row.Width * 0.65f,
            TextStyle.Caption, theme.TextSecondary);

        var actionRect = new Rect(new Vector2(row.Max.X - 80f, row.Min.Y + 12f), new Vector2(row.Max.X, row.Min.Y + 40f));
        var label = isOpen ? "Claim" : shift.Status == "ACTIVE" ? "Clock Out" : "Clock In";
        var clicked = SettingsRow.Action(actionRect, label,
            isOpen ? theme.AccentPrimary : shift.Status == "ACTIVE" ? theme.Danger : theme.AccentPrimary, theme);

        if (!clicked) return ShiftRowAction.None;
        if (isOpen) return ShiftRowAction.Claim;
        return shift.Status == "ACTIVE" ? ShiftRowAction.ClockOut : ShiftRowAction.ClockIn;
    }

    private static string FormatTimeRange(string startIso, string endIso)
    {
        if (!DateTime.TryParse(startIso, out var start) || !DateTime.TryParse(endIso, out var end))
            return "Unknown time";
        return $"{start:ddd h:mm tt} – {end:h:mm tt}";
    }
}
```

Note: `SettingsRow.Action`'s exact signature is `Action(Rect row, string label, Vector4 color, PhoneTheme theme)` returning `bool` (confirmed Task-research item A.7) — this matches the call above. If `PhoneTheme` doesn't expose `TextPrimary`/`TextSecondary`/`AccentPrimary`/`Danger` under those exact names, check `PhoneTheme`'s actual field names (grep `theme\.` usage in `VenuesApp.cs`) and correct this file — do not guess further, read the real struct.

- [ ] **Step 3: Write SaleSummaryRow**

```csharp
using Aetherphone.Windows.Components;

namespace Aetherphone.Apps.VenueSync;

internal static class SaleSummaryRow
{
    public const float Height = 40f;

    public static void Draw(Rect row, int count, decimal total, PhoneTheme theme)
    {
        var text = count == 0 ? "No sales logged this session" : $"{count} sale{(count == 1 ? "" : "s")} · {total:N0}g";
        Marquee.DrawLeftAuto("sale-summary", text, row.Min.X, row.Min.Y, row.Width, TextStyle.Body, theme.TextPrimary);
    }
}
```

- [ ] **Step 4: Build**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: compile errors on `PhoneTheme` field names and possibly `Rect`/`TextStyle` construction — this is expected at this stage since these files were written from research summaries, not a live compiler. Fix each error by reading the actual referenced type (`PhoneTheme.cs`, `Rect.cs`, `TextStyle.cs`) rather than guessing again. Do not proceed to Task 7 (which consumes these components) until this task's files build clean on their own (Task 6's `Configuration` fields may still be outstanding — that's fine, only fix errors that originate in *this task's* files).

- [ ] **Step 5: Commit**

```bash
cd ~/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Apps/VenueSync/VenueSyncRoute.cs src/Aetherphone/Apps/VenueSync/ShiftRow.cs src/Aetherphone/Apps/VenueSync/SaleSummaryRow.cs
git commit -m "feat(venue-sync): add route enum and shift/sale row components"
```

---

## Task 6: Configuration fields

**Files:**
- Modify: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Configuration.cs`

- [ ] **Step 1: Add the fields**

Add near the other per-app config blocks (e.g. next to the Venues app's block at `Configuration.cs:115-119`, per Task-research item A.10):

```csharp
// Venue Sync app
public string VenueSyncApiKey { get; set; } = string.Empty;
public string VenueSyncServerUrl { get; set; } = string.Empty;
public string VenueSyncSelectedVenueId { get; set; } = string.Empty;
public string VenueSyncSelectedVenueName { get; set; } = string.Empty;
```

Plain string fields, same pattern as `AethernetToken` (Task-research item A.10) — no encryption layer added here, matching how the existing Venues/Aethernet config fields already store comparably sensitive values un-encrypted at rest in the plugin config file. `VenueSyncSelectedVenueName` is set alongside `VenueSyncSelectedVenueId` whenever a venue is picked (Task 10) so the Dashboard (Task 7) can show a readable label without re-fetching or cross-referencing the venue list itself.

- [ ] **Step 2: Build**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: Tasks 3 and 4's previously-expected `Configuration.VenueSync*` errors are now gone. Any *remaining* build errors must be genuine issues from Tasks 3-5 — fix them now.

- [ ] **Step 3: Commit**

```bash
cd ~/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Configuration.cs
git commit -m "feat(venue-sync): add persisted config fields for API key, server URL, selected venue"
```

---

## Task 7: VenueSyncApp shell — Dashboard screen

**Files:**
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Apps/VenueSync/VenueSyncApp.cs`
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Apps/VenueSync/VenueSyncApp.Dashboard.cs`

**Context:** `VenueSyncApp.cs` implements `IPhoneApp` and owns the `ViewRouter<VenueSyncRoute>`, following `VenuesApp`'s constructor/OnOpened/OnClosed/Draw shape exactly (Task-research item A.2). The Dashboard screen is `VenueSyncRoute.Dashboard`, the router's root — no back button, per `VenuesApp.cs:144-161`'s root-screen convention (custom header row, not `AppHeader.Draw` with a back handler).

- [ ] **Step 1: Write VenueSyncApp.cs**

```csharp
using Aetherphone.Core.Apps;
using Aetherphone.Core.VenueSync;
using Aetherphone.Windows.Components;

namespace Aetherphone.Apps.VenueSync;

internal sealed partial class VenueSyncApp : IPhoneApp
{
    private readonly VenueSyncApiClient client;
    private readonly VenueSyncState state;
    private readonly Configuration configuration;
    private readonly GameData gameData;
    private readonly ViewRouter<VenueSyncRoute> router;
    private readonly RouterDraw<VenueSyncRoute> drawView;
    private readonly Action back;

    public string Id => "venue-sync";
    public string DisplayName => "Venue Sync";
    public string Glyph => ""; // FontAwesome briefcase, matches SettingsRow icon conventions elsewhere
    public int BadgeCount => 0;

    public VenueSyncApp(VenueSyncApiClient client, VenueSyncState state, Configuration configuration, GameData gameData)
    {
        this.client = client;
        this.state = state;
        this.configuration = configuration;
        this.gameData = gameData;
        router = new ViewRouter<VenueSyncRoute>(VenueSyncRoute.Dashboard);
        drawView = DrawView;
        back = () => router.Pop();
    }

    public void OnOpened()
    {
        router.Reset();
        state.EnsureShiftsFresh(false);
    }

    public void OnClosed()
    {
        router.Reset();
    }

    public void Draw(in PhoneContext context)
    {
        state.EnsureShiftsFresh(false);
        router.Draw(context.Content, AppSkin.Transparent, ImGui.GetIO().DeltaTime, drawView);
    }

    private void DrawView(VenueSyncRoute route, Rect area, int depth)
    {
        switch (route)
        {
            case VenueSyncRoute.Shifts:
                DrawShifts(area);
                break;
            case VenueSyncRoute.Sales:
                DrawSales(area);
                break;
            case VenueSyncRoute.Settings:
                DrawSettings(area);
                break;
            default:
                DrawDashboard(area);
                break;
        }
    }

    public void Dispose()
    {
    }
}
```

Note: `Glyph` value is a placeholder FontAwesome codepoint — confirm the real briefcase/sync glyph codepoint used elsewhere in the codebase (grep other apps' `Glyph =>` values for the FontAwesome constant name pattern, e.g. `FontAwesomeIcon.Briefcase.ToIconString()`) and use that instead of a raw literal if that's the established convention.

- [ ] **Step 2: Write the Dashboard partial**

```csharp
using Aetherphone.Windows.Components;

namespace Aetherphone.Apps.VenueSync;

internal sealed partial class VenueSyncApp
{
    private void DrawDashboard(Rect area)
    {
        var headerArea = new Rect(area.Min, new Vector2(area.Max.X, area.Min.Y + AppHeader.Height));
        AppHeader.DrawTitleWithReserve(headerArea, "venue-sync-title", "Venue Sync", rightReserve: 44f,
            color: Vector4.One, scale: ImGuiHelpers.GlobalScale);

        var gearRect = new Rect(new Vector2(area.Max.X - 40f, area.Min.Y + 4f), new Vector2(area.Max.X - 4f, area.Min.Y + 36f));
        if (SettingsRow.Action(gearRect, "", Vector4.One, default))
        {
            router.Push(VenueSyncRoute.Settings);
        }

        var bodyTop = area.Min.Y + AppHeader.Height + 8f;
        var group = GroupCard.Begin(default, rowCount: 1, rowHeight: 90f);
        var statusRow = group.NextRow();
        DrawStatusCard(statusRow);
        group.End();

        var actionsGroup = GroupCard.Begin(default, rowCount: 3);
        var salesRow = actionsGroup.NextRow();
        if (SettingsRow.Disclosure(salesRow, "Log a Sale", "", default)) router.Push(VenueSyncRoute.Sales);

        var shiftsRow = actionsGroup.NextRow();
        var openCount = state.Shifts?.OpenShifts.Count ?? 0;
        if (SettingsRow.Disclosure(shiftsRow, "Upcoming Shifts", openCount.ToString(), default)) router.Push(VenueSyncRoute.Shifts);

        var summaryRow = actionsGroup.NextRow();
        SettingsRow.Info(summaryRow, "This Session",
            state.SessionSalesCount == 0 ? "No sales yet" : $"{state.SessionSalesCount} · {state.SessionSalesTotal:N0}g",
            default);
        actionsGroup.End();
    }

    private void DrawStatusCard(Rect rect)
    {
        var activeShift = state.Shifts?.Shifts.FirstOrDefault(s => s.Status == "ACTIVE");
        var venueLabel = string.IsNullOrEmpty(configuration.VenueSyncSelectedVenueName)
            ? "No venue selected"
            : configuration.VenueSyncSelectedVenueName;

        if (activeShift != null)
        {
            Marquee.DrawLeftAuto("dash-status-venue", venueLabel, rect.Min.X, rect.Min.Y, rect.Width, TextStyle.Caption, Vector4.One);
            Marquee.DrawLeftAuto("dash-status-state", "ON SHIFT", rect.Min.X, rect.Min.Y + 20f, rect.Width, TextStyle.Body, Vector4.One);

            var buttonRect = new Rect(new Vector2(rect.Min.X, rect.Min.Y + 48f), new Vector2(rect.Max.X, rect.Min.Y + 76f));
            if (SettingsRow.Action(buttonRect, "Clock Out", default, default))
            {
                _ = ClockOutAsync(activeShift.Id);
            }
        }
        else
        {
            Marquee.DrawCenteredAuto("dash-status-off", "OFF SHIFT", rect.Min.X + rect.Width / 2f, rect.Min.Y + 30f,
                rect.Width, TextStyle.Body, Vector4.One);
        }
    }

    private async Task ClockOutAsync(string shiftId)
    {
        var result = await client.ClockOutAsync(shiftId, CancellationToken.None);
        if (result is { Success: true })
        {
            state.EnsureShiftsFresh(true);
        }
        // Inline-error display for this specific action lives in the Shifts screen (Task 8),
        // where the button that triggered it is visible and can show a retry affordance.
        // The dashboard's quick clock-out is a convenience mirror of that same action.
    }
}
```

`DrawStatusCard`'s venue label reads `configuration.VenueSyncSelectedVenueName`, which Task 10's Settings screen sets whenever a venue is picked — no re-fetch needed here. The dashboard's quick clock-out intentionally doesn't show its own inline error (see the comment in `ClockOutAsync` below); Task 8's Shifts screen owns the authoritative clock-in/out UI with full inline-error handling, and is where a member would go to see why a clock-out failed.

- [ ] **Step 3: Build**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: compile errors are likely — `GroupCard.Begin`'s first parameter is `PhoneTheme theme` (Task-research A.7 confirmed signature `Begin(PhoneTheme theme, int rowCount, float rowHeight = ...)`), and this draft passes `default` as a placeholder. Read `PhoneTheme`'s actual definition and either thread a real theme instance through (likely available via `context.Theme` in `Draw`, same as `VenuesApp.cs:83`'s `theme = context.Theme;` pattern — store it as a field set at the top of `Draw` before calling `DrawView`) or construct it correctly. Fix this now — `default` theme values are a placeholder from research, not a real implementation choice.

- [ ] **Step 4: Fix the theme threading**

Add a `theme` field to `VenueSyncApp.cs`, set it in `Draw`:

```csharp
// In VenueSyncApp.cs, add field:
private PhoneTheme theme;

// In Draw(in PhoneContext context), before router.Draw:
theme = context.Theme;
```

Then replace every `default` passed as a `PhoneTheme theme` argument throughout `VenueSyncApp.Dashboard.cs` (and later Shifts/Sales/Settings partials) with `theme`.

- [ ] **Step 5: Build again, verify clean**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: builds clean (app isn't registered yet, so it won't appear in-game, but it must compile).

- [ ] **Step 6: Commit**

```bash
cd ~/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Apps/VenueSync/VenueSyncApp.cs src/Aetherphone/Apps/VenueSync/VenueSyncApp.Dashboard.cs
git commit -m "feat(venue-sync): add app shell and dashboard screen"
```

---

## Task 8: Shifts screen

**Files:**
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Apps/VenueSync/VenueSyncApp.Shifts.cs`

**Context:** Active shift card + "OPEN — CLAIM" section + "UPCOMING" section, per the approved mockup. Inline error + manual retry on clock-in/out/claim failures — the spec's explicit error-handling decision (no local queue, preserve nothing to preserve here since these are single-tap actions with no form state, but the error message must stay visible until the member taps to retry or navigates away, not auto-dismiss).

- [ ] **Step 1: Write the Shifts partial**

```csharp
namespace Aetherphone.Apps.VenueSync;

internal sealed partial class VenueSyncApp
{
    private string? shiftsActionError;

    private void DrawShifts(Rect area)
    {
        AppHeader.Draw(new PhoneContext { Content = area, Theme = theme }, "Shifts", back);

        var bodyTop = area.Min.Y + AppHeader.Height + 8f;
        var cursorY = bodyTop;

        if (state.ShiftsState == VenueSyncLoadState.Loading)
        {
            Marquee.DrawCenteredAuto("shifts-loading", "Loading…", area.Min.X + area.Width / 2f, cursorY, area.Width,
                TextStyle.Body, theme.TextSecondary);
            return;
        }

        if (shiftsActionError != null)
        {
            var errorRect = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + 24f));
            Marquee.DrawLeftAuto("shifts-error", $"{shiftsActionError} — tap to retry", errorRect.Min.X, errorRect.Min.Y,
                errorRect.Width, TextStyle.Caption, theme.Danger);
            cursorY += 28f;
        }

        var shifts = state.Shifts;
        if (shifts == null)
        {
            Marquee.DrawCenteredAuto("shifts-empty", "No shift data", area.Min.X + area.Width / 2f, cursorY, area.Width,
                TextStyle.Body, theme.TextSecondary);
            return;
        }

        var activeShift = shifts.Shifts.FirstOrDefault(s => s.Status == "ACTIVE");
        if (activeShift != null)
        {
            var rowRect = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + ShiftRow.Height));
            var action = ShiftRow.Draw(rowRect, activeShift, isOpen: false, roleName: null, theme, "active");
            HandleShiftAction(action, activeShift.Id);
            cursorY += ShiftRow.Height + 8f;
        }

        if (shifts.OpenShifts.Count > 0)
        {
            cursorY += 4f;
            foreach (var open in shifts.OpenShifts)
            {
                var rowRect = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + ShiftRow.Height));
                var shiftLike = new VenueSyncShift
                {
                    Id = open.Id, ScheduledStart = open.ScheduledStart, ScheduledEnd = open.ScheduledEnd, Status = "OPEN",
                };
                var action = ShiftRow.Draw(rowRect, shiftLike, isOpen: true, open.RoleName, theme, $"open-{open.Id}");
                HandleShiftAction(action, open.Id);
                cursorY += ShiftRow.Height + 4f;
            }
        }

        var upcoming = shifts.Shifts.Where(s => s.Status == "SCHEDULED").ToList();
        if (upcoming.Count > 0)
        {
            cursorY += 4f;
            foreach (var scheduled in upcoming)
            {
                var rowRect = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + ShiftRow.Height));
                var action = ShiftRow.Draw(rowRect, scheduled, isOpen: false, null, theme, $"upcoming-{scheduled.Id}");
                HandleShiftAction(action, scheduled.Id);
                cursorY += ShiftRow.Height + 4f;
            }
        }
    }

    private void HandleShiftAction(ShiftRowAction action, string shiftId)
    {
        switch (action)
        {
            case ShiftRowAction.ClockIn:
                _ = RunShiftActionAsync(() => client.ClockInAsync(shiftId, CancellationToken.None), "Failed to clock in");
                break;
            case ShiftRowAction.ClockOut:
                _ = RunShiftActionAsync(() => client.ClockOutAsync(shiftId, CancellationToken.None), "Failed to clock out");
                break;
            case ShiftRowAction.Claim:
                _ = RunShiftActionAsync(() => client.ClaimShiftAsync(shiftId, CancellationToken.None), "Failed to claim shift");
                break;
        }
    }

    private async Task RunShiftActionAsync(Func<Task<VenueSyncClockResult?>> action, string failureMessage)
    {
        try
        {
            var result = await action();
            if (result is { Success: true })
            {
                shiftsActionError = null;
                state.EnsureShiftsFresh(true);
            }
            else
            {
                shiftsActionError = result?.Error ?? failureMessage;
            }
        }
        catch (Exception)
        {
            shiftsActionError = failureMessage;
        }
    }
}
```

Clock-in stays within the existing 30-minute pre-start window per the spec — that check lives server-side already (the standalone plugin's `ShiftsTab.cs:223` is a client-side UX nicety mirroring a server rule, not the actual enforcement point). This screen relies on the server rejecting early clock-ins (`result.Success == false`, surfaced via the same inline-error path) rather than duplicating the 30-minute check client-side — simpler, and can't drift out of sync with the server's actual rule.

- [ ] **Step 2: Build**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: fix any remaining signature mismatches the same way as Task 7 (read the real type, don't re-guess). Common likely issues: `PhoneContext` may not be constructible via object initializer if it's a `readonly struct` with a constructor instead — check `PhoneContext.cs` and adjust the `AppHeader.Draw` call site accordingly (may need `context` passed through from `Draw` rather than reconstructed here — if so, store the last-seen `PhoneContext` as a field alongside `theme` in Task 7 Step 4 and use that).

- [ ] **Step 3: Commit**

```bash
cd ~/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Apps/VenueSync/VenueSyncApp.Shifts.cs
git commit -m "feat(venue-sync): add shifts screen with clock in/out, claim, inline error retry"
```

---

## Task 9: Sales screen

**Files:**
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Apps/VenueSync/VenueSyncApp.Sales.cs`

**Context:** Service dropdown from `GetServicesAsync` (already role-scoped server-side, per the spec — no client-side role filtering needed). Customer field has a target-lock button reading `gameData`'s current target (mirrors `~/VenueManager`'s `SalesTab.cs` "use target" crosshair). Amount input. Inline error preserves form contents on failure (the spec's explicit requirement — this screen's fields are locals that persist across a failed submit attempt since nothing clears them except a successful log or leaving the screen).

- [ ] **Step 1: Write the Sales partial**

```csharp
namespace Aetherphone.Apps.VenueSync;

internal sealed partial class VenueSyncApp
{
    private List<VenueSyncService> salesServices = new();
    private int salesSelectedServiceIndex = -1;
    private string salesCustomerName = string.Empty;
    private string salesAmountText = string.Empty;
    private string? salesError;
    private bool salesServicesLoaded;

    private void DrawSales(Rect area)
    {
        AppHeader.Draw(context, "Log a Sale", back);

        if (!salesServicesLoaded)
        {
            salesServicesLoaded = true;
            _ = LoadSalesServicesAsync();
        }

        var cursorY = area.Min.Y + AppHeader.Height + 8f;

        var serviceLabel = salesSelectedServiceIndex >= 0 && salesSelectedServiceIndex < salesServices.Count
            ? salesServices[salesSelectedServiceIndex].Name
            : "Select a service";
        var serviceRow = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + 32f));
        if (SettingsRow.Disclosure(serviceRow, "Service", serviceLabel, theme))
        {
            // Cycle selection on tap — a full picker sub-screen is a reasonable v2 follow-up
            // once there's a generic list-picker component; v1 keeps this screen self-contained.
            salesSelectedServiceIndex = salesServices.Count == 0 ? -1 : (salesSelectedServiceIndex + 1) % salesServices.Count;
        }
        cursorY += 40f;

        var customerRow = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X - 32f, cursorY + 28f));
        ImGui.SetCursorScreenPos(customerRow.Min);
        ImGui.SetNextItemWidth(customerRow.Width);
        ImGui.InputTextWithHint("##sales-customer", "Customer (optional)", ref salesCustomerName, 64);

        var targetButtonRect = new Rect(new Vector2(area.Max.X - 28f, cursorY), new Vector2(area.Max.X, cursorY + 28f));
        if (SettingsRow.Action(targetButtonRect, "", theme.TextPrimary, theme)) // FontAwesome crosshairs
        {
            var targetName = gameData.LocalPlayer?.TargetObject?.Name.TextValue;
            if (!string.IsNullOrEmpty(targetName)) salesCustomerName = targetName;
        }
        cursorY += 36f;

        var amountRow = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + 28f));
        ImGui.SetCursorScreenPos(amountRow.Min);
        ImGui.SetNextItemWidth(amountRow.Width);
        ImGui.InputTextWithHint("##sales-amount", "Amount (gil)", ref salesAmountText, 12, ImGuiInputTextFlags.CharsDecimal);
        cursorY += 36f;

        if (salesError != null)
        {
            var errorRect = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + 24f));
            Marquee.DrawLeftAuto("sales-error", $"{salesError} — tap Log Sale to retry", errorRect.Min.X, errorRect.Min.Y,
                errorRect.Width, TextStyle.Caption, theme.Danger);
            cursorY += 28f;
        }

        var submitRect = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + 32f));
        if (SettingsRow.Action(submitRect, "Log Sale", theme.AccentPrimary, theme))
        {
            _ = SubmitSaleAsync();
        }
        cursorY += 44f;

        var summaryRect = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + SaleSummaryRow.Height));
        SaleSummaryRow.Draw(summaryRect, state.SessionSalesCount, state.SessionSalesTotal, theme);
    }

    private async Task LoadSalesServicesAsync()
    {
        var venueId = configuration.VenueSyncSelectedVenueId;
        if (string.IsNullOrEmpty(venueId)) return;
        var response = await client.GetServicesAsync(venueId, CancellationToken.None);
        if (response != null) salesServices = response.Services;
    }

    private async Task SubmitSaleAsync()
    {
        if (!decimal.TryParse(salesAmountText, out var amount) || amount <= 0)
        {
            salesError = "Enter a valid amount";
            return;
        }

        var service = salesSelectedServiceIndex >= 0 && salesSelectedServiceIndex < salesServices.Count
            ? salesServices[salesSelectedServiceIndex]
            : null;

        var request = new VenueSyncTransactionRequest
        {
            VenueId = configuration.VenueSyncSelectedVenueId,
            ServiceId = service?.Id,
            Amount = amount,
            CustomerName = string.IsNullOrEmpty(salesCustomerName) ? null : salesCustomerName,
        };

        try
        {
            var result = await client.LogTransactionAsync(request, CancellationToken.None);
            if (result is { Success: true })
            {
                salesError = null;
                state.RecordSale(amount);
                // Form intentionally NOT cleared on success beyond the amount — a member logging
                // several sales for the same repeat customer/service benefits from the fields
                // staying populated; only the amount resets since that's what varies per sale.
                salesAmountText = string.Empty;
            }
            else
            {
                salesError = result?.Error ?? "Failed to log sale";
            }
        }
        catch (Exception)
        {
            salesError = "Failed to log sale";
        }
    }
}
```

Uses `context` and `theme` as fields — if Task 8's fix (storing the last `PhoneContext` as a field) wasn't carried through, add it now: this screen needs `context` for `AppHeader.Draw`'s signature `Draw(in PhoneContext context, string title, Action? onBack)`.

- [ ] **Step 2: Build**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: fix real errors as they surface — likely candidates: `gameData.LocalPlayer?.TargetObject` may not be the correct path to the player's current target (Task-research A.12 only confirmed `LocalPlayer`, not target access — check `IObjectTable`/`ITargetManager` for the actual current-target API, which in Dalamud is typically a separate `ITargetManager.Target` service, not a property on the player object; adjust `GameData` if it doesn't already expose this, adding a `CurrentTarget` property there following the same pattern as `LocalPlayer`).

- [ ] **Step 3: If GameData needs a CurrentTarget property, add it**

Only if Step 2's build confirms `TargetObject` doesn't exist. Modify `Core/Game/GameData.cs` (same file as `LocalPlayer`, Task-research A.12):

```csharp
// Add alongside the existing LocalPlayer property (constructor already takes IObjectTable;
// add ITargetManager as a new constructor parameter if not already present):
public IGameObject? CurrentTarget => targetManager.Target;
```

If this requires adding `ITargetManager targetManager` to `GameData`'s constructor, that's a new dependency on shared infrastructure — update every existing `GameData` construction call site (search-all for `new GameData(`) to pass the new parameter, sourced from the same DI container that already provides `ITargetManager` elsewhere in the plugin (check `Plugin.cs`'s service registration for the existing `[PluginService] ITargetManager` instance).

- [ ] **Step 4: Build again, verify clean**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

- [ ] **Step 5: Commit**

```bash
cd ~/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Apps/VenueSync/VenueSyncApp.Sales.cs src/Aetherphone/Core/Game/GameData.cs
git commit -m "feat(venue-sync): add sales screen with target-lock customer field and inline error retry"
```

---

## Task 10: Settings screen

**Files:**
- Create: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Apps/VenueSync/VenueSyncApp.Settings.cs`

**Context:** Masked API key input with eye-toggle (matches `~/VenueManager`'s `SettingsTab.cs` `DrawApiKeyInput` pattern), venue selector populated once a key is set, and the character-link card — pre-filled from `gameData.LocalPlayer`, single confirm tap, no typing.

- [ ] **Step 1: Write the Settings partial**

```csharp
namespace Aetherphone.Apps.VenueSync;

internal sealed partial class VenueSyncApp
{
    private bool settingsKeyVisible;
    private string settingsKeyInput = string.Empty;
    private List<VenueSyncVenue> settingsVenues = new();
    private string? settingsError;
    private string? settingsCharacterLinkStatus;

    private void DrawSettings(Rect area)
    {
        AppHeader.Draw(context, "Sync Settings", back);

        var cursorY = area.Min.Y + AppHeader.Height + 8f;

        if (settingsKeyInput.Length == 0 && configuration.VenueSyncApiKey.Length > 0)
        {
            settingsKeyInput = configuration.VenueSyncApiKey;
        }

        var keyRow = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X - 32f, cursorY + 28f));
        ImGui.SetCursorScreenPos(keyRow.Min);
        ImGui.SetNextItemWidth(keyRow.Width);
        var flags = settingsKeyVisible ? ImGuiInputTextFlags.None : ImGuiInputTextFlags.Password;
        if (ImGui.InputTextWithHint("##sync-api-key", "API key (vm_...)", ref settingsKeyInput, 128, flags))
        {
            configuration.VenueSyncApiKey = settingsKeyInput;
            configuration.Save();
        }

        var eyeRect = new Rect(new Vector2(area.Max.X - 28f, cursorY), new Vector2(area.Max.X, cursorY + 28f));
        if (SettingsRow.Action(eyeRect, "", theme.TextPrimary, theme)) // FontAwesome eye
        {
            settingsKeyVisible = !settingsKeyVisible;
        }
        cursorY += 40f;

        var venueLabel = settingsVenues.FirstOrDefault(v => v.Id == configuration.VenueSyncSelectedVenueId)?.Name
                          ?? "Select venue";
        var venueRow = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + 32f));
        if (SettingsRow.Disclosure(venueRow, "Venue", venueLabel, theme))
        {
            _ = LoadVenuesAsync();
        }
        if (settingsVenues.Count > 0)
        {
            cursorY += 36f;
            foreach (var venue in settingsVenues)
            {
                var optionRect = new Rect(new Vector2(area.Min.X + 16f, cursorY), new Vector2(area.Max.X, cursorY + 28f));
                var selected = venue.Id == configuration.VenueSyncSelectedVenueId;
                if (SettingsRow.Selectable(optionRect, $"{venue.Name} · {venue.Role}", selected, theme))
                {
                    configuration.VenueSyncSelectedVenueId = venue.Id;
                    configuration.VenueSyncSelectedVenueName = venue.Name;
                    configuration.Save();
                    state.EnsureShiftsFresh(true);
                }
                cursorY += 32f;
            }
        }
        else
        {
            cursorY += 8f;
        }

        if (settingsError != null)
        {
            var errorRect = new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + 24f));
            Marquee.DrawLeftAuto("settings-error", settingsError, errorRect.Min.X, errorRect.Min.Y, errorRect.Width,
                TextStyle.Caption, theme.Danger);
            cursorY += 28f;
        }

        cursorY += 8f;
        DrawCharacterLinkCard(new Rect(new Vector2(area.Min.X, cursorY), new Vector2(area.Max.X, cursorY + 72f)));
    }

    private void DrawCharacterLinkCard(Rect rect)
    {
        var localName = gameData.LocalPlayer?.Name.TextValue;
        var worldName = gameData.LocalHomeWorldId != 0 ? gameData.WorldName(gameData.LocalHomeWorldId) : null;

        if (string.IsNullOrEmpty(localName) || string.IsNullOrEmpty(worldName))
        {
            Marquee.DrawLeftAuto("char-link-unavailable", "No character detected — enter the game world first",
                rect.Min.X, rect.Min.Y, rect.Width, TextStyle.Caption, theme.TextSecondary);
            return;
        }

        Marquee.DrawLeftAuto("char-link-label", "Character detected", rect.Min.X, rect.Min.Y, rect.Width,
            TextStyle.Caption, theme.TextSecondary);
        Marquee.DrawLeftAuto("char-link-name", $"{localName} @ {worldName}", rect.Min.X, rect.Min.Y + 18f, rect.Width,
            TextStyle.Body, theme.TextPrimary);

        var buttonRect = new Rect(new Vector2(rect.Min.X, rect.Min.Y + 40f), new Vector2(rect.Max.X, rect.Min.Y + 68f));
        var label = settingsCharacterLinkStatus ?? "Link this character";
        if (SettingsRow.Action(buttonRect, label, theme.AccentPrimary, theme))
        {
            _ = LinkCharacterAsync(localName, worldName);
        }
    }

    private async Task LoadVenuesAsync()
    {
        try
        {
            var response = await client.GetVenuesAsync(CancellationToken.None);
            if (response != null)
            {
                settingsVenues = response.Venues;
                settingsError = null;
            }
            else
            {
                settingsError = "Failed to load venues — check your API key";
            }
        }
        catch (Exception)
        {
            settingsError = "Failed to load venues — check your API key";
        }
    }

    private async Task LinkCharacterAsync(string characterName, string world)
    {
        settingsCharacterLinkStatus = "Linking…";
        try
        {
            var response = await client.LinkCharacterAsync(characterName, world, CancellationToken.None);
            settingsCharacterLinkStatus = response?.Character != null ? "Linked ✓" : (response?.Error ?? "Failed to link — tap to retry");
        }
        catch (Exception)
        {
            settingsCharacterLinkStatus = "Failed to link — tap to retry";
        }
    }
}
```

- [ ] **Step 2: Build**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: fix remaining real errors the same disciplined way as prior tasks.

- [ ] **Step 3: Commit**

```bash
cd ~/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Apps/VenueSync/VenueSyncApp.Settings.cs
git commit -m "feat(venue-sync): add settings screen with API key entry, venue selector, character linking"
```

---

## Task 11: AppRegistry registration

**Files:**
- Modify: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Core/Apps/AppRegistry.cs`
- Modify: `~/plugin-research/FFXIV-Aetherphone/src/Aetherphone/Core/Apps/PhoneServices.cs` (or wherever `PhoneServices` is defined — add `VenueSyncApiClient`/`VenueSyncState` if `PhoneServices` is a DI container class rather than a simple bag; check the file before assuming its shape)

- [ ] **Step 1: Wire up PhoneServices**

Find where `PhoneServices` constructs `services.Venues` (the `VenuesService` instance passed to `VenuesApp`'s constructor at `AppRegistry.cs:68`) and add equivalent construction for `VenueSyncApiClient`/`VenueSyncState`:

```csharp
// Alongside the existing Venues service construction:
var venueSyncClient = new VenueSyncApiClient(http, configuration);
var venueSyncState = new VenueSyncState(venueSyncClient, configuration);
```

Expose them the same way `Venues`/`GameData`/`Configuration` are already exposed on `PhoneServices` (as properties, following whatever pattern the existing fields use).

- [ ] **Step 2: Register the app**

In `AppRegistry.BuildDefault`, add a registration line matching the `VenuesApp` template (Task-research A.8, `AppRegistry.cs:68`):

```csharp
apps.Add(new VenueSyncApp(services.VenueSync, services.VenueSyncState, services.Configuration, services.GameData));
```

(Adjust property names to whatever Step 1 actually named them.)

- [ ] **Step 3: Build**

```bash
cd ~/plugin-research/FFXIV-Aetherphone && dotnet build
```

Expected: builds clean, full plugin including the new app.

- [ ] **Step 4: Commit**

```bash
cd ~/plugin-research/FFXIV-Aetherphone
git add src/Aetherphone/Core/Apps/AppRegistry.cs src/Aetherphone/Core/Apps/PhoneServices.cs
git commit -m "feat(venue-sync): register Venue Sync app in AppRegistry"
```

---

## Task 12: Manual live verification

**Files:** none (verification-only task)

No automated UI test harness exists in Aetherphone (matches the rest of the codebase — confirmed no test project references ImGui screens). Verification is manual, per the spec.

- [ ] **Step 1: Load the dev build**

Follow this project's established Dalamud dev-plugin workflow (per `reference_aetherphone_dev_plugin_live_testing` memory: build, add to Dev Plugin Locations, reload, check Debug output for load errors) to get the updated Aetherphone build running in-game with a real character.

- [ ] **Step 2: Exercise the happy path per screen**

- Open the phone, confirm "Venue Sync" tile appears with its glyph.
- Settings: paste a real `vm_...` key, confirm the venue list loads and a venue can be selected.
- Settings: tap "Link this character", confirm it shows "Linked ✓" (verify server-side via the same curl check from Task 1 Step 3, or by checking the account's linked characters on the website).
- Dashboard: confirm the status card reflects real shift state (ON SHIFT / OFF SHIFT) matching what the website dashboard shows for the same account.
- Shifts: claim an open shift if one exists, clock in on it, confirm the dashboard's status card updates after backing out and back in.
- Sales: log a real sale (small test amount), confirm the session summary line updates, confirm the sale appears in the venue's transaction history on the website.

- [ ] **Step 3: Exercise the forced-failure path**

Temporarily set `configuration.VenueSyncServerUrl` to an unreachable URL (e.g. `https://localhost:1`) via the Settings screen's server URL field if one was exposed, or by editing the plugin's saved config JSON directly and reloading. Attempt a clock-in and a sale log. Confirm:
- The inline error message appears on the same screen (not a crash, not a silent no-op).
- Form contents on the Sales screen are NOT cleared after the failed attempt.
- Tapping the action again (after restoring the correct URL) succeeds without needing to re-enter anything already typed.

Restore the correct server URL before continuing.

- [ ] **Step 4: Verify at phone-size extremes**

In Aetherphone's phone appearance settings, set the phone scale to "XS" (280×606) and repeat Step 2's happy-path walkthrough on all four screens, watching specifically for:
- Header title text colliding with the gear/back button (space-reservation bug class) — the title should truncate/ellipsis before it touches the icon, never overlap it.
- Any two-line row (Shift rows' title+time) where hovering one line's marquee scroll also scrolls the other line, or where only one line scrolls when both should independently respond to hover.
- Any row where content below a `Typography`-drawn element appears to start from the wrong vertical position (would indicate uncorrected cursor corruption — this plan's rows use `Marquee` throughout specifically to avoid this, but verify).

Repeat at "XXL" (500×1084), watching for the opposite failure mode — excessive empty space or elements not scaling up, rather than collision.

- [ ] **Step 5: Fix any bugs found**

If Step 4 surfaces a real instance of one of the three known bug classes, fix it in the relevant screen file (Task 7-10's files) following the mitigation already documented in the design spec, then re-verify at both size extremes before considering this task done.

- [ ] **Step 6: No commit for this task**

This is verification-only; any fixes found in Step 5 get their own commit in whichever task's file they land in (amend that task's understanding, don't create a mystery "bugfix" commit disconnected from context — a plain `fix(venue-sync): ...` commit referencing the specific screen is fine).

---

## Explicitly out of scope (do not add tasks for these)

- Owner-issued API keys / non-Discord auth path — separate future backend project, not started here.
- Server-side role enforcement on `POST /api/plugin/transactions` (the `serviceId`-vs-caller's-role gap noted in the design doc) — tracked as its own follow-up, deliberately not touched in this plan.
- Patron tracking UI — the plugin already reports visits passively; no member-facing screen needed.
- Payroll glance — owner/manager-facing, not a member daily-use action, out of scope per the spec.
- Pitching this to Xeldar / upstream Aetherphone PR — happens after this prototype is proven out on the fork, not part of this plan.
