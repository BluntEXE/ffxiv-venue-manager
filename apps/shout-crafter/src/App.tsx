import { useState, useEffect } from 'react'
import type { ShoutFields, TemplateId, ParsedEvent } from './types'
import { ImportPanel } from './components/ImportPanel'
import { ShoutBuilder } from './components/ShoutBuilder'
import { TemplateSelector } from './components/TemplateSelector'
import { ShoutPreview } from './components/ShoutPreview'
import { buildShout, SEPARATORS, DECORS } from './lib/shout-templates'
import type { SeparatorId, DecorId } from './lib/shout-templates'
import { fetchSession } from './lib/xivvm-auth'
import type { XivVMSession } from './lib/xivvm-auth'
import { SavedShouts } from './components/SavedShouts'
import { FeedbackModal } from './components/FeedbackModal'

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

const btnBase = 'px-3 py-1.5 rounded text-sm font-medium transition-colors'
const btnActive = 'bg-[#cba6f7] text-[#1e1e2e]'
const btnInactive = 'bg-[#45475a] text-[#cdd6f4] hover:bg-[#585b70]'

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
    <div className="min-h-screen bg-[#1e1e2e] text-[#cdd6f4]">
      <header className="border-b border-[#313244] px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-[#cba6f7]">FFXIV Shout Crafter</h1>
          <p className="text-sm text-[#a6adc8] mt-0.5">Craft /shout ads from Partake events or Discord posts.</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <ImportPanel onImport={handleImport} />

        <ShoutBuilder fields={fields} onChange={setFields} />

        <div className="bg-[#313244] rounded p-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[#a6adc8] font-medium uppercase tracking-wide w-20">Template</span>
            <TemplateSelector selected={templateId} onChange={setTemplateId} />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[#a6adc8] font-medium uppercase tracking-wide w-20">Separator</span>
            <div className="flex gap-2">
              {SEPARATORS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSeparatorId(s.id)}
                  className={`${btnBase} font-mono ${separatorId === s.id ? btnActive : btnInactive}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-3 flex-wrap">
            <span className="text-xs text-[#a6adc8] font-medium uppercase tracking-wide w-20 pt-1.5">Venue Style</span>
            <div className="flex gap-2 flex-wrap">
              {DECORS.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDecorId(d.id)}
                  className={`${btnBase} ${decorId === d.id ? btnActive : btnInactive}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <ShoutPreview shout={shout} onChange={setShout} />
        </div>

        {xivvm?.user ? (
          <>
            <div className="bg-[#313244] rounded px-4 py-3 flex items-center gap-2">
              {xivvm.user.image && <img src={xivvm.user.image} className="w-7 h-7 rounded-full" alt="" />}
              <p className="text-sm text-[#cdd6f4] flex-1">Signed in as <span className="font-semibold text-[#cba6f7]">{xivvm.user.name}</span></p>
              <a
                href="https://xivvenuemanager.com/auth/signout-shoutcrafter"
                className="text-xs text-[#6c7086] hover:text-[#f38ba8] transition-colors"
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
          <div className="bg-[#313244] rounded p-4 text-center space-y-1">
            <p className="text-sm text-[#cdd6f4]">Save shouts across your venues.</p>
            <p className="text-xs text-[#a6adc8]">
              Sign into <a href="https://xivvenuemanager.com" className="text-[#cba6f7] hover:underline">XIV Venue Manager</a> to save and reuse your shouts.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-[#313244] px-4 py-4 mt-8">
        <div className="max-w-3xl mx-auto text-xs text-[#6c7086] flex items-center justify-center gap-3">
          <span>Part of <a href="https://xivvenuemanager.com" className="text-[#cba6f7] hover:underline">XIV Venue Manager</a></span>
          {xivvm?.user && (
            <>
              <span>·</span>
              <button
                onClick={() => setShowFeedback(true)}
                className="text-[#6c7086] hover:text-[#a6adc8] transition-colors"
              >
                Feedback
              </button>
            </>
          )}
        </div>
      </footer>

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  )
}
