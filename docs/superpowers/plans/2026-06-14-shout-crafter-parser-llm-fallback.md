# Shout Crafter Discord Parser: Regression Tests + LLM Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock in the current `discord-parser.ts` regex behavior with a vitest regression suite, then add a best-effort LLM fallback (Hermes LiteLLM, `gemma-3-12b-it:free`) that fills in fields the regex misses on the Shout Crafter Discord-paste import.

**Architecture:** Part 1 adds `vitest` to `apps/shout-crafter` and a golden-fixture test file for `parseDiscordPost`, plus a new pure `mergeParsedEvents` helper (also tested). Part 2 adds a public, CORS-scoped, rate-limited `POST /api/shout-crafter/parse` route in `apps/web` that calls Hermes' LiteLLM proxy and returns best-guess fields (or `{}` on any failure), a small client fetch helper in `apps/shout-crafter`, and wires it into `ImportPanel.tsx`'s Discord-paste flow with a new `aiChecking` loading state.

**Tech Stack:** Vite + React 19 + TypeScript (`apps/shout-crafter`), vitest, Next.js App Router (`apps/web`), Hermes LiteLLM proxy at `192.168.1.253:4000`.

---

## File Structure

- **Modify:** `apps/shout-crafter/package.json` — add `vitest` dev dep + `test` script
- **Modify:** `apps/shout-crafter/vite.config.ts` — add `test` config block
- **Modify:** `apps/shout-crafter/src/lib/discord-parser.ts` — add exported `mergeParsedEvents`
- **Create:** `apps/shout-crafter/src/lib/discord-parser.test.ts` — 10 golden fixtures for `parseDiscordPost`
- **Create:** `apps/shout-crafter/src/lib/merge-parsed-events.test.ts` — tests for `mergeParsedEvents`
- **Modify:** `apps/web/.env.example` — add Hermes config keys
- **Modify:** `apps/web/.env` — add real Hermes config values
- **Create:** `apps/web/app/api/shout-crafter/parse/route.ts` — LLM fallback API route
- **Create:** `apps/shout-crafter/src/lib/ai-parse.ts` — client fetch helper
- **Modify:** `apps/shout-crafter/src/components/ImportPanel.tsx` — async Discord-parse flow + `aiChecking` state

---

### Task 1: Add vitest to shout-crafter

**Files:**
- Modify: `apps/shout-crafter/package.json`
- Modify: `apps/shout-crafter/vite.config.ts`

- [ ] **Step 1: Add vitest as a dev dependency**

```bash
cd /home/ehno/xiv-app && pnpm --filter shout-crafter add -D vitest
```

- [ ] **Step 2: Add a `test` script**

In `apps/shout-crafter/package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

(Full scripts block becomes: `"dev"`, `"build"`, `"lint"`, `"preview"`, `"test"`.)

- [ ] **Step 3: Add a `test` config block to vite.config.ts**

`apps/shout-crafter/vite.config.ts` currently:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

Change to:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 4: Smoke-test the runner**

Run: `pnpm --filter shout-crafter test`
Expected: vitest runs and reports "No test files found" (exit non-zero is fine here — there are no test files yet). If vitest itself fails to start (config/plugin error), fix that before continuing.

- [ ] **Step 5: Commit**

```bash
cd /home/ehno/xiv-app && git add apps/shout-crafter/package.json apps/shout-crafter/pnpm-lock.yaml apps/shout-crafter/vite.config.ts pnpm-lock.yaml
git commit -m "test(shout-crafter): add vitest runner"
```

(If the monorepo uses a single root `pnpm-lock.yaml`, only that one will have changed — adjust the `git add` to whichever lockfile(s) actually show as modified via `git status`.)

---

### Task 2: Discord parser regression fixtures

**Files:**
- Create: `apps/shout-crafter/src/lib/discord-parser.test.ts`

This task locks in **current** behavior of `parseDiscordPost`, including two known quirks (documented inline, not fixed).

- [ ] **Step 1: Write the test file with placeholder `expected: {}` for every case**

Create `apps/shout-crafter/src/lib/discord-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseDiscordPost } from './discord-parser'
import type { ParsedEvent } from '../types'

describe('parseDiscordPost', () => {
  it('parses "Music by:" lists with a starred venue, presents:, comma ward/plot, ST range, and both links', () => {
    const input = `★ Moonlit Lounge ★
presents: Velvet Nights
Ward 12, Plot 3
6 PM ST - 9 PM ST
Music by: DJ Aria, DJ Sol
discord.gg/moonlit
partake.gg/events/4521`
    const expected: ParsedEvent = {}
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('parses "Soundscape curated by:" lists with a ✦-decorated venue and pipe-separated ward/plot', () => {
    const input = `✦ The Glass Atrium ✦
Soundscape curated by: Echo, Vex
Ward 4 | Plot 22
7:00 PM ST - 10:00 PM ST`
    const expected: ParsedEvent = {}
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('parses "presents:" event names with "at the X" venue extraction and dash-separated W-P', () => {
    const input = `Event Horizon presents: Neon Dreams
at the Skybound Terrace
W8-P15
5 PM ST - 8 PM ST`
    const expected: ParsedEvent = {}
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('converts "Time: ... GMT+1" to ST and parses "Name — HH:MM" (name-before-dash) DJ lineups', () => {
    const input = `Ninja's Hideaway
Time: 7:00 PM - 11:00 PM GMT+1
🎧 DJ Frostbyte — 19:00
🎧 Luna Vex — 20:00`
    const expected: ParsedEvent = {}
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('derives a time range from "HH:MM - Name" slot lineups with comma ward/plot', () => {
    const input = `Velvet Room
18:00 - DJ Nova
19:00 - DJ Star
20:00 - DJ Comet
Ward 6, Plot 9`
    const expected: ParsedEvent = {}
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('derives a time range from "HH:MM  Name" (double-space, no dash) slot lineups with space-separated W/P', () => {
    const input = `Aurora Club
19:00  DJ Echo
20:00  DJ Pulse
Ward 3 Plot 7`
    const expected: ParsedEvent = {}
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('parses multi-slot "HH:MM → HH:MM ST - Name" arrow ranges with comma W/P', () => {
    const input = `Crystal Veil Lounge
17:00 → 18:00 ST - Ti Beats
18:00 → 19:00 ST - Mira Sol
W10, P2`
    const expected: ParsedEvent = {}
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('KNOWN QUIRK: a starred name is captured as the tagline, so the identical venueName match is suppressed (eventName === venueName)', () => {
    const input = `★ Starlight Pavilion ★
GRAND OPENING NIGHT
Ward 14 - Plot 30
discord.gg/starlight | partake.gg/events/9981`
    const expected: ParsedEvent = {}
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('KNOWN QUIRK: bold markdown in a "Music by:" line is matched by the bold-venue regex before the DJ names are parsed, so venueName ends up being the first bolded DJ name', () => {
    const input = `Hollow Reverie
Music by: **DJ Nyx**, **DJ Vale**
Ward 9, Plot 1
8 PM ST - 11 PM ST
discord.gg/hollowreverie`
    const expected: ParsedEvent = {}
    expect(parseDiscordPost(input)).toEqual(expected)
  })

  it('parses a ✧-decorated venue with pipe-separated location, a single arrow ST range, and multiple emoji "Name — HH:MM" DJ slots', () => {
    const input = `✧ Echo Chamber ✧ │ Ward 2 | Plot 18
17:00 → 19:00 ST
DJ Lineup:
🎧 Aria Frost — 17:00
🎧 Solene — 18:00`
    const expected: ParsedEvent = {}
    expect(parseDiscordPost(input)).toEqual(expected)
  })
})
```

- [ ] **Step 2: Run the suite and capture the actual output for each case**

Run: `pnpm --filter shout-crafter test`

Every test will fail with a diff showing `- Expected {}` vs `+ Received {...}`. For each failing case, copy the **Received** object's contents into that case's `expected: ParsedEvent = { ... }` literal exactly as printed (field order doesn't matter, but values and presence/absence of keys must match exactly — e.g. don't add a key with value `undefined`, omit it entirely if the parser didn't set it).

- [ ] **Step 3: Re-run until all 10 pass**

Run: `pnpm --filter shout-crafter test`
Expected: `10 passed`. If any case still fails after transcribing, re-check the diff and fix the `expected` literal (do not edit `discord-parser.ts` — this phase is regression-locking only).

- [ ] **Step 4: Commit**

```bash
cd /home/ehno/xiv-app && git add apps/shout-crafter/src/lib/discord-parser.test.ts
git commit -m "test(shout-crafter): add regression fixtures for parseDiscordPost"
```

---

### Task 3: `mergeParsedEvents` helper

**Files:**
- Modify: `apps/shout-crafter/src/lib/discord-parser.ts`
- Create: `apps/shout-crafter/src/lib/merge-parsed-events.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/shout-crafter/src/lib/merge-parsed-events.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mergeParsedEvents } from './discord-parser'
import type { ParsedEvent } from '../types'

describe('mergeParsedEvents', () => {
  it('keeps regex-derived values when present', () => {
    const regex: ParsedEvent = { venueName: 'Velvet Room', openTime: '18:00-20:00 ST' }
    const llm: ParsedEvent = { venueName: 'Wrong Name', openTime: '19:00-21:00 ST', djs: 'DJ Echo' }
    expect(mergeParsedEvents(regex, llm)).toEqual({
      venueName: 'Velvet Room',
      openTime: '18:00-20:00 ST',
      djs: 'DJ Echo',
    })
  })

  it('fills in fields the regex left empty or undefined', () => {
    const regex: ParsedEvent = { venueName: '', tagline: undefined, location: 'W6 P9' }
    const llm: ParsedEvent = { venueName: 'Aurora Club', tagline: 'Glow Night', location: 'W1 P1' }
    expect(mergeParsedEvents(regex, llm)).toEqual({
      venueName: 'Aurora Club',
      tagline: 'Glow Night',
      location: 'W6 P9',
    })
  })

  it('does not overwrite a present field with an empty LLM value', () => {
    const regex: ParsedEvent = { djs: 'DJ Echo' }
    const llm: ParsedEvent = { djs: '' }
    expect(mergeParsedEvents(regex, llm)).toEqual({ djs: 'DJ Echo' })
  })

  it('returns the regex result unchanged when the LLM result is empty', () => {
    const regex: ParsedEvent = { venueName: 'Aurora Club', openTime: '19:00-20:00 ST' }
    expect(mergeParsedEvents(regex, {})).toEqual(regex)
  })

  it('merges isAdult only when the regex result did not set it', () => {
    const regex: ParsedEvent = { venueName: 'Aurora Club' }
    const llm: ParsedEvent = { isAdult: true }
    expect(mergeParsedEvents(regex, llm)).toEqual({ venueName: 'Aurora Club', isAdult: true })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter shout-crafter test merge-parsed-events`
Expected: FAIL — `mergeParsedEvents` is not exported from `./discord-parser`.

- [ ] **Step 3: Implement `mergeParsedEvents`**

In `apps/shout-crafter/src/lib/discord-parser.ts`, add this exported function (e.g. directly above `export function parseDiscordPost`):

```typescript
export function mergeParsedEvents(regex: ParsedEvent, llm: ParsedEvent): ParsedEvent {
  const merged: ParsedEvent = { ...regex }
  for (const key of Object.keys(llm) as (keyof ParsedEvent)[]) {
    const regexValue = regex[key]
    const llmValue = llm[key]
    const regexIsEmpty = regexValue === undefined || regexValue === ''
    const llmHasValue = llmValue !== undefined && llmValue !== ''
    if (regexIsEmpty && llmHasValue) {
      merged[key] = llmValue
    }
  }
  return merged
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter shout-crafter test`
Expected: all tests pass (10 from Task 2 + 5 from this task = 15 passed).

- [ ] **Step 5: Commit**

```bash
cd /home/ehno/xiv-app && git add apps/shout-crafter/src/lib/discord-parser.ts apps/shout-crafter/src/lib/merge-parsed-events.test.ts
git commit -m "feat(shout-crafter): add mergeParsedEvents for regex/LLM result merging"
```

---

### Task 4: Hermes LiteLLM config

**Files:**
- Modify: `apps/web/.env.example`
- Modify: `apps/web/.env`

- [ ] **Step 1: Retrieve the LiteLLM API key from Hermes**

Run: `ssh root@192.168.1.253 "grep -i -A1 'api_key\|master_key' /etc/litellm/config.yaml"`

Note the key value for the next step (per memory `reference_hermes_ssh_user.md`, Hermes SSH is always `root`, never `ehno`).

- [ ] **Step 2: Add placeholder keys to `.env.example`**

In `apps/web/.env.example`, append:

```bash
# Hermes LiteLLM proxy (Shout Crafter Discord-paste LLM fallback)
HERMES_LITELLM_URL=http://192.168.1.253:4000
HERMES_LITELLM_API_KEY=
```

- [ ] **Step 3: Add real values to `.env`**

In `apps/web/.env`, append the same two keys with the real URL and the key value retrieved in Step 1:

```bash
HERMES_LITELLM_URL=http://192.168.1.253:4000
HERMES_LITELLM_API_KEY=<value from Step 1>
```

- [ ] **Step 4: Commit `.env.example` only**

`.env` is gitignored (contains secrets) — only commit the example file:

```bash
cd /home/ehno/xiv-app && git add apps/web/.env.example
git commit -m "chore(web): document HERMES_LITELLM_* env vars for shout-crafter parse fallback"
```

---

### Task 5: LLM fallback API route

**Files:**
- Create: `apps/web/app/api/shout-crafter/parse/route.ts`

- [ ] **Step 1: Write the route**

Create `apps/web/app/api/shout-crafter/parse/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const SHOUT_ORIGIN = "https://shout.xivvenuemanager.com"

const STRING_FIELDS = ["venueName", "tagline", "server", "location", "openTime", "djs", "links"] as const

interface ExtractedFields {
  venueName?: string
  tagline?: string
  server?: string
  location?: string
  openTime?: string
  djs?: string
  links?: string
  isAdult?: boolean
}

const SYSTEM_PROMPT = `You extract FFXIV venue event details from a pasted Discord post.
Return ONLY a JSON object (no markdown, no commentary) with any of these keys you can confidently determine:
- venueName: the venue or location hosting the event
- tagline: the event name or vibe/theme
- server: the FFXIV data center and/or world (e.g. "Crystal Mateus")
- location: in-game housing location as "W<ward> P<plot>"
- openTime: opening time range in Server Time as "HH:MM-HH:MM ST"
- djs: comma-separated list of DJ or performer names
- links: relevant Discord/Partake/etc URLs separated by " | "
- isAdult: true if the post indicates 18+/NSFW/adult content, otherwise omit

Omit any key you cannot determine. Do not include any text outside the JSON object.`

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", SHOUT_ORIGIN)
  res.headers.set("Access-Control-Allow-Credentials", "true")
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

function sanitizeFields(raw: unknown): ExtractedFields {
  const result: ExtractedFields = {}
  if (typeof raw !== "object" || raw === null) return result
  const obj = raw as Record<string, unknown>
  for (const field of STRING_FIELDS) {
    const value = obj[field]
    if (typeof value === "string" && value.trim()) result[field] = value.trim()
  }
  if (typeof obj.isAdult === "boolean") result.isAdult = obj.isAdult
  return result
}

async function handler(req: NextRequest): Promise<NextResponse> {
  let text = ""
  try {
    const body = await req.json()
    if (typeof body?.text === "string") text = body.text
  } catch {
    return cors(NextResponse.json({}, { status: 200 }))
  }
  if (!text.trim()) return cors(NextResponse.json({}, { status: 200 }))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(`${process.env.HERMES_LITELLM_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HERMES_LITELLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemma-3-12b-it:free",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) return cors(NextResponse.json({}, { status: 200 }))

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== "string") return cors(NextResponse.json({}, { status: 200 }))

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return cors(NextResponse.json({}, { status: 200 }))

    const parsed = JSON.parse(jsonMatch[0])
    return cors(NextResponse.json(sanitizeFields(parsed), { status: 200 }))
  } catch {
    return cors(NextResponse.json({}, { status: 200 }))
  } finally {
    clearTimeout(timeout)
  }
}

export const POST = withRateLimit(handler, { requests: 10, window: "1 m" })
```

- [ ] **Step 2: Type-check the route**

Run: `cd /home/ehno/xiv-app && pnpm --filter web exec tsc --noEmit -p tsconfig.json`

(If `apps/web` has a different type-check script, e.g. `pnpm --filter web run typecheck` or it's covered by `pnpm --filter web run build`, use that instead — check `apps/web/package.json` scripts first. The goal is just: no type errors in the new route file.)

Expected: no errors referencing `app/api/shout-crafter/parse/route.ts`.

- [ ] **Step 3: Manual smoke test against Hermes**

Start the web dev server: `pnpm --filter web dev` (in a separate terminal/background), then:

```bash
curl -s -X POST http://localhost:3000/api/shout-crafter/parse \
  -H "Content-Type: application/json" \
  -d '{"text":"★ Test Venue ★\nWard 5, Plot 12\n7 PM ST - 10 PM ST\nMusic by: DJ Test"}'
```

Expected: a JSON object (status 200) — either populated fields from the model, or `{}` if Hermes is unreachable/slow (both are acceptable per spec — the route must never error). Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
cd /home/ehno/xiv-app && git add apps/web/app/api/shout-crafter/parse/route.ts
git commit -m "feat(web): add LLM fallback route for shout-crafter Discord parsing"
```

---

### Task 6: Client fetch helper

**Files:**
- Create: `apps/shout-crafter/src/lib/ai-parse.ts`

- [ ] **Step 1: Write the helper**

Create `apps/shout-crafter/src/lib/ai-parse.ts`:

```typescript
import type { ParsedEvent } from '../types'

const API = 'https://xivvenuemanager.com/api/shout-crafter/parse'

export async function fetchAiParse(text: string): Promise<ParsedEvent> {
  try {
    const res = await fetch(API, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}
```

- [ ] **Step 2: Build check**

Run: `pnpm --filter shout-crafter build`
Expected: succeeds (no type errors).

- [ ] **Step 3: Commit**

```bash
cd /home/ehno/xiv-app && git add apps/shout-crafter/src/lib/ai-parse.ts
git commit -m "feat(shout-crafter): add client helper for LLM parse fallback"
```

---

### Task 7: Wire fallback into ImportPanel

**Files:**
- Modify: `apps/shout-crafter/src/components/ImportPanel.tsx`

- [ ] **Step 1: Add imports and `aiChecking` state**

In `apps/shout-crafter/src/components/ImportPanel.tsx`, change:

```typescript
import { parseDiscordPost } from '../lib/discord-parser'
```

to:

```typescript
import { parseDiscordPost, mergeParsedEvents } from '../lib/discord-parser'
import { fetchAiParse } from '../lib/ai-parse'
```

Add a new state declaration alongside the existing ones (after `const [loading, setLoading] = useState(false)`):

```typescript
const [aiChecking, setAiChecking] = useState(false)
```

- [ ] **Step 2: Make `handleDiscordParse` async with the fallback flow**

Replace:

```typescript
  function handleDiscordParse() {
    setError(null)
    setPending(null)
    if (!discordText.trim()) { setError('Paste some text first'); return }
    showReview(parseDiscordPost(discordText))
  }
```

with:

```typescript
  async function handleDiscordParse() {
    setError(null)
    setPending(null)
    if (!discordText.trim()) { setError('Paste some text first'); return }

    const regexResult = parseDiscordPost(discordText)
    const isThin = !regexResult.venueName && !regexResult.openTime && !regexResult.djs
    if (!isThin) {
      showReview(regexResult)
      return
    }

    setAiChecking(true)
    try {
      const aiResult = await fetchAiParse(discordText)
      showReview(mergeParsedEvents(regexResult, aiResult))
    } finally {
      setAiChecking(false)
    }
  }
```

- [ ] **Step 3: Update the Parse button**

Replace:

```typescript
              <button onClick={handleDiscordParse} className={primaryBtn}>
                Parse
              </button>
```

with:

```typescript
              <button onClick={handleDiscordParse} disabled={aiChecking} className={primaryBtn}>
                {aiChecking ? 'Checking with Local Model…' : 'Parse'}
              </button>
```

- [ ] **Step 4: Build check**

Run: `pnpm --filter shout-crafter build`
Expected: succeeds.

- [ ] **Step 5: Manual browser test**

Run `pnpm --filter shout-crafter dev`, open the app, go to the Discord Paste tab:
1. Paste a post that the regex handles fully (e.g. one of the Task 2 fixtures with venueName + openTime + djs all present) → Parse should resolve immediately, no "Checking with Local Model…" flash.
2. Paste a post with none of venueName/openTime/djs derivable by regex (e.g. a single line of unrelated prose) → button should show "Checking with Local Model…", then resolve to the review step (with whatever fields, if any, the LLM found — or none, falling back to an empty review).

Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
cd /home/ehno/xiv-app && git add apps/shout-crafter/src/components/ImportPanel.tsx
git commit -m "feat(shout-crafter): fall back to LLM parse when regex misses key fields"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test + build pass**

```bash
cd /home/ehno/xiv-app
pnpm --filter shout-crafter test
pnpm --filter shout-crafter build
```

Expected: all 15 tests pass, build succeeds with no type errors.

- [ ] **Step 2: Confirm scope**

`git diff main --stat` should show only the files listed in **File Structure** above (plus lockfile changes from Task 1). No changes to `discord-parser.ts`'s existing regex logic (only the new `mergeParsedEvents` export added), and no changes to the Partake import path.

---

## Self-Review Notes

- **Spec coverage:** Part 1 (vitest + 10 fixtures covering all 9 named format variants) ✓ Task 1-2. Part 2 (API route, config, client integration, `aiChecking` UI copy, merge precedence, best-effort `{}`-on-error, 15s timeout, CORS+no-auth via existing `PUBLIC_PREFIXES`) ✓ Tasks 4-7.
- **Placeholder scan:** Task 2's `expected: ParsedEvent = {}` literals are intentional empirical-capture placeholders, explicitly called out with instructions on how to fill them — not unresolved TODOs.
- **Type consistency:** `mergeParsedEvents(regex: ParsedEvent, llm: ParsedEvent): ParsedEvent` signature is consistent between its definition (Task 3) and usage (Task 7). `fetchAiParse(text: string): Promise<ParsedEvent>` consistent between definition (Task 6) and usage (Task 7).
- **Out of scope confirmed:** No Partake-path changes; no edits to existing regex constants/functions in `discord-parser.ts` beyond adding the new export.
