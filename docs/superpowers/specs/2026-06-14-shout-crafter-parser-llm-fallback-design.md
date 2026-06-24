# Shout Crafter Discord Parser: Regression Tests + LLM Fallback

## Goal

Improve the reliability of the Discord-paste import on Shout Crafter:
1. Lock in current regex-parser behavior with a golden-file test suite, so future changes can't silently regress known formats.
2. Add an LLM-based fallback (via Hermes' LiteLLM proxy, `gemma-3-12b-it:free` on OpenRouter) that fills in fields the regex parser misses, improving compatibility with venue post layouts the regex doesn't recognize.

## Background

`apps/shout-crafter/src/lib/discord-parser.ts` parses pasted Discord event posts into a `ParsedEvent` object (`venueName`, `tagline`, `server`, `location`, `openTime`, `djs`, `links`, `isAdult`). It's a chain of ~10 regex heuristics tuned to specific venue post formats observed so far. There is no test coverage for this file, and no app-level test runner configured for `apps/shout-crafter`.

Discord posts vary widely in layout across venues, so the regex approach has a hard ceiling on "no matter the layout" coverage. An LLM fallback handles the long tail of formats without requiring new regex patterns for every venue's house style.

## Part 1: Regex Regression Test Suite

**Tooling:** Add `vitest` as a dev dependency to `apps/shout-crafter` (not currently present). Add a `test` script to `package.json`.

**Test file:** `apps/shout-crafter/src/lib/discord-parser.test.ts`

**Fixtures:** 8-10 realistic Discord post strings, each as a `{ input: string, expected: Partial<ParsedEvent> }` case, covering the format variants already named in the parser's comments:
- "Music by:" / "Soundscape curated by:" DJ lists
- `★ Venue Name ★` / `✦ Name ✦` decorated venue names
- `presents:` event name extraction
- Ward/Plot location in various separator styles (commas, pipes, dashes)
- `HH:MM ST - HH:MM ST` time ranges, including the multi-slot (first start / last end) case
- `Time: 7:00 PM - 11:00 PM GMT+1` offset conversion to ST
- "🎧 Name — HH:MM" (name-before-dash) DJ lineup format
- `HH:MM - Name` and `HH:MM  Name` (double-space, no dash) slot lineups
- Discord + Partake link extraction

Each fixture asserts the exact `ParsedEvent` fields the current code produces. This is a snapshot of *current* behavior, not new behavior — if a fixture's expectation looks wrong (e.g., a known bug), it's documented as a comment but not fixed as part of this work, to keep this phase purely regression-locking.

**Verification:** `pnpm --filter shout-crafter test` passes with all fixtures green.

## Part 2: LLM Fallback

### New API route

`apps/web/app/api/shout-crafter/parse/route.ts` — `POST`, following the same pattern as `apps/web/app/api/shout-crafter/me/route.ts`:
- CORS scoped to `https://shout.xivvenuemanager.com` (same `cors()` helper pattern, `Access-Control-Allow-Methods: POST, OPTIONS`)
- No auth required (covered by existing `/api/shout-crafter/` entry in `PUBLIC_PREFIXES` in `apps/web/proxy.ts`)
- Request body: `{ text: string }`
- Calls Hermes LiteLLM (`http://192.168.1.253:4000/v1/chat/completions`, model `gemma-3-12b-it:free`) with a system prompt instructing the model to extract event details from the pasted text and return ONLY a JSON object with keys: `venueName`, `tagline`, `server`, `location`, `openTime`, `djs`, `links`, `isAdult` (string fields, `isAdult` boolean, omit keys it can't determine)
- Parses the model's response as JSON; any field not matching the expected `ParsedEvent` shape (wrong type, unknown key) is dropped
- Returns `{ ...extractedFields }` as JSON, status 200
- On any error (network failure, timeout, non-JSON response, Hermes unreachable) — returns `{}` with status 200. The fallback is best-effort; a failure here must never break the existing regex-based import.
- Request timeout: 15 seconds (Hermes is on the LAN but `:free` OpenRouter models can be slow)

### Config

`apps/web/.env` (and `.env.example`):
- `HERMES_LITELLM_URL=http://192.168.1.253:4000`
- `HERMES_LITELLM_API_KEY=<from /etc/litellm/config.yaml on Hermes>`

### Client-side integration

`apps/shout-crafter/src/components/ImportPanel.tsx`:
- `handleDiscordParse` becomes `async`
- Flow:
  1. Run `parseDiscordPost(text)` (regex) — unchanged, synchronous
  2. If `venueName`, `openTime`, and `djs` are all empty/undefined on the regex result, set a loading flag and `POST` the raw text to `/api/shout-crafter/parse`
  3. Merge: for each `ParsedEvent` key, keep the regex-derived value if it's present/non-empty; otherwise use the LLM-derived value
  4. Call `showReview(merged)` as today
- New state: `aiChecking: boolean` — while true, the "Parse" button shows "Checking with Local Model…" instead of "Parse"
- If the fallback request fails or returns `{}`, proceed with the regex-only result (no error shown to the user — this is invisible best-effort enrichment)

### Out of scope

- No changes to the Partake import path
- No changes to `discord-parser.ts` regex logic itself (Part 1 only adds tests)
- No UI indication of *which* fields came from the LLM vs regex — the existing review/checkbox step covers user correction either way
