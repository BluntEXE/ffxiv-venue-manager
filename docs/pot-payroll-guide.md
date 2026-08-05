# Pot Payroll

Pot payroll splits nightly revenue and tips among staff instead of paying hourly. A venue turns it on, sets a tax rate, and picks which roles draw from the pot versus which roles keep their own sales. It's opt-in. Venues that don't enable it see no change anywhere in the app.

## Enable it

Go to **Venue Settings > Pot Payroll**. Check "Enabled" and three more fields appear:

- **Tax percent**: the cut the venue takes off the top, 0 to 100.
- **Include sales in pot**: leave this off and only tips get pooled. Turn it on and regular sales feed the pot too, taxed at your rate.
- **Default tip pooling**: whether new staff start with their tips pooled or kept, until they change it themselves.

Save. The rest of the app now shows pot-payroll fields wherever they apply.

## Set a role's payout mode

Go to **Staff > Roles**, edit a role, and pick a **Pot Payroll Mode**:

- **Standard**: unaffected. Hourly or fixed pay works like it always has.
- **Pot**: this role shares equally in the pot split.
- **Contractor**: this role sets its own prices and gets paid from its own sales, taxed individually. A contractor's gross sales never enter the shared pot. Only the tax skimmed off them does.

Contractor roles get one more checkbox: **Also shares in the pot split**. Check it and a contractor draws a pot share on top of their own sales payout. Leave it unchecked and they're paid purely from what they sold.

This field only appears once pot payroll is enabled for the venue.

## Tip pooling is a personal setting

Every staff member has their own "pool my tips" toggle, on their staff detail page. It's independent of role. A Standard-role bartender can pool tips. A Contractor-role dancer can keep theirs. Whatever a person hasn't set themselves falls back to the venue's default.

## Link a shift to an event

When you create a shift, an **Event** picker shows up once pot payroll is on. Pick the event the shift belongs to. Sales and tips logged during that event get attributed to whoever worked it. That's how the system knows who gets paid what.

A shift without an event link, or a role tagged Standard with no event, behaves the same as before.

## Generate the payout

Mark the event **Completed**. A "Generate Pot Payroll" button appears on the event page. Click it once.

The system pulls every completed shift linked to that event, splits sales and tips by each staffer's role and tip preference, taxes what needs taxing, and divides the pot into equal shares among everyone in Pot mode or Contractor-with-share mode who worked. Contractors get their own sales payout on top, if their sales were above zero.

The result lands on the **Payroll** page as one entry per person, with a "Show breakdown" link that expands into the full numbers: regular sales, contractor sales, pooled tips, pot total, recipient count, and per-person share.

You can only generate once per event. Run it twice and the system rejects the second attempt. No duplicate payout.

## What this doesn't do yet

- No way to void or regenerate a payout once it's created. Check your numbers before you click.
- No per-shift tip override. Tip pooling is set per staff member, not per shift.
- Existing venues don't get moved onto pot payroll for you. It stays off until you turn it on.
