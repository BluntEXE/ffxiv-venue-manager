import { useState } from 'react'
import { SHOUT_CHAR_LIMIT } from '../lib/shout-templates'

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
    ? 'text-[#f38ba8]'
    : nearLimit
    ? 'text-[#f9e2af]'
    : 'text-[#a6adc8]'

  async function copy() {
    if (!displayValue) return
    await navigator.clipboard.writeText(displayValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleChange(val: string) {
    // Strip /sh prefix if present so parent state stays clean
    const stripped = val.replace(/^\/sh\s*/i, '')
    onChange(stripped)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#cdd6f4]">Preview</h2>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono ${counterColor}`}>
            {len}/{SHOUT_CHAR_LIMIT}
            {over && ' - over limit!'}
          </span>
          <button
            onClick={copy}
            disabled={!shout}
            className="px-3 py-1.5 bg-[#a6e3a1] text-[#1e1e2e] text-sm font-semibold rounded hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <textarea
        value={displayValue}
        onChange={e => handleChange(e.target.value)}
        rows={4}
        spellCheck={false}
        className={`w-full bg-[#1e1e2e] text-[#cdd6f4] rounded px-3 py-2 text-sm border resize-y focus:outline-none focus:border-[#cba6f7] font-mono ${
          over ? 'border-[#f38ba8]' : 'border-[#45475a]'
        }`}
      />

      {over && (
        <p className="text-xs text-[#f38ba8]">
          Shout is {len - SHOUT_CHAR_LIMIT} characters over the limit. Shorten a field to fit.
        </p>
      )}
    </div>
  )
}
