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
