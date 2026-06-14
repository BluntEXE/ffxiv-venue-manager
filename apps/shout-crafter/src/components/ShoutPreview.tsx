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
