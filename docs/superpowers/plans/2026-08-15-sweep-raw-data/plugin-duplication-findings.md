# VenueManager plugin — structural duplication pass

Manual read-only pass over `~/VenueManager/VenueManager/**/*.cs` (35 files, 6603 lines total). No automated
dupe tool used — grepped for signatures, then read each `UI/Tabs/*.cs` file plus the `Plugin.cs` /
`XIVAppApiClient.cs` / `XIVAppVenueApi.cs` / `XIVAppPatronApi.cs` API-layer files, since the API layer
turned out to have the clearest duplication once the tab files were read.

Signal counts (starting point, not verdicts, per the task):

- `ImGui.Separator()` in `UI/Tabs/*.cs`: 9 hits
- `ImGui.InputText|InputFloat|Checkbox` in `UI/Tabs/*.cs`: 28 hits
- `try {` appears in 18 of the 35 files

## Near-duplicate blocks found

### 1. "XIV-App not ready" guard clause — UI layer (HIGH value)

**Files:** `UI/Tabs/RoomsTab.cs:42-54`, `UI/Tabs/ShiftsTab.cs:49-61`, `UI/Tabs/SalesTab.cs:73-85`
Identical ~13-line block at the top of each tab's `draw()`:

```
if (plugin.xivAppClient == null || !plugin.xivAppClient.IsConfigured)
{
  ThemeManager.ConfigBanner("XIV-App is not configured. Add your API key in Settings...");
  ImGui.EndChild();
  return;
}
if (string.IsNullOrEmpty(plugin.currentXivAppVenueId))
{
  ThemeManager.ConfigBanner("No venue selected. Pick one in Settings.");
  ImGui.EndChild();
  return;
}
```

Only the banner wording differs slightly. A comment in `RoomsTab.cs` line 27 explicitly says "Matches
ShiftsTab's exact pattern" — the duplication is acknowledged, just never consolidated.
**Judgment:** worth extracting. A `ThemeManager.RequireXivAppReady(plugin)` helper returning `bool` (and
doing the `EndChild()` + banner itself) would collapse this to a 2-line guard in each tab, same spirit as
`DrawSectionSeparator()` in `SettingsTab.cs`.

### 2. Auto-refresh + manual-refresh-button block — UI layer (MEDIUM value)

**Files:** `UI/Tabs/RoomsTab.cs:56-71`, `UI/Tabs/ShiftsTab.cs:63-80`
Both tabs poll on a `RefreshInterval` TimeSpan with an identical `loading`/`lastFetch` bool+DateTime pair,
and an identical "Loading..." vs `SmallButton("Refresh")` branch:

```
if (!loading && DateTime.Now - lastFetch > RefreshInterval) { _ = FetchXAsync(); }
if (loading) { ImGui.TextDisabled("Loading..."); }
else { if (ImGui.SmallButton("Refresh")) { _ = FetchXAsync(); } }
```

**Judgment:** worth extracting into a small `PollGate` helper/struct (holds `loading`/`lastFetch`, exposes
`ShouldRefresh()` + `DrawRefreshRow(Action refresh)`), but lower urgency than #1 — only 2 files today, may
grow if more tabs adopt polling.

### 3. `LogSaleSilentAsync` / `LogTipSilentAsync` — Plugin.cs (HIGH value)

**File:** `Plugin.cs:455-499` and `Plugin.cs:502-547`
Two ~48-line methods that are near-verbatim: same "not configured" / "no venue" guard (see #4 below), same
try/catch shape, same `LogTransactionAsync(...)` call differing only in the trailing `"TIP"` type arg and
the "g" vs "g tip" wording in the success/failure chat messages. The existing comment on `LogTipSilentAsync`
(line 501) literally says "same shape as LogSaleSilentAsync, tagged type=\"TIP\"" — duplication is
self-documented but not collapsed.
**Judgment:** worth extracting. Fold into one `LogSaleOrTipSilentAsync(int amount, string? customer, bool
isTip)` (or keep both public entry points as 2-line wrappers calling a shared private helper) — removes
~40 duplicated lines.

### 4. "prefix + not-configured + no-venue" guard clause — Plugin.cs slash-command handlers (HIGH value)

**File:** `Plugin.cs`, repeated verbatim in 5 methods: `LogSaleSilentAsync:457-468`,
`LogTipSilentAsync:504-515`, `BanPatronSilentAsync:552-563`, `ShiftClockInSilentAsync:588-599`,
`ShiftClockOutSilentAsync:640-651`. Exact same ~12-line block each time:

```
string prefix = this.Configuration.showPluginNameInChat ? $"[{Name}] " : "";
if (xivAppClient == null || !xivAppClient.IsConfigured)
{
  Chat.Print(prefix + "XIV-App is not configured. Add your API key in Settings first.");
  return;
}
if (string.IsNullOrEmpty(currentXivAppVenueId))
{
  Chat.Print(prefix + "No venue selected. Pick one in Settings.");
  return;
}
```

**Judgment:** the single best extraction target in the whole plugin — 5 verbatim copies, ~60 duplicated
lines total. A `bool TryGetChatPrefix(out string prefix)` (or `bool RequireXivAppReadyForChat(out string
prefix)`) helper on `Plugin` would let each call site do:

```
if (!TryGetChatPrefix(out var prefix)) return;
```

Note this is the _same shape of check_ as finding #1 (UI layer), just with `Chat.Print` instead of
`ThemeManager.ConfigBanner` — the two could plausibly share a single "is XIV-App ready" boolean check with
two different presentation wrappers (chat vs ImGui banner), but that's a bigger refactor; flagging the
Plugin.cs-internal 5x duplication alone is already a clean, low-risk win.

### 5. `ShiftClockInSilentAsync` / `ShiftClockOutSilentAsync` — Plugin.cs (MEDIUM value)

**File:** `Plugin.cs:586-635` and `Plugin.cs:638-690`
Mirror-image methods: same guard (#4), same `clockSem.WaitAsync(0)` non-reentrancy check, same
try/finally-release-semaphore shape, same "find shift by Status" + call `ClockInAsync`/`ClockOutAsync` +
report result pattern. Genuinely opposite operations (clock in vs out) so full merge is less clean than
#3, but the guard/semaphore/try-finally scaffolding (~20 of the ~50 lines in each) is identical.
**Judgment:** lower-urgency than #3/#4 — the domain logic differs enough that forcing a single method would
add parameters/branching that may not pay for itself. Worth a shared private helper for just the
semaphore-guarded-try/finally wrapper if #4's guard helper is added anyway.

### 6. `LogPatronVisitAsync` / `LogServiceAsync` — XIVAppPatronApi.cs (HIGH value, notable because the fix already exists in the same file)

**File:** `XIVAppPatronApi.cs:16-45` and `XIVAppPatronApi.cs:47-75`
Both hand-roll the exact `IsConfigured` check → `try` → `Http.PostAsJsonAsync` → check
`IsSuccessStatusCode` → log+return-false pattern, ~23 lines each. The same file's `LogTransactionAsync` and
`BanPatronAsync` (lines 84-141) already use the shared `_client.PostForResultAsync<TRequest,TResult>(...)`
helper defined in `XIVAppApiClient.cs:93-118` — so the abstraction exists and is proven, it's just not
applied to these two older methods.
**Judgment:** worth extracting — straightforward mechanical change to
`PostForResultAsync<TRequest, bool>(path, request, ctx, () => false, error => false, _ =>
Task.FromResult(true))`. Removes ~35 duplicated lines and makes the file internally consistent.

### 7. `GetVenuesAsync` — XIVAppVenueApi.cs (LOW-MEDIUM value)

**File:** `XIVAppVenueApi.cs:18-46`
Hand-rolled `Http.GetAsync` + status-check + 3-way `catch` (network/timeout/other) that throws
`XIVAppApiException` on failure, versus every other method in the same file (`GetServicesAsync`,
`GetRolesAsync`, `GetVipPatronsAsync`, `GetBannedPatronsAsync`, `GetActiveEventAsync`, `GetRoomsAsync`,
`GetInventoryEnabledAsync`) which are one-liners calling the shared `_client.GetAsync<TResponse,TResult>`
helper. Not a verbatim duplicate of anything else (its throw-on-failure contract differs from
`GetAsync<>`'s return-fallback contract), so it's more "inconsistent with the established pattern" than
"copy-pasted."
**Judgment:** lower priority — would need a `GetAsync`-throwing variant to consolidate cleanly, or accept
that this one caller genuinely wants exception semantics (it's the only call site treated as fatal — used
during initial-load / Fetch Venues flow where an exception bubbling up to a caught `try` is intentional per
`SettingsTab.FetchXivAppVenuesAsync`). Flag for awareness, not a must-fix.

### 8. `LinkItemAsync` / `RestockAsync` — InventoryTab.cs (LOW value)

**File:** `UI/Tabs/InventoryTab.cs:129-144` and `UI/Tabs/InventoryTab.cs:146-161`
Same shape: guard on client/venue, call, on success clear pending-id + refetch services, else log warning.
~15 lines each.
**Judgment:** small enough (and only 2 call sites) that extracting is optional — flagging for completeness
since it fits the same family as #6, but lower priority.

### 9. `getSortedVenues` column-sort switch — VenuesTab.cs (LOW value)

**File:** `UI/Tabs/VenuesTab.cs:38-66`
4 `case` blocks (Name/District/World/DataCenter), each with an identical Ascending/Descending
`venues.Sort((pair1, pair2) => ...)` pair differing only by which field is compared.
**Judgment:** could collapse to a single helper taking a `Func<Venue,IComparable>` key selector, but this
is ImGui-table boilerplate that's easy to read as-is and low risk either way — not a priority.

## Dead code noticed

None found with confidence during this pass. Nothing stood out as an obviously-unreferenced private method
or field while reading `UI/Tabs/*.cs`, `Plugin.cs`, and the `XIVApp*Api.cs` files — a proper dead-code
check would need a call-graph tool (Roslyn analyzer or similar), which is out of scope for this manual
pass. Not claiming completeness here.

## Oversized files (splitting candidates)

From `wc -l` across `VenueManager/*.cs`, `UI/*.cs`, `UI/Tabs/*.cs`, `UI/Widgets/*.cs`, `Utils/*.cs`,
`Windows/*.cs`:

| File                     | Lines | Note                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Plugin.cs`              | 1486  | By far the largest file — god-object shape: slash commands, DTR bar, chat alerts, shift polling, doorbell sound, event presence, all in one class. Genuine splitting candidate (e.g. slash-command handling, chat-alert building, and DTR/shift-polling could each move to their own partial-class file or dedicated class), but that's a bigger structural refactor than this sweep's scope — flagging for Stage 2 planning, not attempting here. |
| `UI/Tabs/SettingsTab.cs` | 820   | Large but already well-sectioned with `-- comment --` dividers and small private `Draw*` methods; less urgent than Plugin.cs.                                                                                                                                                                                                                                                                                                                      |
| `UI/Tabs/ShiftsTab.cs`   | 435   | Medium; not urgent.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `UI/Tabs/VenuesTab.cs`   | 322   | Medium; not urgent.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `UI/Tabs/SalesTab.cs`    | 295   | Medium; not urgent.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `XIVAppApiModels.cs`     | 370   | Pure DTOs — size is expected and fine for a models file, not a splitting concern.                                                                                                                                                                                                                                                                                                                                                                  |

Everything else is under 230 lines — no other splitting candidates.

## Summary for Task 4

- 9 duplication clusters found, all within/across `UI/Tabs/*.cs`, `Plugin.cs`, and the `XIVApp*Api.cs`
  files. 4 rated HIGH value (worth extracting): #1, #3, #4, #6. 2 rated MEDIUM (#2, #5). 3 rated LOW (#7,
  #8, #9).
- 0 dead-code findings (not exhaustive — no call-graph tool used).
- 1 clear oversized-file candidate: `Plugin.cs` at 1486 lines (god-object), flagged for Stage 2 scoping
  rather than fixed here.
