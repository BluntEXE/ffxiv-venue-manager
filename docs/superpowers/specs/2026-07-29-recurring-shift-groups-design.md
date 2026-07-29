# Recurring Shift Groups (quantity + repeating) — Design

## Problem

Recurring shifts (shipped: `docs/superpowers/specs/2026-07-29-recurring-shifts-design.md`) and
the pre-existing "quantity" field (multiple identical open shifts, e.g. "4 open Bartender
slots tonight") are currently mutually exclusive — turning on the repeating toggle hides
the quantity field and forces the request to create exactly one shift.

Real need, surfaced by live usage: a manager wants 4 open Greeter slots, every week,
indefinitely — quantity and repeating need to work together.

## Design

### Independent series per slot, tagged with a shared group ID

Each of the N slots becomes its own fully independent recurring series (own parent Shift
row, own chain of weekly/biweekly/monthly children, own roll-forward behavior) — exactly
what today's `quantity` already does for non-recurring shifts (N separate client-side `POST`
calls), just with `recurrenceRule` included in each. No change to shift generation,
`lib/recurrence.ts`, or the roll-forward cron: it already loops every parent with
`recurrenceRule` set, independent of how those parents relate to each other.

The only new concept is a **group tag** connecting siblings, so a manager can optionally
cancel all N slots at once instead of one at a time.

### Schema

Add one nullable field to `Shift`:

```prisma
slotGroupId String?
```

Set **only** on parent rows (`parentShiftId == null`), and **only** when a manager submits
`quantity > 1` together with `recurrenceRule` set. The existing non-recurring quantity flow
(today's plain "N open slots, no repeat") is untouched — no group ID, no new behavior.

### Creation (`CreateShiftDialog`)

Before the existing submit loop, when `mode === "open" && repeating && quantity > 1`,
generate one `crypto.randomUUID()` and include it as `slotGroupId` in every one of the N
`POST` request bodies. When quantity is 1 (the common case — a single recurring shift with
or without repeating), no `slotGroupId` is sent, same as today.

### Shift creation API (`POST /api/venues/[venueId]/shifts`)

Accepts an optional `slotGroupId` (string) in the body, written directly to the parent
shift's `slotGroupId` field. No validation beyond "is a string" — it's an opaque tag, not a
foreign key to anything; there's no `SlotGroup` model, just a shared value across sibling
`Shift.parentShiftId IS NULL` rows.

### Cancel, two actions

**Existing** `POST .../shifts/[shiftId]/cancel-series` — unchanged. Cancels just the one
series the clicked shift belongs to (resolve to parent, cancel parent + its children).

**New** `POST .../shifts/[shiftId]/cancel-group` — resolves the clicked shift to its parent
(same `parentShiftId ?? id` logic), reads that parent's `slotGroupId`. If null, behaves
identically to `cancel-series` (no group — cancelling "the group" of one is the same as
cancelling the one series). If set, finds every other parent (`parentShiftId IS NULL`)
sharing that `slotGroupId` at the same venue, and for each one — including the originally
clicked series — cancels that parent + its children (future, non-terminal only, same
filtering as `cancel-series`). Logs one `CANCEL_SERIES`-style audit entry per parent
cancelled (reuse the existing audit action — this is still "a series got cancelled," just N
times in one request), not a new audit action type.

### UI

The shifts grid's open-shift row currently shows one icon (amber `Repeat` for recurring,
red `Trash2` for one-off, from the just-shipped `DeleteShiftButton`). This becomes two
separate icon buttons when the shift has a non-null `slotGroupId`:

- **Cancel this slot** — the existing amber `Repeat` icon and `cancel-series` call, unchanged.
- **Cancel all slots** — a new icon (visually distinct — e.g. `Layers` or `CopyX` from
  lucide-react, amber, next to the first) calling the new `cancel-group` endpoint. Confirm
  text: "Cancel all N slots in this group? All future instances of every slot will be
  cancelled. This cannot be undone." (N determined client-side isn't reliable without an
  extra query — the confirm text can say "all slots in this group" without a live count
  rather than fetch one just for the dialog copy.)

For a recurring shift with `slotGroupId == null` (the common single-series case — whether or
not `quantity` was ever used, since quantity=1 never sets the tag), only the single existing
button shows, identical to the already-shipped behavior. No UI change for that path.

`apps/web/app/dashboard/[slug]/shifts/page.tsx` already fetches shifts via Prisma `include`
(not `select`), so `slotGroupId` is already present on every `shift` object once the schema
field exists — no query change needed there, only the prop passed to `DeleteShiftButton`.

## Out of scope

- Grouping for non-recurring quantity (today's plain "N open slots, no repeat" stays as N
  fully independent one-off shifts, no group tag, no batch-cancel — not requested).
- A `SlotGroup` model, group naming, or any UI to view/manage a group as a first-class
  object beyond the two cancel actions.
- Changing `quantity`'s existing 1-20 cap or the "assign to staff member" mode (grouping
  only applies to `mode === "open"`, matching where `quantity` already lives today).
