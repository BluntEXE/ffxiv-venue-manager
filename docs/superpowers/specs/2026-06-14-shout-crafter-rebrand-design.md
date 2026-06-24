# Shout Crafter — XIV VM Brand Rebrand

## Status
Mockup approved. Claude Design produced a working interactive prototype ("Shout Crafter.dc.html", project "Shout Crafter Rebrand" at claude.ai/design/p/d9c11fbf-5b27-4958-8f35-06d293ba2200) covering every section below with the real `buildShout` logic wired in. Full design handoff bundle (exact tokens, layout spec, component breakdown, assets, fonts) saved at `~/Projects/Shout Crafter Rebrand/design_handoff_shout_crafter_rebrand/` (README.md is the primary reference). Ready for implementation plan (writing-plans).

## Context
Shout Crafter (`shout.xivvenuemanager.com`, source `apps/shout-crafter/`) is a standalone Vite/React tool for crafting FFXIV `/shout` ads (Partake import, Discord paste parsing, templates, saved shouts). It currently uses the original Catppuccin Mocha dark theme and predates the 2026-05-29 XIV blue brand redesign of the main site.

## Goal
Full visual overhaul to match the XIV Venue Manager brand (XIV blue design system), without changing the existing feature set or page structure (no SND export work — deferred, pending possible script changes).

## Design decisions

1. **Theme**: Replace Catppuccin Mocha tokens with XIV blue design system:
   - Background `#070b14`, card bg `#0a0f1e`
   - Accent `--xiv-blue: #00b4ff`
   - Borders `rgba(0,180,255,0.15-0.25)`, hover `rgba(0,180,255,0.06-0.08)`
   - `font-cinzel` for headings, `.xiv-card` for card surfaces, `.xiv-btn-shimmer` for primary CTAs
   - Source of truth for tokens: `apps/web/app/globals.css`

2. **Page structure**: Keep single-page, vertical flow (no wizard). Sections, top to bottom:
   - **Import** — Partake URL / Discord paste, inline expandable field-review step
   - **Build** — template picker, separators, decoration styles, editable fields
   - **Preview** — live `/sh` text preview, char counter, copy button
   - **Saved Shouts** — saved templates list (logged-in only), load/delete

3. **Header**: Lightweight branded header — small logo + "Shout Crafter" (font-cinzel), small "← XIV Venue Manager" back-link, auth/saved-shouts state on the right. No full site nav chrome.

4. **Token application approach**: `apps/web/app/globals.css` is too large to share directly (separate Vite build, scp deploy, no shared pipeline). Port the relevant token subset (~100-150 lines: CSS vars, font import, `.xiv-card`, `.xiv-btn-shimmer`, button/input/select base styles) into `apps/shout-crafter/src/index.css` / `App.css`.

5. **Approved prototype details** (from Claude Design build):
   - Header: glowing crystalline X brand mark, "Shout Crafter" in Cinzel, drifting starfield + blue glow behind header, "← XIV Venue Manager" back-link, signed-in chip, crystal-gradient hairline divider
   - Import card: Partake URL / Discord Paste segmented tabs, inline expandable field-review step (tick/untick detected fields)
   - Build card: Pre-Opening/Open Now template picker, separator selector (· | •), all 7 name-style decorations, full editable field grid, 18+ toggle
   - Preview card: live `/sh` text via real `buildShout` logic, mono blue-tinted readout, 0-500 char counter (yellow/red thresholds), XIV-blue shimmer Copy CTA
   - Both auth states shown stacked: "Logged-in view" (signed-in bar + My Shouts list with Load/Delete) and "Logged-out view" (Discord sign-in prompt)
   - Prefilled with sample venue "The Velvet Lounge" for a lived-in feel
   - Colors/type/glows sourced from design system's `colors_and_type.css` tokens

## Out of scope
- SND export functionality (deferred — option 1 from earlier brainstorm)
- VM shout-schedule dashboard (separate sub-project — option 5 from earlier brainstorm)
- Multi-step/wizard flow
- Full site nav chrome
- Real Partake fetch in prototype was mocked — real `fetchPartakeEvent` API call slots back in unchanged during implementation

## Next steps
1. ~~Produce mockups via Claude Design~~ — done, prototype approved
2. Invoke writing-plans skill: port approved prototype styling into `apps/shout-crafter/` (token port into `src/index.css`/`App.css`, restyle each component, keep all existing functionality/feature set and props unchanged)
