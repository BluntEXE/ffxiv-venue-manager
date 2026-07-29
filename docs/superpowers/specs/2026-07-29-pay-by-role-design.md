# Pay by Role — Design

## Problem

Pay rates currently live only on `Membership.hourlyRate` — one flat rate per staff member per venue. `Role` (the custom role model — Bartender, Greeter, etc.) has no rate field at all, and payroll generation (`apps/web/app/api/venues/[venueId]/payroll/generate/route.ts` and `generate-all/route.ts`) reads `baseRate` straight from `Membership.hourlyRate`, applying it as a single flat multiplier across all of a member's hours in the period.

This doesn't fit venues where the same person works different roles at different rates (e.g. primarily a Greeter, but occasionally covers Bartender shifts at a higher rate).

## Design

### Schema

Add one nullable field to `Role`:

```prisma
hourlyRate Decimal? @db.Decimal(10, 2)
```

Same shape as the existing `Membership.hourlyRate`. Nothing changes on the `MembershipRole` enum (`OWNER`/`MANAGER`/`STAFF`) — rates only ever apply to custom roles and to individual members, never to the account-tier enum.

### Shift creation — role becomes optional on assigned shifts

Today, `createShiftSchema`'s validation forces exactly one of `membershipId` / `roleId` — a shift is either assigned to a specific person (no role recorded) or left open for a role (no person yet). That's why only claimed/open shifts currently carry a `roleId`; directly-assigned shifts never do.

New rule: **at least one** of `membershipId` / `roleId` must be present, not exactly one. Concretely:

- "Assign to staff member" mode: `membershipId` still required. A new **optional** role select lets a manager additionally tag which role that specific shift covers (for pay resolution — see below). Omitting it behaves exactly as today.
- "Leave open" mode: unchanged — `roleId` required, no `membershipId` until claimed.

`apps/web/components/create-shift-dialog.tsx`'s assign-mode branch gains an optional `Select` (reusing the same role list already fetched for open mode), and the POST body conditionally includes `roleId` when one's chosen. The API's `.refine()` changes from `Boolean(a) !== Boolean(b)` (XOR) to `Boolean(a) || Boolean(b)` (at least one).

### Payroll rate resolution — per shift, not per member

Both payroll routes currently compute one `effectiveRate` per member and multiply it by total hours for the whole period. This changes to resolving a rate **per eligible shift**, then summing:

For each eligible (`COMPLETED`, unpaid) shift, in order:

1. **Manual override** — the existing `baseRate` param on `POST .../payroll/generate` (single-member, explicit rate), unchanged in meaning: if a manager passes it, it applies flat to every shift in that request, exactly like today. Only relevant to the single-member route; `generate-all` has no override param today and none is being added.
2. **The shift's own tagged role rate** — if `shift.roleId` is set and that `Role.hourlyRate` is set, use it. This is why the shift-level role tag matters: it's the only reliable per-shift signal, and it wins over the person's personal rate for that specific shift.
3. **The person's own rate** — `Membership.hourlyRate`, if set.
4. **Their primary role's default rate** — `Membership.roleId` → that `Role.hourlyRate`, if set. (Only the primary custom role, not `MembershipRoleAssignment` additional roles — those never factor into pay resolution, to keep this predictable and auditable.)
5. **No rate found** — this shift is excluded from the generated entry (see "Partial resolution" below).

`totalAmount` becomes `Σ (shift.hours × resolved_rate)` across all shifts that resolved to a rate, instead of `flatRate × totalHours`. `hoursWorked` on the `PayrollEntry` reflects only the hours from shifts that were actually included.

`PayrollEntry.baseRate` keeps being populated (existing field, not removed), but its meaning shifts: since the real computation happens per-shift, `baseRate` becomes `totalAmount / totalHours` — an informational effective-average rate for display, not a multiplier anyone should recompute from.

### Partial resolution

If some of a member's eligible shifts resolve to a rate and others don't (no role tag, no personal rate, no primary-role rate), the generated payroll entry includes **only the resolvable shifts** — `payrollEntryId` stays null on the rest, so they remain eligible for a future run once a rate exists somewhere in the chain (a personal rate gets set, or the relevant role gets a rate). This is a default judgment call, not something the user explicitly confirmed — flagged here in case all-or-nothing-per-member (today's behavior) is actually wanted instead.

### `generate-all` preview (`GET`)

The preview endpoint's `getEligibleShiftsPerMember` currently computes one `rate`/`estimatedTotal` per member the same flat way. It updates to the same per-shift resolution and sums an estimated total the same way the real generation does, so the preview a manager sees matches what generation will actually produce.

### UI

**Roles management** (`apps/web/app/dashboard/[slug]/staff/roles/page.tsx`): the create/edit role dialog gains an "Hourly Rate (optional)" input alongside the existing name/responsibilities/color fields, and the role list card shows it when set (same treatment as the other optional fields already displayed there).

**Shift creation** (`apps/web/components/create-shift-dialog.tsx`): assign mode gains an optional role `Select`, positioned the same way the required one already appears in open mode.

**Payroll pages**: no new UI beyond correctness — combined totals only, no per-role breakdown (explicitly decided against, to keep this shippable without touching the payroll preview/detail UI's data shape).

## Out of scope

- Per-role breakdown/itemization anywhere in the payroll UI.
- `MembershipRoleAssignment` (additional roles beyond primary) ever factoring into rate resolution.
- Backfilling `roleId` onto existing historical assigned shifts that predate this feature — they simply fall through to personal/primary-role rate resolution, same as before.
- Any change to `generate-all`'s "skip members with no shifts" behavior — only the rate math per shift changes, not the overall member-skip logic.
