# Staff Display Name Fallback — Design

## Problem

Staff names show up all over the site (shifts, payroll, sales, Discord webhooks, the live
activity feed) with inconsistent, incomplete fallback logic:

- Most spots do `nickname ?? user.name` (venue nickname, then Discord OAuth name) — no
  character name anywhere.
- Payroll additionally chains `nickname ?? user.displayName ?? user.name` (a third field,
  the user's own global account display name, sits between nickname and Discord name there
  but nowhere else).
- The sales Discord webhook and live SSE feed (`lib/api/transactions.ts`,
  `lib/discord-webhook.ts`) use the raw Discord name only — zero nickname or displayName
  awareness at all.
- The historical timeline feed's staff clock-in/out entries (`timeline/route.ts:141`) also
  use the raw Discord name only.

Character name (the player's actual FFXIV character, linked via `UserCharacter`) should be
the top priority everywhere a staff member's name is shown — that's what other players
recognize them as in-game, which is what all of this (sales, shifts, patron interactions) is
actually about.

## The fallback chain

```
character name → venue nickname → account displayName → Discord name → "Unknown"
```

- **Character name**: `UserCharacter.characterName` for the user, preferring the row with
  `isPrimary: true`; if none is flagged primary, the earliest-linked character
  (`orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1`) — one query, no extra
  branching logic needed, satisfies "use the earliest if nothing's flagged primary."
- **Venue nickname**: `Membership.nickname` — per-venue, set by managers via the staff table.
- **Account displayName**: `User.displayName` — global, set by the user themselves in account
  settings. Kept in the chain (matching what payroll already does) rather than dropped.
- **Discord name**: `User.name` — the OAuth-populated fallback of last resort.
- **"Unknown"**: matches the existing convention used at every current call site.

## Shared helper

New file: `apps/web/lib/display-name.ts`

```typescript
export function resolveDisplayName(input: {
  characterName?: string | null
  nickname?: string | null
  displayName?: string | null
  discordName?: string | null
}): string {
  return input.characterName || input.nickname || input.displayName || input.discordName || "Unknown"
}
```

Pure function, no DB access — safe to import in both server and client components. This
matters for `staff-table.tsx`: it optimistically updates nickname client-side after an inline
edit, so it needs to recompute the resolved name client-side too, not just receive a
pre-computed string from the server.

## Character-lookup convention

Wherever a query already selects `user: { select: { id, name, image } }` for a staff member,
extend it with `displayName` and a primary-character sub-select:

```typescript
user: {
  select: {
    id: true,
    name: true,
    displayName: true,
    image: true,
    characters: {
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      take: 1,
      select: { characterName: true },
    },
  },
},
```

Call sites then read `user.characters[0]?.characterName ?? null` as the `characterName` input
to `resolveDisplayName`.

## Call sites

**Shifts:**

- `apps/web/lib/shift-format.ts` — extend `CalendarShift.membership.user` type with
  `displayName` and `characters`.
- `apps/web/components/shift-day-dialog.tsx` — `staffLabel()` swaps to `resolveDisplayName()`.
- `apps/web/app/dashboard/[slug]/shifts/page.tsx` — extend the `weekShifts` and
  `calendarShifts` queries' user selects; swap all 5 inline `nickname ?? user.name` /
  `nickname ?? user.name ?? "Unknown"` expressions (staff grid names, avatar initials,
  `ClockShiftButton` staffName props, `staffForDialog` mapping).

**Live dashboard:**

- `apps/web/app/dashboard/[slug]/live/page.tsx` — extend the `activeShifts` query, swap the
  `onShiftStaff` mapping (currently `nickname ?? user.name ?? invitedName ?? "Staff"` — keep
  `invitedName` as the fallback immediately before `"Staff"`, since that's for staff who
  haven't accepted their invite yet and have no `User` row at all).

**Payroll:**

- `apps/web/app/dashboard/[slug]/payroll/page.tsx` — extend the relevant queries, swap all 3
  inline `nickname ?? displayName ?? name ?? "Unknown"` expressions.

**Staff management:**

- `apps/web/app/dashboard/[slug]/staff/page.tsx` — extend the staff query, pass
  `characterName`/`displayName`/`discordName` through to `staff-table.tsx` as data (not a
  pre-resolved string).
- `apps/web/components/staff-table.tsx` — call `resolveDisplayName()` client-side for both
  the name display and the search filter (search should match on any of the names a staff
  member could be known by, not just nickname/Discord name).

**Sales (webhook + SSE + timeline):**

- `apps/web/lib/api/transactions.ts` — `createTransaction()` currently selects
  `staff: { select: { id: true, name: true } }` (a `User`, not a `Membership` — `Transaction`
  has no direct membership relation). Add a `Membership.findFirst({ where: { userId:
staffUserId, venueId } })` lookup for the nickname, extend the `staff` select with
  `displayName` and `characters`, resolve once, and use the resolved string for both the
  `venueEventBus.emit` SSE payload (`data.staff.name`) and the `formatSaleLoggedEmbed` call —
  `live-dashboard.tsx`'s SSE consumer needs no changes, it already just displays whatever
  string it receives.
- `apps/web/lib/discord-webhook.ts` — `formatSaleLoggedEmbed`'s `staff` param stays shaped
  `{ name: string | null } | null`; the caller now passes the already-resolved name instead
  of the raw Discord name. No signature change needed.
- `apps/web/app/api/invites/[token]/accept/route.ts` — resolve the joining staff member's
  name (character/displayName/Discord name — nickname will virtually always be null this
  early, but check it for consistency) before calling `formatStaffJoinedEmbed`.
- `apps/web/app/api/venues/[venueId]/timeline/route.ts` — two spots: the sales `staff` select
  (line 94, feeds the historical activity list) and the staff clock-in/out `staffName`
  (line 141, currently `user.name` only with no fallback chain at all).

## Character-link nudge (small addition)

Separate, smaller concern folded into this same plan: nudge users who haven't linked any
character yet, since the whole fallback chain is moot without one.

- New component `apps/web/components/character-link-nudge.tsx` ("use client", dismissible via
  local component state — hides for that page view, reappears next visit, which is the
  intended behavior since the point is to nag until they actually link one).
- Rendered as a sibling immediately below `<AnnouncementBanner>` on both
  `apps/web/app/dashboard/page.tsx` and `apps/web/app/dashboard/[slug]/page.tsx` — same visual
  slot, but a fully separate component and prop, so it can never interfere with or replace an
  actual announcement.
- Visibility is computed server-side in each page: query whether the logged-in user has any
  `UserCharacter` row at all (`prisma.userCharacter.count({ where: { userId } }) === 0`); pass
  that boolean down. No new database table, no dismissal-persistence endpoint — the absence of
  a linked character _is_ the "should still show" condition.
- Links to the existing `apps/web/app/dashboard/account/characters` page.

## Out of scope

- Changing how `nickname` or `displayName` themselves are set/edited — this only changes what
  gets displayed when a caller needs "the" name for a staff member.
- The "services" side of the plugin (`/api/plugin/services`) — confirmed it's a read-only
  catalog endpoint with no staff attribution, nothing to fix there. Sales (`transactions`,
  serviceId optional) is the actual staff-attributed flow the user meant by "sales/services."
- Hard-blocking onboarding until a character is linked — a dismissible nudge only, per
  discussion (blocking would strand users who haven't opened the plugin yet to get
  auto-detected/linked).
