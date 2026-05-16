import { useState } from 'react'
import type { ParsedEvent } from '../types'
import { extractEventId, fetchPartakeEvent } from '../lib/partake'
import { parseDiscordPost } from '../lib/discord-parser'

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
    `px-4 py-2 text-sm font-medium rounded-t transition-colors ${
      tab === t ? 'bg-[#313244] text-[#cba6f7]' : 'text-[#a6adc8] hover:text-[#cdd6f4]'
    }`

  const foundFields = pending
    ? FIELD_LABELS.filter(({ key }) => pending[key] !== undefined && pending[key] !== '')
    : []
  const missingFields = pending
    ? FIELD_LABELS.filter(({ key }) => pending[key] === undefined || pending[key] === '')
    : []

  return (
    <div>
      <div className="flex gap-1 mb-0">
        <button className={tabClass('partake')} onClick={() => { setTab('partake'); setPending(null) }}>Partake URL</button>
        <button className={tabClass('discord')} onClick={() => { setTab('discord'); setPending(null) }}>Discord Paste</button>
      </div>

      <div className="bg-[#313244] rounded-b rounded-tr p-4 space-y-3">
        {!pending ? (
          <>
            {tab === 'partake' ? (
              <>
                <p className="text-xs text-[#a6adc8]">Paste a Partake event URL to pull in event details.</p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={partakeUrl}
                    onChange={e => setPartakeUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePartakeFetch()}
                    placeholder="https://partake.gg/events/12345"
                    className="flex-1 bg-[#1e1e2e] text-[#cdd6f4] placeholder-[#6c7086] rounded px-3 py-2 text-sm border border-[#45475a] focus:border-[#cba6f7] focus:outline-none"
                  />
                  <button
                    onClick={handlePartakeFetch}
                    disabled={loading}
                    className="px-4 py-2 bg-[#cba6f7] text-[#1e1e2e] text-sm font-semibold rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {loading ? 'Fetching…' : 'Import'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-[#a6adc8]">Paste a Discord post. We'll pull out what we can.</p>
                <textarea
                  value={discordText}
                  onChange={e => setDiscordText(e.target.value)}
                  placeholder="Paste Discord post text here…"
                  rows={5}
                  className="w-full bg-[#1e1e2e] text-[#cdd6f4] placeholder-[#6c7086] rounded px-3 py-2 text-sm border border-[#45475a] focus:border-[#cba6f7] focus:outline-none resize-y"
                />
                <button
                  onClick={handleDiscordParse}
                  className="px-4 py-2 bg-[#cba6f7] text-[#1e1e2e] text-sm font-semibold rounded hover:opacity-90 transition-opacity"
                >
                  Parse
                </button>
              </>
            )}
            {error && <p className="text-[#f38ba8] text-xs">{error}</p>}
          </>
        ) : (
          <>
            <p className="text-xs text-[#a6adc8]">Tick what to bring in. Untick to keep what you have.</p>

            {foundFields.length > 0 && (
              <div className="space-y-1.5">
                {foundFields.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleField(key)}
                      className="w-4 h-4 accent-[#cba6f7]"
                    />
                    <span className="text-xs font-medium text-[#a6adc8] w-24">{label}</span>
                    <span className="text-xs text-[#cdd6f4] truncate">{String(pending[key])}</span>
                  </label>
                ))}
              </div>
            )}

            {missingFields.length > 0 && (
              <p className="text-xs text-[#6c7086]">
                Not in this post: {missingFields.map(f => f.label).join(', ')}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={applySelected}
                disabled={selected.size === 0}
                className="px-4 py-2 bg-[#cba6f7] text-[#1e1e2e] text-sm font-semibold rounded hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Apply {selected.size > 0 ? `${selected.size} field${selected.size > 1 ? 's' : ''}` : ''}
              </button>
              <button
                onClick={() => setPending(null)}
                className="px-4 py-2 bg-[#45475a] text-[#cdd6f4] text-sm rounded hover:bg-[#585b70] transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
