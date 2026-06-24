# Shout Crafter XIV Blue Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin `apps/shout-crafter` from its Catppuccin Mocha theme to the XIV Venue Manager blue design system (`#070b14` bg, `#00b4ff` accent, Cinzel/Outfit/Inter/JetBrains Mono type), per the approved Claude Design prototype, with zero changes to logic, data model, or feature set.

**Architecture:** Pure visual reskin. Port a token subset (CSS vars, fonts, `.xiv-card`, `.xiv-btn-shimmer`, keyframes) into `src/index.css`. Restyle each existing component in place — same props/state/hooks, new Tailwind classes referencing the ported CSS vars. Merge the template/separator/decoration selectors (currently rendered loose in `App.tsx`) into `ShoutBuilder` to match the prototype's single "Build card" layout. Add `lucide-react` for icons (already used by `apps/web`).

**Tech Stack:** Vite + React 19 + TypeScript + Tailwind v4, `lucide-react`. Reference: design handoff bundle at `~/Projects/Shout Crafter Rebrand/design_handoff_shout_crafter_rebrand/` (README.md has full token/layout spec), spec doc `docs/superpowers/specs/2026-06-14-shout-crafter-rebrand-design.md`.

**Verification approach:** This is a CSS/markup-only change — no business logic to unit test. Each task's "test" is `pnpm --filter shout-crafter build` (runs `tsc -b && vite build`) passing with zero errors, which catches broken JSX/prop mismatches. The final task does a manual visual pass with the dev server.

---

### Task 1: Brand assets, fonts, and design tokens

**Files:**
- Create: `apps/shout-crafter/public/xiv-icon.png`
- Create: `apps/shout-crafter/public/starfield.png`
- Create: `apps/shout-crafter/public/fonts/Cinzel-VariableFont_wght.ttf`
- Modify: `apps/shout-crafter/package.json`
- Modify: `apps/shout-crafter/src/index.css`

- [ ] **Step 1: Copy brand assets from the design handoff bundle**

```bash
mkdir -p /home/ehno/xiv-app/apps/shout-crafter/public/fonts
cp "/home/ehno/Projects/Shout Crafter Rebrand/design_handoff_shout_crafter_rebrand/assets/xiv-icon.png" /home/ehno/xiv-app/apps/shout-crafter/public/xiv-icon.png
cp "/home/ehno/Projects/Shout Crafter Rebrand/design_handoff_shout_crafter_rebrand/assets/starfield.png" /home/ehno/xiv-app/apps/shout-crafter/public/starfield.png
cp "/home/ehno/Projects/Shout Crafter Rebrand/design_handoff_shout_crafter_rebrand/fonts/Cinzel-VariableFont_wght.ttf" /home/ehno/xiv-app/apps/shout-crafter/public/fonts/Cinzel-VariableFont_wght.ttf
```

Expected: three files copied, no errors.

- [ ] **Step 2: Add `lucide-react` dependency**

In `apps/shout-crafter/package.json`, add to `dependencies` (keep alphabetical with existing entries):

```json
    "@sentry/browser": "^10.54.0",
    "@tailwindcss/vite": "^4.3.0",
    "lucide-react": "^0.554.0",
    "react": "^19.2.6",
```

Then install:

```bash
cd /home/ehno/xiv-app && pnpm install --filter shout-crafter
```

Expected: lockfile updates, `lucide-react` appears in `node_modules`.

- [ ] **Step 3: Replace `src/index.css` with XIV blue tokens + base styles**

Replace the entire contents of `apps/shout-crafter/src/index.css`:

```css
@import "tailwindcss";

@font-face {
  font-family: 'Cinzel';
  src: url('/fonts/Cinzel-VariableFont_wght.ttf') format('truetype');
  font-weight: 400 900;
  font-style: normal;
  font-display: swap;
}

@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
  /* ---- XIV brand colors ---- */
  --xiv-blue: #00b4ff;
  --xiv-navy: #070b14;
  --card: #0a0f1e;

  --foreground: #cdd6f4;
  --muted-foreground: #9399b2;
  --fg-faint: #6c7086;

  --destructive: #f38ba8;
  --destructive-soft: rgba(243, 139, 168, 0.08);
  --warning: #f9e2af;

  /* ---- Layered blue alphas ---- */
  --blue-004: rgba(0, 180, 255, 0.04);
  --blue-006: rgba(0, 180, 255, 0.06);
  --blue-008: rgba(0, 180, 255, 0.08);
  --blue-010: rgba(0, 180, 255, 0.10);
  --blue-012: rgba(0, 180, 255, 0.12);
  --blue-015: rgba(0, 180, 255, 0.15);
  --blue-018: rgba(0, 180, 255, 0.18);
  --blue-020: rgba(0, 180, 255, 0.20);
  --blue-035: rgba(0, 180, 255, 0.35);
  --blue-045: rgba(0, 180, 255, 0.45);

  --glow-card-inset: inset 0 1px 0 rgba(0, 180, 255, 0.12);

  /* ---- Type families ---- */
  --font-display: 'Cinzel', Georgia, serif;
  --font-heading: 'Outfit', system-ui, sans-serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}

body {
  margin: 0;
  background-color: var(--xiv-navy);
  color: var(--foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

/* Card surface used throughout the app */
.xiv-card {
  background: var(--card);
  border: 1px solid var(--blue-018);
  border-radius: 0.75rem;
  box-shadow: var(--glow-card-inset);
  padding: 22px 24px;
}

/* Primary CTA shimmer sheen */
.xiv-btn-shimmer {
  position: relative;
  overflow: hidden;
}
.xiv-btn-shimmer::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 32%, rgba(255, 255, 255, 0.5) 50%, transparent 68%);
  animation: xivShimmer 2.8s infinite;
  pointer-events: none;
}

@keyframes xivShimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

@keyframes starDrift {
  0%, 100% { transform: scale(1) translate(0, 0); }
  50% { transform: scale(1.07) translate(-1%, 1%); }
}

@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 4: Build to confirm tokens compile**

```bash
cd /home/ehno/xiv-app && pnpm --filter shout-crafter build
```

Expected: build succeeds (PASS). The app will still render the old markup with old colors — that's expected until later tasks.

- [ ] **Step 5: Commit**

```bash
git add apps/shout-crafter/public apps/shout-crafter/package.json apps/shout-crafter/pnpm-lock.yaml apps/shout-crafter/src/index.css pnpm-lock.yaml
git commit -m "shout-crafter: add XIV blue brand assets, fonts, and design tokens"
```

(If pnpm-lock.yaml lives only at the repo root, `git add pnpm-lock.yaml` from root instead.)

---

### Task 2: Restyle `App.tsx` shell — header, layout, footer, auth states

**Files:**
- Modify: `apps/shout-crafter/src/App.tsx` (full rewrite)

- [ ] **Step 1: Replace `App.tsx`**

```tsx
import { useState, useEffect } from 'react'
import type { ShoutFields, TemplateId, ParsedEvent } from './types'
import { ImportPanel } from './components/ImportPanel'
import { ShoutBuilder } from './components/ShoutBuilder'
import { ShoutPreview } from './components/ShoutPreview'
import { buildShout } from './lib/shout-templates'
import type { SeparatorId, DecorId } from './lib/shout-templates'
import { fetchSession } from './lib/xivvm-auth'
import type { XivVMSession } from './lib/xivvm-auth'
import { SavedShouts } from './components/SavedShouts'
import { FeedbackModal } from './components/FeedbackModal'
import { ArrowLeft, LogIn, MessageSquare } from 'lucide-react'

const EMPTY_FIELDS: ShoutFields = {
  venueName: '',
  tagline: '',
  server: '',
  location: '',
  openTime: '',
  isAdult: false,
  djs: '',
  cta: '',
  extras: '',
  links: '',
}

function initials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('')
}

export default function App() {
  const [fields, setFields] = useState<ShoutFields>(EMPTY_FIELDS)
  const [templateId, setTemplateId] = useState<TemplateId>('pre')
  const [separatorId, setSeparatorId] = useState<SeparatorId>('dot')
  const [showFeedback, setShowFeedback] = useState(false)
  const [decorId, setDecorId] = useState<DecorId>('diamond')
  const [xivvm, setXivvm] = useState<XivVMSession | null>(null)

  useEffect(() => {
    fetchSession().then(setXivvm)
  }, [])

  function handleImport(parsed: ParsedEvent) {
    // Merge - only update fields explicitly included in parsed (user chose them in review step)
    setFields(prev => ({
      ...prev,
      ...(parsed.venueName !== undefined && { venueName: parsed.venueName }),
      ...(parsed.tagline !== undefined && { tagline: parsed.tagline }),
      ...(parsed.server !== undefined && { server: parsed.server }),
      ...(parsed.location !== undefined && { location: parsed.location }),
      ...(parsed.openTime !== undefined && { openTime: parsed.openTime }),
      ...(parsed.djs !== undefined && { djs: parsed.djs }),
      ...(parsed.links !== undefined && { links: parsed.links }),
      isAdult: parsed.isAdult ?? prev.isAdult,
    }))
  }

  const generated = buildShout(fields, templateId, separatorId, decorId)
  const [shout, setShout] = useState(generated)

  // Sync auto-generated value whenever fields/options change
  useEffect(() => { setShout(generated) }, [generated])

  return (
    <div className="min-h-screen bg-[var(--xiv-navy)] text-[var(--foreground)]">
      <header className="relative overflow-hidden border-b border-[var(--blue-012)]">
        <div
          className="absolute inset-0 opacity-[0.22]"
          style={{
            backgroundImage: 'url(/starfield.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            animation: 'starDrift 22s ease-in-out infinite',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 600px 220px at 50% 0%, rgba(0,180,255,0.14), transparent 70%)',
          }}
        />

        <div className="relative max-w-[880px] mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <img
              src="/xiv-icon.png"
              alt=""
              className="w-9 h-9"
              style={{ filter: 'drop-shadow(0 0 9px rgba(0,180,255,0.55))' }}
            />
            <div>
              <h1
                className="font-bold tracking-[0.04em] text-[1.4rem] leading-tight text-[var(--foreground)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Shout Crafter
              </h1>
              <p className="text-[0.72rem] text-[var(--muted-foreground)]">
                Craft{' '}
                <code
                  className="px-1 rounded-[0.25rem] text-[var(--xiv-blue)] bg-[var(--blue-010)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  /shout
                </code>{' '}
                ads from Partake & Discord
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://xivvenuemanager.com"
              className="flex items-center gap-1 text-[0.8rem] text-[var(--muted-foreground)] hover:text-[var(--xiv-blue)] transition-colors"
            >
              <ArrowLeft size={14} />
              XIV Venue Manager
            </a>
            {xivvm?.user && (
              <div className="flex items-center gap-2 bg-[var(--blue-006)] rounded-full pl-1 pr-3 py-1">
                <div
                  className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[0.65rem] font-bold text-[var(--xiv-navy)]"
                  style={{ background: 'linear-gradient(135deg,#00b4ff,#0a3a5c)', fontFamily: 'var(--font-heading)' }}
                >
                  {initials(xivvm.user.name)}
                </div>
                <span className="text-sm text-[var(--foreground)]">{xivvm.user.name}</span>
              </div>
            )}
          </div>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(0,180,255,0.55), transparent)' }}
        />
      </header>

      <main className="max-w-[880px] mx-auto px-6 py-[26px] pb-14 space-y-[18px]">
        <ImportPanel onImport={handleImport} />

        <ShoutBuilder
          fields={fields}
          onChange={setFields}
          templateId={templateId}
          onTemplateChange={setTemplateId}
          separatorId={separatorId}
          onSeparatorChange={setSeparatorId}
          decorId={decorId}
          onDecorChange={setDecorId}
        />

        <ShoutPreview shout={shout} onChange={setShout} />

        {xivvm?.user ? (
          <>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
              Logged-in view
            </p>
            <div className="xiv-card !py-3 flex items-center gap-3">
              <div
                className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[0.65rem] font-bold text-[var(--xiv-navy)]"
                style={{ background: 'linear-gradient(135deg,#00b4ff,#0a3a5c)', fontFamily: 'var(--font-heading)' }}
              >
                {initials(xivvm.user.name)}
              </div>
              <p className="text-sm flex-1 text-[var(--foreground)]">
                Signed in as <span className="font-semibold text-[var(--xiv-blue)]">{xivvm.user.name}</span>
              </p>
              <a
                href="https://xivvenuemanager.com/auth/signout-shoutcrafter"
                className="text-xs text-[var(--fg-faint)] hover:text-[var(--destructive)] transition-colors"
              >
                Sign out
              </a>
            </div>
            <SavedShouts
              currentFields={fields}
              currentTemplate={templateId}
              currentSeparator={separatorId}
              currentDecor={decorId}
              onLoad={(f, t, s, d) => { setFields(f); setTemplateId(t); setSeparatorId(s); setDecorId(d) }}
            />
          </>
        ) : (
          <>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
              Logged-out view
            </p>
            <div className="xiv-card flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-[0.75rem] bg-[var(--blue-010)] flex items-center justify-center">
                <LogIn size={22} className="text-[var(--xiv-blue)]" />
              </div>
              <h2 className="font-semibold text-[1.02rem] text-[var(--foreground)]" style={{ fontFamily: 'var(--font-heading)' }}>
                Save shouts across your venues
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Sign in to save and reuse your shouts on any device.
              </p>
              <a
                href="https://xivvenuemanager.com"
                className="xiv-btn-shimmer inline-flex items-center gap-2 bg-[var(--xiv-blue)] text-[var(--xiv-navy)] font-bold text-sm px-4 py-2 rounded-[0.5rem]"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                <MessageSquare size={16} />
                Sign in with Discord
              </a>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-[var(--blue-010)]">
        <div className="max-w-[880px] mx-auto px-6 py-6 text-center space-y-2">
          <div className="flex items-center justify-center gap-3 flex-wrap text-sm text-[var(--muted-foreground)]">
            <span>
              Part of{' '}
              <a href="https://xivvenuemanager.com" className="text-[var(--xiv-blue)] hover:underline">
                XIV Venue Manager
              </a>
            </span>
            {xivvm?.user && (
              <>
                <span>·</span>
                <button
                  onClick={() => setShowFeedback(true)}
                  className="hover:text-[var(--xiv-blue)] transition-colors"
                >
                  Feedback
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-[var(--fg-faint)]">
            XIV Venue Manager is not affiliated with SQUARE ENIX CO., LTD.
            <br />
            FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.
          </p>
        </div>
      </footer>

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
cd /home/ehno/xiv-app && pnpm --filter shout-crafter build
```

Expected: FAIL — `ShoutBuilder` props (`templateId`, `onTemplateChange`, etc.) don't exist yet. This is expected; Task 3 adds them. If you want a green build at this checkpoint, that's fine too — proceed to Task 3 either way.

- [ ] **Step 3: Commit**

```bash
git add apps/shout-crafter/src/App.tsx
git commit -m "shout-crafter: restyle app shell with XIV blue header, footer, and auth states"
```

---

### Task 3: Merge selectors into `ShoutBuilder` (Build card) and restyle

**Files:**
- Modify: `apps/shout-crafter/src/components/ShoutBuilder.tsx` (full rewrite)
- Delete: `apps/shout-crafter/src/components/TemplateSelector.tsx` (folded into ShoutBuilder)

- [ ] **Step 1: Replace `ShoutBuilder.tsx`**

```tsx
import type { ShoutFields } from '../types'
import type { TemplateId } from '../types'
import { ALL_WORLDS } from '../lib/worlds'
import { TEMPLATES, SEPARATORS, DECORS } from '../lib/shout-templates'
import type { SeparatorId, DecorId } from '../lib/shout-templates'
import { SlidersHorizontal } from 'lucide-react'

interface Props {
  fields: ShoutFields
  onChange: (fields: ShoutFields) => void
  templateId: TemplateId
  onTemplateChange: (id: TemplateId) => void
  separatorId: SeparatorId
  onSeparatorChange: (id: SeparatorId) => void
  decorId: DecorId
  onDecorChange: (id: DecorId) => void
}

const pillBase = 'px-[13px] py-[7px] rounded-full text-sm font-medium transition-colors'
const pillActive = 'bg-[var(--xiv-blue)] text-[var(--xiv-navy)] font-semibold'
const pillInactive = 'bg-[var(--blue-006)] text-[var(--muted-foreground)] hover:bg-[var(--blue-010)]'

const inputClass =
  'w-full bg-[var(--blue-004)] text-[var(--foreground)] placeholder-[var(--fg-faint)] rounded-[0.5rem] px-3 py-2 text-sm border border-[var(--blue-015)] focus:border-[var(--xiv-blue)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,180,255,0.12)] transition-colors'

const labelClass = 'block text-[0.68rem] font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.07em]'

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 ${full ? 'col-span-2' : ''}`}>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  )
}

function SelectorRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <span className={`${labelClass} w-[104px] pt-1.5 shrink-0`}>{label}</span>
      <div className="flex gap-2 flex-wrap">{children}</div>
    </div>
  )
}

export function ShoutBuilder({
  fields,
  onChange,
  templateId,
  onTemplateChange,
  separatorId,
  onSeparatorChange,
  decorId,
  onDecorChange,
}: Props) {
  function set(key: keyof ShoutFields, value: string) {
    onChange({ ...fields, [key]: value })
  }

  return (
    <div className="xiv-card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[0.625rem] bg-[var(--blue-010)] flex items-center justify-center shrink-0">
          <SlidersHorizontal size={18} className="text-[var(--xiv-blue)]" />
        </div>
        <div>
          <h2 className="font-semibold text-[1.02rem] text-[var(--foreground)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Build your shout
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">Pick a template &amp; style, then edit the fields</p>
        </div>
      </div>

      <SelectorRow label="Template">
        {TEMPLATES.map(t => (
          <button
            key={t.id}
            onClick={() => onTemplateChange(t.id)}
            className={`${pillBase} ${templateId === t.id ? pillActive : pillInactive}`}
          >
            {t.label}
          </button>
        ))}
      </SelectorRow>

      <SelectorRow label="Separator">
        {SEPARATORS.map(s => (
          <button
            key={s.id}
            onClick={() => onSeparatorChange(s.id)}
            className={`${pillBase} ${separatorId === s.id ? pillActive : pillInactive}`}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {s.label}
          </button>
        ))}
      </SelectorRow>

      <SelectorRow label="Name style">
        {DECORS.map(d => (
          <button
            key={d.id}
            onClick={() => onDecorChange(d.id)}
            className={`${pillBase} ${decorId === d.id ? pillActive : pillInactive}`}
          >
            {d.label}
          </button>
        ))}
      </SelectorRow>

      <div className="h-px bg-[var(--blue-010)]" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
        <Field label="Venue Name">
          <input
            value={fields.venueName}
            onChange={e => set('venueName', e.target.value)}
            placeholder="The Velvet Lounge"
            className={inputClass}
          />
        </Field>

        <Field label="Tagline / Vibe" full>
          <input
            value={fields.tagline}
            onChange={e => set('tagline', e.target.value)}
            placeholder="Cozy adult bar"
            className={inputClass}
          />
        </Field>

        <Field label="Data Centre / World">
          <input
            value={fields.server}
            onChange={e => set('server', e.target.value)}
            placeholder="Chaos Omega"
            list="worlds-list"
            className={inputClass}
          />
          <datalist id="worlds-list">
            {ALL_WORLDS.map(w => <option key={w} value={w} />)}
          </datalist>
        </Field>

        <Field label="Location (Ward & Plot)">
          <input
            value={fields.location}
            onChange={e => set('location', e.target.value)}
            placeholder="Goblet W5 P31"
            className={inputClass}
          />
        </Field>

        <Field label="Open Time (ST)">
          <input
            value={fields.openTime}
            onChange={e => set('openTime', e.target.value)}
            placeholder="10PM-2AM ST"
            className={inputClass}
          />
        </Field>

        <div className="space-y-1">
          <label className={labelClass}>Age Rating</label>
          <label className="flex items-center gap-2 h-[38px] cursor-pointer">
            <input
              type="checkbox"
              checked={fields.isAdult}
              onChange={e => onChange({ ...fields, isAdult: e.target.checked })}
              className="w-4 h-4 accent-[var(--xiv-blue)]"
            />
            <span className="text-sm text-[var(--foreground)]">18+ (adult content)</span>
          </label>
        </div>

        <Field label="DJs (optional)">
          <input
            value={fields.djs}
            onChange={e => set('djs', e.target.value)}
            placeholder="DJ Khaosvoid, DJ Sylverhart"
            className={inputClass}
          />
        </Field>

        <Field label="Call to Action">
          <input
            value={fields.cta}
            onChange={e => set('cta', e.target.value)}
            placeholder="Come say hi!"
            className={inputClass}
          />
        </Field>

        <Field label="Extras / Hashtags (optional)">
          <input
            value={fields.extras}
            onChange={e => set('extras', e.target.value)}
            placeholder="#rp #nightlife"
            className={inputClass}
          />
        </Field>

        <Field label="Links (Discord / Partake)" full>
          <input
            value={fields.links}
            onChange={e => set('links', e.target.value)}
            placeholder="discord.gg/xxx | partake.gg/events/123"
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the now-unused `TemplateSelector.tsx`**

```bash
rm /home/ehno/xiv-app/apps/shout-crafter/src/components/TemplateSelector.tsx
```

- [ ] **Step 3: Build**

```bash
cd /home/ehno/xiv-app && pnpm --filter shout-crafter build
```

Expected: PASS (no references to `TemplateSelector` remain — `App.tsx` from Task 2 never imported it).

- [ ] **Step 4: Commit**

```bash
git add apps/shout-crafter/src/components/ShoutBuilder.tsx
git rm apps/shout-crafter/src/components/TemplateSelector.tsx
git commit -m "shout-crafter: merge template/separator/decor selectors into restyled Build card"
```

---

### Task 4: Restyle `ImportPanel`

**Files:**
- Modify: `apps/shout-crafter/src/components/ImportPanel.tsx` (full rewrite)

- [ ] **Step 1: Replace `ImportPanel.tsx`**

```tsx
import { useState } from 'react'
import type { ParsedEvent } from '../types'
import { extractEventId, fetchPartakeEvent } from '../lib/partake'
import { parseDiscordPost } from '../lib/discord-parser'
import { Download } from 'lucide-react'

interface Props {
  onImport: (parsed: ParsedEvent) => void
}

const FIELD_LABELS: { key: keyof ParsedEvent; label: string }[] = [
  { key: 'venueName', label: 'Venue Name' },
  { key: 'tagline',   label: 'Tagline / Vibe' },
  { key: 'server',    label: 'DC / World' },
  { key: 'location',  label: 'Location' },
  { key: 'openTime',  label: 'Open Time' },
  { key: 'djs',       label: 'DJs' },
  { key: 'links',     label: 'Links' },
]

const inputClass =
  'flex-1 bg-[var(--blue-004)] text-[var(--foreground)] placeholder-[var(--fg-faint)] rounded-[0.5rem] px-3 py-2 text-sm border border-[var(--blue-015)] focus:border-[var(--xiv-blue)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,180,255,0.12)] transition-colors'

const primaryBtn =
  'px-4 py-2 bg-[var(--xiv-blue)] text-[var(--xiv-navy)] text-sm font-bold rounded-[0.5rem] hover:opacity-90 disabled:opacity-50 transition-opacity'

const ghostBtn =
  'px-4 py-2 bg-[var(--blue-006)] text-[var(--muted-foreground)] text-sm font-medium rounded-[0.5rem] hover:bg-[var(--blue-010)] transition-colors'

export function ImportPanel({ onImport }: Props) {
  const [tab, setTab] = useState<'partake' | 'discord'>('partake')
  const [partakeUrl, setPartakeUrl] = useState('')
  const [discordText, setDiscordText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<ParsedEvent | null>(null)
  const [selected, setSelected] = useState<Set<keyof ParsedEvent>>(new Set())

  async function handlePartakeFetch() {
    setError(null)
    setPending(null)
    const id = extractEventId(partakeUrl)
    if (!id) { setError('Paste a valid Partake event URL (e.g. partake.gg/events/12345)'); return }
    setLoading(true)
    try {
      const parsed = await fetchPartakeEvent(id)
      showReview(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch event')
    } finally {
      setLoading(false)
    }
  }

  function handleDiscordParse() {
    setError(null)
    setPending(null)
    if (!discordText.trim()) { setError('Paste some text first'); return }
    showReview(parseDiscordPost(discordText))
  }

  function showReview(parsed: ParsedEvent) {
    // Pre-select all fields that have actual content
    const found = new Set(
      FIELD_LABELS
        .filter(({ key }) => parsed[key] !== undefined && parsed[key] !== '')
        .map(({ key }) => key)
    )
    setPending(parsed)
    setSelected(found)
  }

  function toggleField(key: keyof ParsedEvent) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function applySelected() {
    if (!pending) return
    const filtered: ParsedEvent = {}
    for (const key of selected) {
      // @ts-ignore
      filtered[key] = pending[key]
    }
    // isAdult is always reset (boolean, not in field list)
    filtered.isAdult = pending.isAdult ?? false
    onImport(filtered)
    setPending(null)
  }

  const tabClass = (t: typeof tab) =>
    `${pillBase} ${tab === t ? pillActive : pillInactive}`

  const foundFields = pending
    ? FIELD_LABELS.filter(({ key }) => pending[key] !== undefined && pending[key] !== '')
    : []
  const missingFields = pending
    ? FIELD_LABELS.filter(({ key }) => pending[key] === undefined || pending[key] === '')
    : []

  return (
    <div className="xiv-card space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[0.625rem] bg-[var(--blue-010)] flex items-center justify-center shrink-0">
          <Download size={18} className="text-[var(--xiv-blue)]" />
        </div>
        <div>
          <h2 className="font-semibold text-[1.02rem] text-[var(--foreground)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Import event
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">Pull details from a Partake link or a Discord post</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button className={tabClass('partake')} onClick={() => { setTab('partake'); setPending(null) }}>Partake URL</button>
        <button className={tabClass('discord')} onClick={() => { setTab('discord'); setPending(null) }}>Discord Paste</button>
      </div>

      {!pending ? (
        <>
          {tab === 'partake' ? (
            <>
              <p className="text-xs text-[var(--muted-foreground)]">Paste a Partake event URL to pull in event details.</p>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="url"
                  value={partakeUrl}
                  onChange={e => setPartakeUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePartakeFetch()}
                  placeholder="https://partake.gg/events/12345"
                  className={inputClass}
                />
                <button onClick={handlePartakeFetch} disabled={loading} className={primaryBtn}>
                  {loading ? 'Fetching…' : 'Import'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-[var(--muted-foreground)]">Paste a Discord post. We'll pull out what we can.</p>
              <textarea
                value={discordText}
                onChange={e => setDiscordText(e.target.value)}
                placeholder="Paste Discord post text here…"
                rows={5}
                className={`${inputClass} resize-y`}
              />
              <button onClick={handleDiscordParse} className={primaryBtn}>
                Parse
              </button>
            </>
          )}
          {error && <p className="text-[var(--destructive)] text-xs">{error}</p>}
        </>
      ) : (
        <div className="bg-[var(--blue-004)] border border-[var(--blue-015)] rounded-[0.625rem] p-3 space-y-3">
          <p className="text-xs text-[var(--muted-foreground)]">Tick what to bring in. Untick to keep what you have.</p>

          {foundFields.length > 0 && (
            <div className="space-y-1.5">
              {foundFields.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => toggleField(key)}
                    className="w-4 h-4 accent-[var(--xiv-blue)]"
                  />
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.07em] text-[var(--muted-foreground)] w-28 shrink-0">{label}</span>
                  <span className="text-xs text-[var(--foreground)] truncate">{String(pending[key])}</span>
                </label>
              ))}
            </div>
          )}

          {missingFields.length > 0 && (
            <p className="text-xs text-[var(--fg-faint)]">
              Not in this post: {missingFields.map(f => f.label).join(', ')}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={applySelected} disabled={selected.size === 0} className={primaryBtn.replace('px-4', 'px-4 disabled:opacity-40')}>
              Apply {selected.size > 0 ? `${selected.size} field${selected.size > 1 ? 's' : ''}` : ''}
            </button>
            <button onClick={() => setPending(null)} className={ghostBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const pillBase = 'px-[13px] py-[7px] rounded-full text-sm font-medium transition-colors'
const pillActive = 'bg-[var(--xiv-blue)] text-[var(--xiv-navy)] font-semibold'
const pillInactive = 'bg-[var(--blue-006)] text-[var(--muted-foreground)] hover:bg-[var(--blue-010)]'
```

- [ ] **Step 2: Build**

```bash
cd /home/ehno/xiv-app && pnpm --filter shout-crafter build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shout-crafter/src/components/ImportPanel.tsx
git commit -m "shout-crafter: restyle Import card with XIV blue tabs and review step"
```

---

### Task 5: Restyle `ShoutPreview` (Preview card)

**Files:**
- Modify: `apps/shout-crafter/src/components/ShoutPreview.tsx` (full rewrite)

- [ ] **Step 1: Replace `ShoutPreview.tsx`**

```tsx
import { useState } from 'react'
import { SHOUT_CHAR_LIMIT } from '../lib/shout-templates'
import { Megaphone, Copy, Check } from 'lucide-react'

interface Props {
  shout: string
  onChange: (shout: string) => void
}

export function ShoutPreview({ shout, onChange }: Props) {
  const [copied, setCopied] = useState(false)
  const len = shout.length
  const over = len > SHOUT_CHAR_LIMIT
  const nearLimit = len > SHOUT_CHAR_LIMIT * 0.9
  const displayValue = shout ? `/sh ${shout}` : ''

  const counterColor = over
    ? 'text-[var(--destructive)]'
    : nearLimit
    ? 'text-[var(--warning)]'
    : 'text-[var(--muted-foreground)]'

  async function copy() {
    if (!displayValue) return
    await navigator.clipboard.writeText(displayValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  function handleChange(val: string) {
    // Strip /sh prefix if present so parent state stays clean
    const stripped = val.replace(/^\/sh\s*/i, '')
    onChange(stripped)
  }

  return (
    <div
      className="xiv-card space-y-3"
      style={{ borderColor: 'var(--blue-020)', boxShadow: 'var(--glow-card-inset), 0 0 24px rgba(0,180,255,0.05)' }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[0.625rem] bg-[var(--blue-010)] flex items-center justify-center shrink-0">
            <Megaphone size={18} className="text-[var(--xiv-blue)]" />
          </div>
          <div>
            <h2 className="font-semibold text-[1.02rem] text-[var(--foreground)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Preview
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">Editable — paste straight into FFXIV chat</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-xs ${counterColor}`} style={{ fontFamily: 'var(--font-mono)' }}>
            {len}/{SHOUT_CHAR_LIMIT}
            {over && ' · over limit'}
          </span>
          <button
            onClick={copy}
            disabled={!shout}
            className="xiv-btn-shimmer flex items-center gap-1.5 px-4 py-2 bg-[var(--xiv-blue)] text-[var(--xiv-navy)] text-sm font-bold rounded-[0.5rem] disabled:opacity-40 transition-opacity"
            style={{ fontFamily: 'var(--font-heading)', boxShadow: '0 0 14px rgba(0,180,255,0.22)' }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <textarea
        value={displayValue}
        onChange={e => handleChange(e.target.value)}
        rows={4}
        spellCheck={false}
        className={`w-full bg-[var(--blue-004)] text-[var(--xiv-blue)] rounded-[0.5rem] px-3 py-2 text-sm border resize-y focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,180,255,0.12)] transition-colors ${
          over ? 'border-[var(--destructive)] focus:border-[var(--destructive)]' : 'border-[var(--blue-015)] focus:border-[var(--xiv-blue)]'
        }`}
        style={{ fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}
      />

      {over && (
        <p className="text-xs text-[var(--destructive)]">
          Shout is {len - SHOUT_CHAR_LIMIT} characters over the limit. Shorten a field to fit.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
cd /home/ehno/xiv-app && pnpm --filter shout-crafter build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shout-crafter/src/components/ShoutPreview.tsx
git commit -m "shout-crafter: restyle Preview card with shimmer Copy CTA and blue counter"
```

---

### Task 6: Restyle `SavedShouts` (My shouts card)

**Files:**
- Modify: `apps/shout-crafter/src/components/SavedShouts.tsx` (full rewrite)

- [ ] **Step 1: Replace `SavedShouts.tsx`**

```tsx
import { useState, useEffect } from 'react'
import type { ShoutFields, TemplateId } from '../types'
import type { SeparatorId, DecorId } from '../lib/shout-templates'
import { fetchShouts, saveShout, deleteShout } from '../lib/xivvm-shouts'
import type { SavedShout } from '../lib/xivvm-shouts'
import { buildShout } from '../lib/shout-templates'
import { Bookmark, Trash2 } from 'lucide-react'

interface Props {
  currentFields: ShoutFields
  currentTemplate: TemplateId
  currentSeparator: SeparatorId
  currentDecor: DecorId
  onLoad: (fields: ShoutFields, templateId: TemplateId, separatorId: SeparatorId, decorId: DecorId) => void
}

const inputClass =
  'flex-1 bg-[var(--blue-004)] text-[var(--foreground)] placeholder-[var(--fg-faint)] rounded-[0.5rem] px-3 py-2 text-sm border border-[var(--blue-015)] focus:border-[var(--xiv-blue)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,180,255,0.12)] transition-colors'

const ghostBtn =
  'px-3 py-1.5 bg-[var(--blue-006)] text-[var(--muted-foreground)] text-sm font-medium rounded-[0.5rem] hover:bg-[var(--blue-010)] transition-colors'

const primaryBtn =
  'px-3 py-2 bg-[var(--xiv-blue)] text-[var(--xiv-navy)] text-sm font-bold rounded-[0.5rem] hover:opacity-90 disabled:opacity-50 transition-opacity'

export function SavedShouts({ currentFields, currentTemplate, currentSeparator, currentDecor, onLoad }: Props) {
  const [shouts, setShouts] = useState<SavedShout[]>([])
  const [label, setLabel] = useState('')
  const [saving, setS] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchShouts().then(setShouts) }, [])

  async function handleSave() {
    if (!label.trim()) return
    setS(true)
    setError(null)
    const saved = await saveShout({
      label: label.trim(),
      fields: currentFields,
      templateId: currentTemplate,
      separatorId: currentSeparator,
      decorId: currentDecor,
    })
    setS(false)
    if (!saved) { setError('Save failed. Try again.'); return }
    setShouts(prev => [saved, ...prev])
    setLabel('')
    setShowSave(false)
  }

  async function handleDelete(id: string) {
    await deleteShout(id)
    setShouts(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="xiv-card space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[0.625rem] bg-[var(--blue-010)] flex items-center justify-center shrink-0">
            <Bookmark size={18} className="text-[var(--xiv-blue)]" />
          </div>
          <div>
            <h2 className="font-semibold text-[1.02rem] text-[var(--foreground)]" style={{ fontFamily: 'var(--font-heading)' }}>
              My shouts
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">Saved across your venues</p>
          </div>
        </div>
        <button onClick={() => setShowSave(s => !s)} className={ghostBtn}>
          Save this
        </button>
      </div>

      {showSave && (
        <div className="flex gap-2">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Name this shout…"
            autoFocus
            className={inputClass}
          />
          <button onClick={handleSave} disabled={saving || !label.trim()} className={primaryBtn}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}

      {shouts.length === 0 ? (
        <p className="text-xs text-[var(--fg-faint)]">Nothing saved yet.</p>
      ) : (
        <ul className="space-y-2">
          {shouts.map(s => (
            <li key={s.id} className="flex items-start gap-2 bg-[var(--blue-004)] rounded-[0.5rem] p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--foreground)] truncate">{s.label}</p>
                <p className="text-xs text-[var(--fg-faint)] truncate mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                  {buildShout(s.fields, s.templateId, s.separatorId, s.decorId).slice(0, 80)}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => onLoad(s.fields, s.templateId, s.separatorId, s.decorId)}
                  className="px-2 py-1 text-xs bg-[var(--blue-006)] text-[var(--xiv-blue)] rounded-[0.5rem] hover:bg-[var(--blue-010)] transition-colors"
                >
                  Load
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="flex items-center justify-center px-2 py-1 text-xs bg-[var(--destructive-soft)] text-[var(--destructive)] rounded-[0.5rem] hover:bg-[rgba(243,139,168,0.15)] transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build**

```bash
cd /home/ehno/xiv-app && pnpm --filter shout-crafter build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/shout-crafter/src/components/SavedShouts.tsx
git commit -m "shout-crafter: restyle My shouts card with XIV blue rows and trash icon"
```

---

### Task 7: Restyle `FeedbackModal` and final verification

**Files:**
- Modify: `apps/shout-crafter/src/components/FeedbackModal.tsx` (full rewrite)
- Modify: `apps/shout-crafter/src/App.css`

- [ ] **Step 1: Replace `FeedbackModal.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { submitFeedback } from '../lib/feedback'
import type { FeedbackCategory } from '../lib/feedback'

interface Props {
  onClose: () => void
}

const CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: 'BUG_REPORT',      label: 'Bug Report' },
  { id: 'FEATURE_REQUEST', label: 'Feature Request' },
  { id: 'IMPROVEMENT',     label: 'Improvement' },
  { id: 'GENERAL',         label: 'General' },
]

const inputClass =
  'w-full bg-[var(--blue-004)] text-[var(--foreground)] placeholder-[var(--fg-faint)] rounded-[0.5rem] px-3 py-2 text-sm border border-[var(--blue-015)] focus:border-[var(--xiv-blue)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,180,255,0.12)] transition-colors'

const pillBase = 'px-3 py-1.5 rounded-full text-sm font-medium transition-colors'
const pillActive = 'bg-[var(--xiv-blue)] text-[var(--xiv-navy)] font-semibold'
const pillInactive = 'bg-[var(--blue-006)] text-[var(--muted-foreground)] hover:bg-[var(--blue-010)]'

export function FeedbackModal({ onClose }: Props) {
  const [category, setCategory] = useState<FeedbackCategory>('BUG_REPORT')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Auto-close after success
  useEffect(() => {
    if (!success) return
    const t = setTimeout(onClose, 2000)
    return () => clearTimeout(t)
  }, [success, onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit() {
    if (!subject.trim() || !description.trim()) {
      setError('Subject and description are required.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await submitFeedback({ category, subject: subject.trim(), description: description.trim() })
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // Scrim
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal panel */}
      <div className="w-full max-w-lg xiv-card !p-0 overflow-hidden animate-[fadeSlideUp_200ms_ease-out]">
        <div className="px-5 py-4 border-b border-[var(--blue-010)] flex items-center justify-between">
          <h2 className="font-semibold text-[1.02rem] text-[var(--foreground)]" style={{ fontFamily: 'var(--font-heading)' }}>
            Send Feedback
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--fg-faint)] hover:text-[var(--foreground)] transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {success ? (
          <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
            <span className="text-2xl text-[var(--xiv-blue)]">✓</span>
            <p className="text-sm text-[var(--foreground)]">Feedback sent.</p>
            <p className="text-xs text-[var(--fg-faint)]">Thanks for helping improve Shout Crafter.</p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="block text-[0.68rem] font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.07em]">Category</label>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`${pillBase} ${category === c.id ? pillActive : pillInactive}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label className="block text-[0.68rem] font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.07em]">
                Subject <span className="text-[var(--destructive)]">*</span>
              </label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Brief summary"
                maxLength={120}
                className={inputClass}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="block text-[0.68rem] font-semibold text-[var(--muted-foreground)] uppercase tracking-[0.07em]">
                Description <span className="text-[var(--destructive)]">*</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What happened, or what would you like to see?"
                rows={4}
                className={`${inputClass} resize-y`}
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--destructive)]">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSubmit}
                disabled={submitting || !subject.trim() || !description.trim()}
                className="flex-1 xiv-btn-shimmer px-4 py-2 bg-[var(--xiv-blue)] text-[var(--xiv-navy)] text-sm font-bold rounded-[0.5rem] disabled:opacity-40 transition-opacity"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {submitting ? 'Sending…' : 'Send Feedback'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[var(--blue-006)] text-[var(--muted-foreground)] text-sm font-medium rounded-[0.5rem] hover:bg-[var(--blue-010)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Empty out `App.css`**

`App.css` only contained leftover Vite starter-template styles (hero/next-steps/docs sections) that are no longer used by any component, plus a duplicate `fadeSlideUp` keyframe (now in `index.css`). Replace its contents with nothing:

```css
```

(Write the file as a single empty/whitespace file — or remove the import from `main.tsx` if present. Check `main.tsx` first: if it imports `./App.css`, leave the empty file in place rather than editing `main.tsx`, to keep this change minimal.)

- [ ] **Step 3: Build**

```bash
cd /home/ehno/xiv-app && pnpm --filter shout-crafter build
```

Expected: PASS with zero TypeScript errors.

- [ ] **Step 4: Manual visual check with dev server**

```bash
cd /home/ehno/xiv-app && pnpm --filter shout-crafter dev
```

Open the printed local URL in a browser and confirm against the prototype (`Shout Crafter.dc.html` in the handoff bundle, or the Claude Design project):
- Header: starfield/glow background, crystalline X logo, "Shout Crafter" in Cinzel, back-link, signed-in chip (if signed in)
- Import card: Partake/Discord pill tabs, review step renders after a successful parse
- Build card: template/separator/decoration pills + full field grid in one card, tagline and links fields span both columns
- Preview card: `/sh ` prefixed mono text, char counter colors at 0/450/520 chars, Copy button shimmer + Copied! swap
- Logged-out: "Sign in with Discord" card with LogIn icon
- Footer: legal disclaimer text visible

Stop the dev server (Ctrl+C) when done.

- [ ] **Step 5: Commit**

```bash
git add apps/shout-crafter/src/components/FeedbackModal.tsx apps/shout-crafter/src/App.css
git commit -m "shout-crafter: restyle feedback modal and remove unused Vite starter CSS"
```

---

## Spec coverage check
- Theme tokens (Task 1) ✓
- Header w/ starfield + glow + Cinzel + back-link + signed-in chip (Task 2) ✓
- Import card incl. review step (Task 4) ✓
- Build card w/ template/separator/decor + field grid (Task 3) ✓
- Preview card w/ shimmer Copy + counter (Task 5) ✓
- Saved Shouts + signed-in bar (Task 2 + 6) ✓
- Logged-out sign-in card (Task 2) ✓
- Footer w/ legal text (Task 2) ✓
- No SND export / dashboard / wizard / nav chrome work — none added ✓
