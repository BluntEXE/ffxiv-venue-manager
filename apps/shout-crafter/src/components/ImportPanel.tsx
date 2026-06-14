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
                className={`${inputClass} w-full resize-y`}
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
