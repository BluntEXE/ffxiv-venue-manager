### Following up from the call

Here's where I landed on our side of the collaboration.

### The Split

Vertical slicing by feature, not by layer.

- Frogge owns: events, VIP tiers/perks, room reservations, profiles, glyph builder, forms/giveaways/etc (Discord-native)
- Venue Manager owns: in-game entry logging, open-shift claiming, live room-occupied status, inventory (plugin/dashboard-native)
- Each side calls the other's API where a feature needs data it doesn't own

### First Integration: VIP Marker

- Pull your VIP tier + perk-redemption data into my in-game star marker
- Right now a manager sets that marker by hand on the dashboard
- Small scope, no schema changes on my end beyond reading your data
- Managers stop double-entering something your bot already tracks

### Second Candidate: Room Management

- Your reservation/lock system driving my live occupied-toggle, instead of a staff member flipping it by hand
- Not scoping this yet. Want the VIP slice to ship first.

### Access

Happy to reciprocate whatever you're offering. I'll get you API keys / read access to whatever you need on my side.

### Parked for Later

Dashboard convergence and monetization are real conversations, just not this one. Keeping the first slice small.
