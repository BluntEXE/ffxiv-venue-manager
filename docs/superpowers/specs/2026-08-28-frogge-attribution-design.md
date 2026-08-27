# Frogge Attribution — Design

## Context

The Frogge merger needs a visible, permanent credit on both the dashboard app and the public landing page — confirmed via the brainstorming skill's visual companion (three rounds, final preview approved with the real logo and link).

## Copy and link

- Text: **"Powered by Frogge"** (not the longer "Powered by Frogge Technology" — wraps awkwardly in the ~140px-wide sidebar footer)
- Links to **https://frogge.tech/**, `target="_blank" rel="noopener noreferrer"` (external link, matches the existing pattern for Ko-fi/Discord/GitHub links elsewhere in this codebase)
- Logo: the provided Frogge frog mascot icon, saved to `apps/web/public/frogge-icon.png` (matches the flat-file convention already used for `xiv-icon.png`)

## Placements (3)

### 1. Dashboard sidebar footer — every dashboard page

`apps/web/components/venue-sidebar.tsx`, inside `NavContent`'s existing footer block (~line 224-229, currently just the "not affiliated with SQUARE ENIX" disclaimer). Add the Frogge link as its own row below that disclaimer, small icon + text, matching the existing muted/faint text-size scale used there.

This single block already renders on both desktop and mobile (it's not behind the `[@media(min-width:1081px)]:hidden` wrapper that gates `MobileBottom`) — one change covers both.

### 2. Landing page hero badge

`apps/web/app/page.tsx`, hero section (~line 103-116). Small pill badge (icon + "Powered by Frogge", linked), placed between the existing "For FFXIV roleplay venue hosts" eyebrow row and the `<h1>`.

### 3. Landing page footer bottom bar

`apps/web/app/page.tsx`, footer bottom bar (~line 924-928, the row with the copyright disclaimer and social icons). Add the Frogge link+icon into that same flex row — copyright text stays on the left, Frogge credit and social icons group on the right (or its own segment if crowded at mobile widths — check live).

## Verification

- `tsc --noEmit` + `eslint` clean, matching repo convention.
- Live check in browser at all three spots, both desktop and mobile viewport widths (sidebar footer's narrow-width wrapping is the specific risk already identified).
- **User has explicitly asked to see the real, live page before this gets closed out** — stop after the live implementation is shown, wait for their go-ahead, don't proceed to PR/merge on my own.

## Out of scope

- No other placement (settings page, admin panel, etc.) — the three above are the full, confirmed set.
- No changes to the Ko-fi/Discord/GitHub link patterns already in place — just adding alongside them.
