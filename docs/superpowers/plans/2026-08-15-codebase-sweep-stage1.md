# Codebase Sweep — Stage 1: Tooling + Findings Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run automated dead-code/duplication tooling (`knip`, `jscpd`) across the TS/JS apps, run an agent-driven structural pass on the VenueManager plugin (C#), and compile everything into one findings report. This stage produces a report only — no fix commits. Stage 2 (triage + fix) gets planned from this report's contents, once they're known.

**Architecture:** Per `docs/superpowers/specs/2026-08-15-codebase-sweep-design.md`, this is tool-first: `knip` finds unused files/exports/deps, `jscpd` finds duplicate code blocks by similarity, and a manual/agent grep-based pass covers the plugin since no automated C# dupe-detector fits a codebase this size. All four TS/JS apps (`apps/web`, `apps/discord-bot`, `apps/eorzea-bot`, `apps/shout-crafter`) are in scope; `apps/mobile` is already gone (removed in sub-project 1).

**Tech Stack:** pnpm workspaces, TypeScript, `knip`, `jscpd`, C# (VenueManager plugin).

---

## Task 1: Run `knip` across the TS/JS workspaces

**Files:**
- Create: `knip.json` (repo root, `~/xiv-app/knip.json`)
- Create (output, not committed): `/tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/knip-output.txt` (or your own scratchpad path — this is a working artifact, not a repo file)

**Context:** Confirmed entry points during planning:
- `apps/web` — Next.js App Router (`app/**`), knip's Next.js plugin auto-detects routes/pages/middleware once it sees `next` in `apps/web/package.json`'s deps — no manual entry list needed for this workspace.
- `apps/discord-bot` — `src/index.ts` (from `package.json`'s `dev`/`start` scripts).
- `apps/eorzea-bot` — `src/index.ts` (from `package.json`'s `main`/`dev` scripts; also has `src/deploy-commands.ts` as a second real entry, referenced by the `deploy-commands` script).
- `apps/shout-crafter` — Vite frontend app; entry is `index.html` → knip's Vite plugin handles this once it sees `vite` in deps, no manual entry needed.

- [ ] **Step 1: Install knip as a root devDependency**

```bash
cd /home/ehno/xiv-app && pnpm add -D -w knip
```

- [ ] **Step 2: Write `knip.json` at the repo root**

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    "apps/web": {},
    "apps/discord-bot": {
      "entry": ["src/index.ts"],
      "project": ["src/**/*.ts"]
    },
    "apps/eorzea-bot": {
      "entry": ["src/index.ts", "src/deploy-commands.ts"],
      "project": ["src/**/*.ts"]
    },
    "apps/shout-crafter": {}
  },
  "ignore": ["**/generated/**", "**/.next/**", "**/dist/**"]
}
```

Empty `{}` for `apps/web` and `apps/shout-crafter` deliberately leaves entry detection to knip's built-in Next.js and Vite plugins — do not hand-write entry globs for these two, that's what the plugins are for.

- [ ] **Step 3: Run knip and capture full output**

```bash
cd /home/ehno/xiv-app && npx knip --reporter json > /tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/knip-output.json 2>&1
npx knip > /tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/knip-output.txt 2>&1
cat /tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/knip-output.txt
```

Both formats are captured: JSON for later programmatic triage in Task 4, human-readable text for a quick read now.

- [ ] **Step 4: If knip errors out on missing/unresolvable plugin config**

Knip's error messages are specific about what it can't resolve (e.g. an unrecognized workspace, a config file it can't find). If it errors rather than just producing findings:
1. Read the exact error message.
2. Add the minimal config knip's own error message points at (e.g. an explicit `entry` array for a workspace where auto-detection failed) — do not add unrelated config.
3. Re-run and confirm it now produces output instead of erroring.
4. Document what was added and why in your task report — this deviates from the config above only if auto-detection genuinely doesn't work, and should be a small, explainable addition.

If knip runs cleanly with the config above, skip this step entirely.

- [ ] **Step 5: Commit `knip.json` only (not the output files — those are scratchpad, not repo content)**

```bash
git add knip.json package.json pnpm-lock.yaml
git commit -m "chore: add knip for dead-code/unused-export detection (codebase sweep stage 1)"
```

---

## Task 2: Run `jscpd` across the TS/JS workspaces

**Files:**
- Create: `.jscpd.json` (repo root)
- Create (output, not committed): `/tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/jscpd-report/` (jscpd's own output directory)

- [ ] **Step 1: Install jscpd as a root devDependency**

```bash
cd /home/ehno/xiv-app && pnpm add -D -w jscpd
```

- [ ] **Step 2: Write `.jscpd.json` at the repo root**

```json
{
  "threshold": 0,
  "reporters": ["json", "consoleFull"],
  "ignore": [
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/generated/**",
    "**/*.d.ts",
    "**/pnpm-lock.yaml"
  ],
  "absolute": true,
  "gitignore": true,
  "minLines": 5,
  "minTokens": 50,
  "format": ["typescript", "tsx"],
  "output": "/tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/jscpd-report"
}
```

`threshold: 0` means "never fail the process regardless of duplication percentage found" — this is a report-only run, not a CI gate. `minLines: 5` / `minTokens: 50` are a reasonable starting floor to avoid flagging trivial 2-3 line coincidences (e.g. a standard try/catch shape); if the first run produces an overwhelming number of tiny near-misses, raise these in a re-run and note the adjustment.

- [ ] **Step 3: Run jscpd and capture output**

```bash
cd /home/ehno/xiv-app && npx jscpd apps/web apps/discord-bot apps/eorzea-bot apps/shout-crafter 2>&1 | tee /tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/jscpd-console-output.txt
```

The JSON report lands in the `output` directory set in `.jscpd.json`. Confirm it was written:

```bash
ls -la /tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/jscpd-report/
```

- [ ] **Step 4: Commit `.jscpd.json` only**

```bash
git add .jscpd.json
git commit -m "chore: add jscpd config for duplicate-code detection (codebase sweep stage 1)"
```

---

## Task 3: Agent-driven structural duplication pass on the VenueManager plugin

**Files:** none in the plugin repo are modified — this is a read-only investigation task, output goes to the scratchpad.

**Context:** No automated C# duplicate-code tool is being installed for a 35-file plugin — not worth the setup cost. Instead, this task greps for repeated structural patterns by hand/by agent: methods with near-identical shapes, repeated ImGui draw-block patterns (a UI framework used heavily across `UI/Tabs/*.cs`), repeated validation/parsing logic.

- [ ] **Step 1: Survey the plugin's file structure**

```bash
find ~/VenueManager/VenueManager -name "*.cs" | grep -v "obj/\|bin/" | sort
```

- [ ] **Step 2: Grep for common duplication signatures**

Look for repeated patterns across `UI/Tabs/*.cs` specifically (this is where ImGui draw code lives, per the file structure — a natural place for copy-pasted draw blocks to accumulate):

```bash
grep -rn "ImGui.Separator()" ~/VenueManager/VenueManager/UI/Tabs/*.cs | wc -l
grep -rn "ImGui.InputText\|ImGui.InputFloat\|ImGui.Checkbox" ~/VenueManager/VenueManager/UI/Tabs/*.cs | wc -l
grep -rln "try\s*{" ~/VenueManager/VenueManager/**/*.cs 2>/dev/null
```

These counts are a starting signal, not a verdict — high counts of a common ImGui call are expected and not inherently duplication. The actual goal is to read each `UI/Tabs/*.cs` file and note any block of 5+ lines that appears near-verbatim in more than one file (e.g. the same status-line rendering pattern, the same masked-input-with-eye-icon pattern, the same section-header styling block) — these are exactly the kind of thing `DrawSectionSeparator()` already consolidated in `SettingsTab.cs` per the Phase 5 work; the question is whether similar consolidation opportunities exist elsewhere.

- [ ] **Step 3: Write findings to a scratchpad file**

Write `/tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/plugin-duplication-findings.md` listing:
- Each near-duplicate block found: which files, approximate line ranges, what the shared pattern is, and a one-line judgment on whether it's worth extracting to a shared helper.
- Any dead code noticed along the way (unreferenced private methods, unused fields) — this task's primary focus is duplication, but flag dead code too since you're reading the files anyway.
- Any file that's grown large enough to be a splitting candidate (skim file line counts via `wc -l ~/VenueManager/VenueManager/**/*.cs` for a quick signal).

This file is a working document for Task 4, not committed to the plugin repo.

---

## Task 4: Compile the findings report

**Files:**
- Create: `docs/superpowers/plans/2026-08-15-codebase-sweep-findings-report.md`

- [ ] **Step 1: Read all three raw outputs**

```bash
cat /tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/knip-output.txt
cat /tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/jscpd-console-output.txt
cat /tmp/claude-1000/-home-ehno/ec9b6814-12d0-479d-810e-f04222fe7146/scratchpad/plugin-duplication-findings.md
```

- [ ] **Step 2: Write the compiled report**

Structure the report at `docs/superpowers/plans/2026-08-15-codebase-sweep-findings-report.md` with these sections (use real findings from the three sources — do not invent example findings if the tools found nothing in a category, just say so explicitly):

```markdown
# Codebase Sweep — Stage 1 Findings Report

Generated 2026-08-15 from `knip`, `jscpd`, and an agent-driven structural pass on the VenueManager plugin. See `docs/superpowers/specs/2026-08-15-codebase-sweep-design.md` for the design this report feeds into (Stage 2: triage + fix).

## Dead code / unused exports / unused files (knip)

[List each finding: file path, what's unused (export name / whole file / dependency), one-line note on whether it looks like a genuine candidate for deletion or a false positive (e.g. an export kept for a planned-but-not-yet-built consumer).]

## Unused dependencies (knip)

[List each unused dependency found per workspace, with the workspace name.]

## Duplicate code blocks (jscpd)

[List each duplication cluster jscpd found above the configured threshold: file paths + line ranges, approximate size (lines/tokens), and a one-line judgment on whether it's a real shared-helper candidate or coincidental similarity (e.g. two files that both happen to have a similar-shaped but semantically different validation block).]

## VenueManager plugin structural duplication (manual pass)

[Findings from Task 3's scratchpad file, cleaned up into the same format.]

## Oversized files

[Any file that stood out as a splitting candidate across either codebase — from knip/jscpd output line-count context or the plugin's manual `wc -l` pass.]

## Other observations

[Anything noticed during this pass that doesn't fit the above categories but is worth Stage 2 knowing about — e.g. inconsistent error-response shapes, dead config/env vars, the already-known `metro-*` pnpm overrides left over from the removed mobile app.]

## Summary counts

[A short tally: N dead exports, N unused deps, N duplication clusters, N oversized files — gives Stage 2 planning a sense of scale before task breakdown.]
```

- [ ] **Step 3: Self-review the report**

Before committing, check: does every finding have enough detail (exact file path, not just "somewhere in apps/web") that Stage 2 planning can act on it without re-running the tools? If any finding is too vague to act on, go back and get the specifics.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-15-codebase-sweep-findings-report.md
git commit -m "docs: add stage 1 findings report for codebase sweep"
```

---

## Task 5: Verify nothing else broke

**Files:** none (verification only)

- [ ] **Step 1: Confirm no source files were touched — this stage only added config files and a report**

```bash
git diff --stat origin/main..HEAD
```

Expected: only `knip.json`, `.jscpd.json`, `package.json`, `pnpm-lock.yaml`, and the two new docs files should appear. No file under `apps/*/app`, `apps/*/src`, or `~/VenueManager` should show as modified (Task 3 was read-only against the plugin repo, which is a separate repo entirely and has no commits from this plan at all).

- [ ] **Step 2: Confirm the existing test/build pipeline still passes** (sanity check that adding two new devDependencies didn't break anything)

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```

Expected: same clean results as before this stage (0 tsc errors, all tests passing) — these tools are dev-only static analysis, they shouldn't touch runtime behavior at all, this step just confirms that assumption held.

- [ ] **Step 3: Report stage complete, do not push**

This stage's commits stay local (in a worktree) until Stage 2's plan exists and you're ready to move forward together — Stage 1 alone has no reason to be deployed, it added no runtime code.
