# Pot Payroll Mode — Design

## Background

Feature request from TurboGFF, a venue manager, via Ehno's Aetherphone support work:
venues that want a nightly-revenue-share payroll model instead of (or alongside) the
existing hourly/fixed pay — gross sales go into a pot, the venue takes a tax cut, the
rest splits evenly among staff who worked. Tips can be kept individually or pooled into
the same split. Some staff ("contractors" — photographers, court/gamba runners) set
their own service prices and get paid from their own sales rather than the pot.

Two versions of this were discussed: tip pooling alone, and a full sales-revenue pot
including contractors. Rather than build two features, this spec unifies them into one
configurable system — a venue that only wants tip pooling just leaves the "include
sales in pot" setting off. Every knob (tax rate, whether sales feed the pot, whether
contractors share in it) is a venue-level or role-level setting, defaulting to off, so
this has zero effect on venues that don't opt in.

## A math correction worth recording

The original spec from the venue owner's partner defined the pot as "total profits
(gross sales) minus venue tax," with contractors receiving their own sales minus tax
*and* sharing in that same pot. Since gross sales already include contractor sales,
this double-counts contractor revenue — once paid directly, once baked into the pot
they also draw from. The corrected formula (below) builds the pot from non-contractor
sales plus *only the tax skimmed from* contractor sales, not contractor gross.

## Data model

### `VenuePotSettings` (new table, 1:1 with `Venue`)

```prisma
model VenuePotSettings {
  id                String  @id @default(cuid())
  venueId           String  @unique
  enabled           Boolean @default(false)
  taxPercent        Decimal @default(0) @db.Decimal(5, 2) // 0-100, validated at input
  includeSalesInPot Boolean @default(false) // off = tips-only pot
  defaultTipPooled  Boolean @default(false) // staff's default; overridable per-member

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)

  @@map("venue_pot_settings")
}
```

### `Role` (existing model, new fields)

```prisma
enum PotPayoutMode {
  STANDARD    // unaffected by pot payroll; existing hourly/fixed pay
  POT         // shares equally in the pot split
  CONTRACTOR  // own priced services, taxed individually, gross excluded from pot base

  @@map("pot_payout_mode")
}

// added to model Role:
potPayoutMode       PotPayoutMode @default(STANDARD)
contractorSharesPot Boolean       @default(false) // only meaningful when potPayoutMode = CONTRACTOR
```

### `Shift` (existing model, new field)

```prisma
// added to model Shift:
eventId String?
event   Event? @relation(fields: [eventId], references: [id], onDelete: SetNull)
```

Nullable, populated only when a venue has pot mode on and a manager links a shift to
an event via the shift-creation dialog. Unused and invisible for every other venue.

### Membership (existing model, new field)

```prisma
// added to model Membership:
tipPooled Boolean? // null = use venue's defaultTipPooled; non-null overrides it
```

### `PotDistribution` (new table)

Audit record of one pot computation for one event, matching the pattern
`ShiftAuditLog` already sets for money-adjacent actions leaving a trail.

```prisma
model PotDistribution {
  id              String   @id @default(cuid())
  venueId         String
  eventId         String
  regularSales    Decimal  @db.Decimal(10, 2)
  contractorSales Decimal  @db.Decimal(10, 2)
  pooledTips      Decimal  @db.Decimal(10, 2)
  taxPercent      Decimal  @db.Decimal(5, 2) // snapshot of the rate used, not a live FK
  potTotal        Decimal  @db.Decimal(10, 2)
  recipientCount  Int
  perPersonShare  Decimal  @db.Decimal(10, 2)
  generatedById   String
  generatedAt     DateTime @default(now())

  venue       Venue         @relation(fields: [venueId], references: [id], onDelete: Cascade)
  event       Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
  generatedBy User          @relation(fields: [generatedById], references: [id])
  entries     PayrollEntry[] // pot-share + contractor entries this generated

  @@unique([eventId]) // one distribution per event; regenerating requires void/adjust (future work)
  @@map("pot_distributions")
}
```

`PayrollEntry` gets an optional `potDistributionId` back-reference, and its
`PaymentType` enum gains two values — `POT_SHARE` and `CONTRACTOR_PAYOUT` — so pot
and contractor entries reuse the existing table rather than introducing a parallel
payout model, while still being distinguishable from ordinary `HOURLY`/`FIXED_SALARY`
entries in the payroll UI and reports.

## Calculation logic

Triggered by a manager via "Generate pot payroll" on a COMPLETED event (parallel entry
point to the existing per-member payroll generation — doesn't replace it for
`STANDARD`-role staff).

1. **Gather**: all `Shift`s with this `eventId`, status COMPLETED, both `actualStart`
   and `actualEnd` set (no-shows and never-clocked-in shifts are excluded, matching
   `resolveShiftRates`'s existing "unresolved, not silently dropped" pattern — they
   still show up, just outside the recipient count). All `Transaction`s with this
   `eventId`.
2. **Split sales by role mode**: for each `SALE` transaction, resolve the staff
   member's role. `STANDARD`/`POT` → `regularSales`. `CONTRACTOR` → that individual
   contractor's own `contractorSales_i` bucket (kept separate per contractor, never
   pooled with each other).
3. **Split tips**: for each `TIP` transaction, resolve the staff member's pooling
   choice (`Membership.tipPooled` if set, else `VenuePotSettings.defaultTipPooled`).
   Pooled → `pooledTips`. Kept → paid directly to that staff member, untouched by the
   pot. Transactions with no `staffId` (till-level tips) are excluded entirely — no
   owner to resolve a preference for.
4. **Compute the pot**:
   ```
   pot = (settings.includeSalesInPot ? regularSales * (1 - tax) : 0)
       + Σ contractorSales_i * tax
       + pooledTips
   ```
5. **Compute contractor payouts**: each contractor with `contractorSales_i > 0` gets
   `contractorSales_i * (1 - tax)` individually, regardless of pot settings. No entry
   created for a contractor with zero sales that night.
6. **Determine recipients**: every staff member with a qualifying shift (step 1) whose
   role is `POT`, plus `CONTRACTOR`-role staff with `contractorSharesPot = true`.
7. **Split**: `pot / recipientCount`, integer gil. Rounding remainder is not
   redistributed — it stays with the venue, per the original request.
   `recipientCount = 0` still writes the `PotDistribution` (pot amount visible, not
   silently dropped) rather than skipping the record.
8. **Write results**: one `PayrollEntry` per pot recipient (their share), one per
   contractor (their sales-minus-tax payout), kept-tip amounts folded into the
   relevant staff member's own entry as `bonusAmount`. One `PotDistribution` row tying
   it all together.

## UI / workflow

All of the below renders only when `VenuePotSettings.enabled` is true for the venue —
zero UI change for venues that haven't opted in.

- **Venue Settings**: new "Pot Payroll" card — enable toggle; once on, tax %,
  "include sales in pot" toggle, default tip-pooling choice.
- **Roles management** (where `hourlyRate` already lives per role): new payout-mode
  select (Standard / Pot / Contractor), and for Contractor, the "shares in pot"
  checkbox.
- **Staff-facing**: personal "pool my tips" toggle on their own membership settings,
  overriding the venue default.
- **Events**: "Generate pot payroll" action on COMPLETED events, alongside (not
  replacing) existing per-member payroll generation.
- **Shift creation** (`CreateShiftDialog`): optional event picker, shown only when
  pot mode is on.
- **Payroll page**: pot-share and contractor entries render as ordinary
  `PayrollEntry` rows in the existing table, with an expandable breakdown backed by
  the event's `PotDistribution` record.

## Edge cases

- `STANDARD`-role staff on a pot-enabled event: unaffected, normal hourly/fixed
  payroll as today.
- No-show / never-clocked-in shifts: excluded from recipients, not silently dropped
  (visible as unresolved, consistent with existing rate-resolution behavior).
- Zero recipients, nonzero pot: `PotDistribution` still written with
  `recipientCount: 0`, surfaced in UI rather than the money disappearing quietly.
- Re-running generation on an event that already has a `PotDistribution`: blocked by
  the `@@unique([eventId])` constraint, matching the existing shift→`payrollEntryId`
  dedupe pattern. Void/adjust flow is explicitly out of scope for this spec — likely
  fast-follow.
- Till-level tips with no `staffId`: excluded from pooling, no preference to resolve.
- Tax % input clamped 0–100 at the settings form.

## Testing

Unit tests on the pot-calculation function in isolation (mirroring the existing
`payroll-rates` test style): mixed STANDARD/POT/CONTRACTOR roles in one event,
contractor with `sharesPot` both on and off, zero-recipient case, rounding remainder
behavior, kept-vs-pooled tips.

## Explicitly out of scope

- Voiding/regenerating an existing `PotDistribution`.
- Per-shift (rather than per-member) tip pooling override.
- Migrating existing hourly/fixed venues onto pot mode automatically — this is
  purely opt-in, additive, and coexists with the current payment model.
