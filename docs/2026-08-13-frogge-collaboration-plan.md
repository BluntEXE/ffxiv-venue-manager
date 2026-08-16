# Frogge collaboration: vertical slicing plan

Context: call with Allegro (Frogge) on 2026-08-13. Full transcript: `~/Downloads/Voice/conversation.md`, action items: `~/Downloads/Voice/message.txt`. Frogge is a Discord-first bot ecosystem for FFXIV venue management (Python backend). Both projects independently built overlapping features, treated as validation, not conflict.

## Split (agreed model: vertical slicing by feature domain, not by layer)

Frogge owns Discord-native features. Venue Manager owns plugin/dashboard-native features. Neither side takes over the other's stack. We call each other's API where a feature needs data the other side owns.

**Frogge (Discord, Python API):**

- Events/shifts config (position + shift + staff, near-identical architecture to ours)
- Time clock (CSV export): Allegro's own view is that ours is more useful since it lives in-game
- VIP tiers, cost tracking, perk definitions, perk redemption tracking
- Room reservation: duration, auto-reset, lock + DM-to-owner
- Profiles (staff bios/photos)
- Glyph builder (interactive Party Finder message builder)
- Forms, leveling, quote board, Lodestone verification, giveaways, raffles, tournaments

**Venue Manager (plugin + web dashboard, our API):**

- In-game patron entry/exit logging
- Open-shift claiming from the dashboard (manager posts, staff claims, no Discord round-trip)
- Room occupied toggle: live in-game status, no duration/scheduling
- VIP star marker on entry (a manager currently sets it as a manual flag on the dashboard)
- Bar inventory mapping
- Shift audit log

## Overlaps: where the integration points are

**VIP tracking.** Frogge owns the tier/perk backend. We own the in-game star marker, which a manager currently feeds by hand. First integration candidate: pull VIP tier and perk-redemption state from Frogge's API into that marker, so managers stop flagging people Frogge's bot already tracks.

**Room management.** Frogge does the scheduling layer (reserve, duration, auto-reset, lock+DM). We do the live-status layer (occupied toggle, no scheduling). These don't compete: a Frogge reservation could set our toggle automatically instead of a staff member flipping it by hand.

**Time clock.** Both have one. Allegro's own assessment: ours is more useful because it's in-game, hers is more useful nowhere in particular. Longer-term this likely consolidates into ours, with Frogge's version either dropped or kept as a Discord-side read view.

## Adoption overlap

Any cross-tool integration only helps a venue running both Frogge and Venue Manager. As it stands, that's one venue. Two teams building the same feature set independently is evidence the problem is common, not evidence venues want to run both tools together, since if that overlap were already common, one team would likely have heard of the other before this call. The VIP slice should be scoped and prioritized as a proof of concept for that reason, not as a growth feature, until dual-adoption is bigger than one venue.

## Sequencing

1. Data access first: Allegro offered API keys/DB access on her side. We reciprocate for our patron/room/VIP data. No feature work until both sides can query each other.
2. First slice: VIP data feeding the plugin star marker. As it stands, only one venue runs both Frogge and Venue Manager, so this slice is a technical proof of concept for cross-stack API sharing, not a user-facing launch. Smallest scope, no schema changes needed on either side beyond a read, low stakes if it goes wrong. Don't polish or announce it beyond that one venue until dual-adoption grows.
3. Second candidate (not yet scoped): room reservation driving our occupied-toggle auto-set.
4. Explicitly deferred, not decided: dashboard convergence. Allegro raised merging her dashboard into ours long-term since we share TypeScript/Next.js/Prisma on the web layer. Both sides agreed this is a "much later" conversation, not a near-term target. Don't let it creep into the first integration slice.
5. Monetization: both sides think the combined tool is worth paying for and cheaper than the current multi-bot-subscription status quo. Not gating anything above, separate discussion for later.

## What NOT to do yet

- Don't build against Frogge's API before access is granted and the data shape is confirmed.
- Don't scope room-reservation integration until the VIP slice ships and both sides have run the API-sharing day to day.
- Don't raise dashboard convergence as a live decision. It's parked, not declined.
