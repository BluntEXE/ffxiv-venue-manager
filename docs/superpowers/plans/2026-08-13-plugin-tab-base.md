# Phase 4 — Plugin Shared Tab Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MainWindow`'s parallel bookkeeping (a `Tab` enum, 8 typed fields, an 8-case visibility-guard block, an 8-case nav-icon block, and an 8-case draw-dispatch switch) with a single `List<ITab>` that each tab class populates itself, so adding/removing a tab is a one-line change instead of five.

**Architecture:** Introduce a minimal `ITab` interface (`Name`, `Icon`, `Tooltip`, `IsVisible`, `draw()`) implemented by all 8 existing tab classes with zero changes to their internal draw logic — this is additive (new properties only), not a rewrite. `MainWindow` builds an ordered `List<ITab>` in its constructor and replaces its enum/switch dispatch with loops over that list. `SettingsTab` implements `ITab` like every other tab but keeps its special pinned-to-bottom nav position and first-run-override behavior, since those are unique to it and don't belong on the shared interface (YAGNI — only one tab needs them).

**Tech Stack:** C#, Dalamud ImGui bindings (existing patterns only, no new dependencies).

**Repo:** `~/VenueManager` (local checkout, `master` branch, currently clean apart from unrelated untracked `.git-backup-before-rewrite/` and `.mailmap` — ignore those, don't touch).

---

## Ground rules for this plan

- **No renames.** All 8 tabs use lowercase `draw()` (not `Draw()`) — that's this codebase's established convention for tab classes. `ITab.draw()` matches it exactly. Don't "fix" the casing.
- **No behavior change.** Every visibility rule, fallback rule, and pinned-position rule must produce pixel-identical behavior to today. This is a structural refactor, not a UX change.
- **Build after every task.** `dotnet build` from `~/VenueManager/VenueManager` — a single missing property on any of the 8 tabs will fail the whole solution, so verify per-task rather than batching.

---

### Task 1: Add the `ITab` interface

**Files:**
- Create: `VenueManager/UI/Tabs/ITab.cs`

- [ ] **Step 1: Write the interface**

```csharp
using Dalamud.Interface;

namespace VenueManager.Tabs;

// Shared contract for MainWindow's sidebar tabs. Kept intentionally small —
// tabs with one-off behavior (SettingsTab's pinned nav position, SalesTab's
// Prefill()) stay special-cased in MainWindow rather than growing this
// interface for a single caller.
public interface ITab
{
    string Name { get; }
    FontAwesomeIcon Icon { get; }
    string Tooltip { get; }
    bool IsVisible { get; }
    void draw();
}
```

- [ ] **Step 2: Build to confirm it compiles standalone**

Run: `cd ~/VenueManager/VenueManager && dotnet build`
Expected: Build succeeds (interface has no implementers yet, nothing references it).

- [ ] **Step 3: Commit**

```bash
cd ~/VenueManager
git add VenueManager/UI/Tabs/ITab.cs
git commit -m "feat: add ITab interface for shared tab base"
```

---

### Task 2: Implement `ITab` on `SalesTab`, `ShiftsTab`, `RoomsTab` (always-visible tabs)

These three have no visibility gate today (`navButton` is called unconditionally for each in `MainWindow.drawNavIcons`), so `IsVisible` is a constant `true`.

**Files:**
- Modify: `VenueManager/UI/Tabs/SalesTab.cs`
- Modify: `VenueManager/UI/Tabs/ShiftsTab.cs`
- Modify: `VenueManager/UI/Tabs/RoomsTab.cs`

- [ ] **Step 1: `SalesTab.cs` — add `: ITab` and the four properties**

Change:
```csharp
public class SalesTab
```
to:
```csharp
public class SalesTab : ITab
```

Add directly below the `private Plugin plugin;` field block (same location/order used in every other tab in this task, for consistency):
```csharp
  public string Name => "Sales";
  public FontAwesomeIcon Icon => FontAwesomeIcon.DollarSign;
  public string Tooltip => "Sales";
  public bool IsVisible => true;
```

- [ ] **Step 2: `ShiftsTab.cs` — same pattern**

```csharp
public class ShiftsTab : ITab
```
```csharp
  public string Name => "My Shift";
  public FontAwesomeIcon Icon => FontAwesomeIcon.CalendarCheck;
  public string Tooltip => "My Shift";
  public bool IsVisible => true;
```

- [ ] **Step 3: `RoomsTab.cs` — same pattern**

```csharp
public class RoomsTab : ITab
```
```csharp
  public string Name => "Rooms";
  public FontAwesomeIcon Icon => FontAwesomeIcon.DoorOpen;
  public string Tooltip => "Rooms";
  public bool IsVisible => true;
```

- [ ] **Step 4: Build**

Run: `cd ~/VenueManager/VenueManager && dotnet build`
Expected: Build succeeds. (Nothing constructs these via `ITab` yet — this just proves each class satisfies the interface.)

- [ ] **Step 5: Commit**

```bash
cd ~/VenueManager
git add VenueManager/UI/Tabs/SalesTab.cs VenueManager/UI/Tabs/ShiftsTab.cs VenueManager/UI/Tabs/RoomsTab.cs
git commit -m "feat: implement ITab on SalesTab, ShiftsTab, RoomsTab"
```

---

### Task 3: Implement `ITab` on `GuestsTab`, `GuestLogTab` (gated by `configuration.showGuestsTab`)

**Files:**
- Modify: `VenueManager/UI/Tabs/GuestsTab.cs`
- Modify: `VenueManager/UI/Tabs/GuestLogTab.cs`

- [ ] **Step 1: `GuestsTab.cs`**

```csharp
public class GuestsTab : ITab
```
```csharp
  public string Name => "Patrons";
  public FontAwesomeIcon Icon => FontAwesomeIcon.UserFriends;
  public string Tooltip => "Patrons";
  public bool IsVisible => plugin.Configuration.showGuestsTab;
```

- [ ] **Step 2: `GuestLogTab.cs`**

```csharp
public class GuestLogTab : ITab
```
```csharp
  public string Name => "History";
  public FontAwesomeIcon Icon => FontAwesomeIcon.History;
  public string Tooltip => "History";
  public bool IsVisible => plugin.Configuration.showGuestsTab;
```

- [ ] **Step 3: Build**

Run: `cd ~/VenueManager/VenueManager && dotnet build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd ~/VenueManager
git add VenueManager/UI/Tabs/GuestsTab.cs VenueManager/UI/Tabs/GuestLogTab.cs
git commit -m "feat: implement ITab on GuestsTab, GuestLogTab"
```

---

### Task 4: Implement `ITab` on `VenuesTab` and `InventoryTab` (each has its own gate)

**Files:**
- Modify: `VenueManager/UI/Tabs/VenuesTab.cs`
- Modify: `VenueManager/UI/Tabs/InventoryTab.cs`

- [ ] **Step 1: `VenuesTab.cs`** — gated by `configuration.showVenueTab`

```csharp
public class VenuesTab : ITab
```
```csharp
  public string Name => "Venues";
  public FontAwesomeIcon Icon => FontAwesomeIcon.Building;
  public string Tooltip => "Venues";
  public bool IsVisible => plugin.Configuration.showVenueTab;
```

- [ ] **Step 2: `InventoryTab.cs`** — gated by `plugin.xivAppInventoryEnabled` (a `Plugin` field, not `Configuration` — matches today's `if (plugin.xivAppInventoryEnabled)` guard in `MainWindow.drawNavIcons`)

```csharp
public class InventoryTab : ITab
```
```csharp
  public string Name => "Inventory";
  public FontAwesomeIcon Icon => FontAwesomeIcon.WineGlass;
  public string Tooltip => "Inventory";
  public bool IsVisible => plugin.xivAppInventoryEnabled;
```

- [ ] **Step 3: Build**

Run: `cd ~/VenueManager/VenueManager && dotnet build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd ~/VenueManager
git add VenueManager/UI/Tabs/VenuesTab.cs VenueManager/UI/Tabs/InventoryTab.cs
git commit -m "feat: implement ITab on VenuesTab, InventoryTab"
```

---

### Task 5: Implement `ITab` on `SettingsTab` (always visible, no gate)

**Files:**
- Modify: `VenueManager/UI/Tabs/SettingsTab.cs`

- [ ] **Step 1**

```csharp
public class SettingsTab : ITab
```
```csharp
  public string Name => "Settings";
  public FontAwesomeIcon Icon => FontAwesomeIcon.Cog;
  public string Tooltip => "Settings";
  public bool IsVisible => true;
```

- [ ] **Step 2: Build**

Run: `cd ~/VenueManager/VenueManager && dotnet build`
Expected: Build succeeds. All 8 tabs now implement `ITab`; `MainWindow` doesn't use it yet.

- [ ] **Step 3: Commit**

```bash
cd ~/VenueManager
git add VenueManager/UI/Tabs/SettingsTab.cs
git commit -m "feat: implement ITab on SettingsTab"
```

---

### Task 6: Rewrite `MainWindow` to dispatch off `List<ITab>`

This is the task that actually removes the duplication — everything before this was additive scaffolding.

**Files:**
- Modify: `VenueManager/Windows/MainWindow.cs` (full rewrite of the class body; constructor, fields, and all four draw-path methods change)

- [ ] **Step 1: Replace the field block, enum, and constructor**

Current (lines 12–55):
```csharp
public class MainWindow : Window, IDisposable
{
    private Plugin plugin;
    private Configuration configuration;

    private VenuesTab venuesTab;
    private SettingsTab settingsTab;
    private GuestsTab guestsTab;
    private GuestLogTab guestLogTab;
    private SalesTab salesTab;
    private ShiftsTab shiftsTab;
    private RoomsTab roomsTab;
    private InventoryTab inventoryTab;

    private enum Tab { Patrons, Sales, History, Shift, Rooms, Inventory, Venues, Settings }
    private Tab _currentTab = Tab.Sales;

    // Sidebar layout constants
    private const float SidebarWidth  = 46f;
    private const float NavButtonSize = 38f;

    public MainWindow(Plugin plugin) : base(
        "XIV Venue Manager###XIVVMMain",
        ImGuiWindowFlags.NoScrollbar | ImGuiWindowFlags.NoScrollWithMouse)
    {
        this.SizeConstraints = new WindowSizeConstraints
        {
            MinimumSize = new Vector2(320, 400),
            MaximumSize = new Vector2(float.MaxValue, float.MaxValue),
        };
        this.Size          = new Vector2(480, 580);
        this.SizeCondition = ImGuiCond.FirstUseEver;

        this.plugin        = plugin;
        this.configuration = plugin.Configuration;
        this.venuesTab     = new VenuesTab(plugin);
        this.settingsTab   = new SettingsTab(plugin);
        this.guestsTab     = new GuestsTab(plugin);
        this.guestLogTab   = new GuestLogTab(plugin);
        this.salesTab      = new SalesTab(plugin);
        this.shiftsTab     = new ShiftsTab(plugin);
        this.roomsTab      = new RoomsTab(plugin);
        this.inventoryTab  = new InventoryTab(plugin);
    }
```

New:
```csharp
public class MainWindow : Window, IDisposable
{
    private Plugin plugin;
    private Configuration configuration;

    // salesTab and settingsTab keep dedicated typed fields alongside the
    // list below: salesTab because PrefillSale() needs its Prefill() method
    // (not part of ITab — a single caller doesn't earn an interface member),
    // settingsTab because it's pinned to the bottom of the sidebar and is
    // the first-run override target, both of which are unique to it.
    private SalesTab salesTab;
    private SettingsTab settingsTab;
    private List<ITab> tabs;

    private ITab _currentTab;

    // Sidebar layout constants
    private const float SidebarWidth  = 46f;
    private const float NavButtonSize = 38f;

    public MainWindow(Plugin plugin) : base(
        "XIV Venue Manager###XIVVMMain",
        ImGuiWindowFlags.NoScrollbar | ImGuiWindowFlags.NoScrollWithMouse)
    {
        this.SizeConstraints = new WindowSizeConstraints
        {
            MinimumSize = new Vector2(320, 400),
            MaximumSize = new Vector2(float.MaxValue, float.MaxValue),
        };
        this.Size          = new Vector2(480, 580);
        this.SizeCondition = ImGuiCond.FirstUseEver;

        this.plugin        = plugin;
        this.configuration = plugin.Configuration;

        this.salesTab      = new SalesTab(plugin);
        this.settingsTab   = new SettingsTab(plugin);

        // Order here is nav-icon draw order — matches today's exact order.
        this.tabs = new List<ITab>
        {
            new GuestsTab(plugin),
            salesTab,
            new GuestLogTab(plugin),
            new ShiftsTab(plugin),
            new RoomsTab(plugin),
            new InventoryTab(plugin),
            new VenuesTab(plugin),
            settingsTab,
        };

        _currentTab = salesTab;
    }
```

Add `using System.Collections.Generic;` to the top of the file (not currently imported).

- [ ] **Step 2: Replace `OpenTab`**

Current:
```csharp
    // Called by slash commands to jump to a named tab.
    public void OpenTab(string name)
    {
        _currentTab = name switch
        {
            "Patrons"  => Tab.Patrons,
            "Sales"    => Tab.Sales,
            "History"  => Tab.History,
            "My Shift" => Tab.Shift,
            "Rooms"    => Tab.Rooms,
            "Inventory" => Tab.Inventory,
            "Venues"   => Tab.Venues,
            "Settings" => Tab.Settings,
            _          => _currentTab,
        };
    }
```

New:
```csharp
    // Called by slash commands to jump to a named tab.
    public void OpenTab(string name)
    {
        var match = tabs.FirstOrDefault(t => t.Name == name);
        if (match != null) _currentTab = match;
    }
```

Add `using System.Linq;`.

- [ ] **Step 3: Replace `Draw()`'s first-run check**

Current:
```csharp
            if (string.IsNullOrEmpty(configuration.xivAppApiKey))
                _currentTab = Tab.Settings;
```

New:
```csharp
            if (string.IsNullOrEmpty(configuration.xivAppApiKey))
                _currentTab = settingsTab;
```

- [ ] **Step 4: Replace `drawNavIcons`**

Current:
```csharp
    private void drawNavIcons()
    {
        ImGui.Spacing();

        if (configuration.showGuestsTab)
            navButton(Tab.Patrons,  FontAwesomeIcon.UserFriends, "Patrons");

        navButton(Tab.Sales,   FontAwesomeIcon.DollarSign,      "Sales");

        if (configuration.showGuestsTab)
            navButton(Tab.History, FontAwesomeIcon.History, "History");

        navButton(Tab.Shift,   FontAwesomeIcon.CalendarCheck,   "My Shift");

        navButton(Tab.Rooms,   FontAwesomeIcon.DoorOpen,        "Rooms");

        if (plugin.xivAppInventoryEnabled)
            navButton(Tab.Inventory, FontAwesomeIcon.WineGlass, "Inventory");

        if (configuration.showVenueTab)
            navButton(Tab.Venues, FontAwesomeIcon.Building, "Venues");

        // Settings pinned to bottom
        float iconH   = NavButtonSize + ImGui.GetStyle().ItemSpacing.Y;
        float spaceH  = ImGui.GetContentRegionAvail().Y - iconH;
        if (spaceH > 0) ImGui.Dummy(new Vector2(1f, spaceH));

        navButton(Tab.Settings, FontAwesomeIcon.Cog, "Settings");
    }
```

New:
```csharp
    private void drawNavIcons()
    {
        ImGui.Spacing();

        foreach (var tab in tabs)
        {
            if (tab == settingsTab) continue; // pinned to bottom, drawn separately below
            if (tab.IsVisible) navButton(tab);
        }

        // Settings pinned to bottom
        float iconH   = NavButtonSize + ImGui.GetStyle().ItemSpacing.Y;
        float spaceH  = ImGui.GetContentRegionAvail().Y - iconH;
        if (spaceH > 0) ImGui.Dummy(new Vector2(1f, spaceH));

        navButton(settingsTab);
    }
```

- [ ] **Step 5: Replace `navButton`**

Current:
```csharp
    private void navButton(Tab tab, FontAwesomeIcon icon, string tooltip)
    {
        bool active = _currentTab == tab;

        // Transparent button bg; only icon color changes
        ImGui.PushStyleColor(ImGuiCol.Button,        Vector4.Zero);
        ImGui.PushStyleColor(ImGuiCol.ButtonHovered, Colors.XivSurface0);
        ImGui.PushStyleColor(ImGuiCol.ButtonActive,  Colors.XivSurface1);
        ImGui.PushStyleColor(ImGuiCol.Text, active ? Colors.XivBlue : Colors.XivOverlay0);

        ImGui.PushFont(UiBuilder.IconFont);
        bool clicked = ImGui.Button(
            $"{icon.ToIconString()}##nav{tab}",
            new Vector2(SidebarWidth - 8f, NavButtonSize));
        ImGui.PopFont();

        ImGui.PopStyleColor(4);

        if (clicked) _currentTab = tab;

        if (ImGui.IsItemHovered())
            ImGui.SetTooltip(tooltip);
    }
```

New:
```csharp
    private void navButton(ITab tab)
    {
        bool active = _currentTab == tab;

        // Transparent button bg; only icon color changes
        ImGui.PushStyleColor(ImGuiCol.Button,        Vector4.Zero);
        ImGui.PushStyleColor(ImGuiCol.ButtonHovered, Colors.XivSurface0);
        ImGui.PushStyleColor(ImGuiCol.ButtonActive,  Colors.XivSurface1);
        ImGui.PushStyleColor(ImGuiCol.Text, active ? Colors.XivBlue : Colors.XivOverlay0);

        ImGui.PushFont(UiBuilder.IconFont);
        bool clicked = ImGui.Button(
            $"{tab.Icon.ToIconString()}##nav{tab.Name}",
            new Vector2(SidebarWidth - 8f, NavButtonSize));
        ImGui.PopFont();

        ImGui.PopStyleColor(4);

        if (clicked) _currentTab = tab;

        if (ImGui.IsItemHovered())
            ImGui.SetTooltip(tab.Tooltip);
    }
```

(`$"##nav{tab}"` used `Tab`'s enum `ToString()` before as an ImGui ID suffix; `tab.Name` serves the same "unique per tab" purpose for the `##` ID scoping — the literal string differs (`"nav Sales"` vs `"navSales"` had no space either way) but ImGui IDs are opaque, this doesn't need to match byte-for-byte, only be unique per tab, which `Name` guarantees.)

- [ ] **Step 6: Replace `drawTabContent`**

Current:
```csharp
    private void drawTabContent()
    {
        // Guard: if selected tab is hidden, fall back to Sales.
        if (_currentTab == Tab.Patrons  && !configuration.showGuestsTab) _currentTab = Tab.Sales;
        if (_currentTab == Tab.History  && !configuration.showGuestsTab) _currentTab = Tab.Sales;
        if (_currentTab == Tab.Venues   && !configuration.showVenueTab)  _currentTab = Tab.Sales;
        if (_currentTab == Tab.Inventory && !plugin.xivAppInventoryEnabled) _currentTab = Tab.Sales;

        switch (_currentTab)
        {
            case Tab.Patrons:   guestsTab.draw();    break;
            case Tab.Sales:     salesTab.draw();     break;
            case Tab.History:   guestLogTab.draw();  break;
            case Tab.Shift:     shiftsTab.draw();    break;
            case Tab.Rooms:     roomsTab.draw();     break;
            case Tab.Inventory: inventoryTab.draw(); break;
            case Tab.Venues:    venuesTab.draw();    break;
            case Tab.Settings:  settingsTab.draw();  break;
        }
    }
```

New:
```csharp
    private void drawTabContent()
    {
        // Guard: if selected tab is hidden (e.g. its owning config toggle
        // was flipped off from Settings this frame), fall back to Sales.
        // Settings itself is exempt — it's always visible and is the
        // first-run override target.
        if (_currentTab != settingsTab && !_currentTab.IsVisible)
            _currentTab = salesTab;

        _currentTab.draw();
    }
```

- [ ] **Step 7: Build**

Run: `cd ~/VenueManager/VenueManager && dotnet build`
Expected: Build succeeds, zero warnings about unused `Tab` enum (it's fully removed, not left dead).

- [ ] **Step 8: Manual verify (see plan-level Verify section below — do this before committing)**

- [ ] **Step 9: Commit**

```bash
cd ~/VenueManager
git add VenueManager/Windows/MainWindow.cs
git commit -m "refactor: MainWindow dispatches off List<ITab> instead of enum+switch"
```

---

### Task 7: Release as `-testing`, verify in-game

Per [[feedback_plugin_release_clean_build]] and [[feedback_plugin_deploy_workflow]] — clean build, testing channel only (this hasn't been in-game verified yet), do not touch `repo.json`'s stable `AssemblyVersion`/`DownloadLinkInstall`.

- [ ] **Step 1: Clean build**

```bash
cd ~/VenueManager/VenueManager
rm -rf bin obj
dotnet build -c Release
```

- [ ] **Step 2: Swap the `-testing` zip on the GitHub release** (manual, ask user to confirm before pushing — this is a release action, not a code change)

- [ ] **Step 3: Manual in-game verification**

Confirm, with a real dev-plugin load:
1. Every tab still opens from the sidebar (all 8 icons present, correct order: Patrons, Sales, History, My Shift, Rooms, Inventory, Venues, then Settings pinned at bottom).
2. Hiding "Patrons"/"History" via Settings → `showGuestsTab` toggle still hides both icons live and falls back to Sales if either was the active tab.
3. Hiding "Venues" via `showVenueTab` toggle behaves the same way.
4. Entering a venue with inventory disabled hides "Inventory"; enabling it (or switching to a venue with it enabled) shows it.
5. `/xvm sales` (or whatever slash command maps to `OpenTab("Sales")` — check `Plugin.cs` command handlers) still jumps to the correct tab for at least two different tab names, including one that was previously an enum case with spaces in its display name ("My Shift").
6. First-run (no API key configured) still forces Settings open.
7. Tooltips on hover still show the correct text per icon.

- [ ] **Step 4: Report result back — do not promote to stable until this is confirmed.**

---

## Web packages/ hoisting — deferred, not scheduled

Per the roadmap's own Phase 4 description: *"do only if/when a second consumer actually needs [`lib/format.ts`, `lib/server-time.ts`, `lib/validation.ts`]; otherwise defer indefinitely (YAGNI — don't hoist for a consumer that doesn't exist yet)."*

Mobile is deferred (see [[project_xiv_app_mobile_v1]]) and Aetherphone integration (the other plausible second consumer) is still at the outreach stage (see [[project_aetherphone_venue_integration]]) — no second consumer exists today. **No task for this in the current plan.** Revisit only when a concrete second consumer is being built, at which point scope a dedicated plan for exactly what that consumer needs (don't pre-hoist the full set of three files speculatively).

---

## Self-Review

**Spec coverage:** ITab interface (Task 1), all 8 tabs implementing it (Tasks 2–5), MainWindow rewrite consuming the list (Task 6), release+verify (Task 7), packages/ hoisting explicitly addressed as deferred with reasoning (no task, by design) — matches Phase 4's roadmap scope exactly.

**Placeholder scan:** no TBD/TODO, every step shows full before/after code, no "similar to Task N" shorthand — SettingsTab/RoomsTab/etc. each got their literal diff even though the pattern repeats, per the no-placeholders rule.

**Type consistency:** `ITab.Name`/`Icon`/`Tooltip`/`IsVisible`/`draw()` used identically across Tasks 2–6; `navButton(ITab tab)` signature in Task 6 Step 5 matches the call sites in Step 4; `tabs.FirstOrDefault(t => t.Name == name)` in Step 2 matches the `Name` property defined in Tasks 2–5.
