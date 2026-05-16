import { useState, useEffect } from 'react'
import type { ShoutFields, TemplateId } from '../types'
import type { SeparatorId, DecorId } from '../lib/shout-templates'
import { fetchShouts, saveShout, deleteShout } from '../lib/xivvm-shouts'
import type { SavedShout } from '../lib/xivvm-shouts'
import { buildShout } from '../lib/shout-templates'

interface Props {
  currentFields: ShoutFields
  currentTemplate: TemplateId
  currentSeparator: SeparatorId
  currentDecor: DecorId
  onLoad: (fields: ShoutFields, templateId: TemplateId, separatorId: SeparatorId, decorId: DecorId) => void
}

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
    <div className="bg-[#313244] rounded p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#cdd6f4]">My Shouts</h2>
        <button
          onClick={() => setShowSave(s => !s)}
          className="px-3 py-1.5 bg-[#45475a] text-[#cdd6f4] text-sm rounded hover:bg-[#585b70] transition-colors"
        >
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
            className="flex-1 bg-[#1e1e2e] text-[#cdd6f4] placeholder-[#6c7086] rounded px-3 py-2 text-sm border border-[#45475a] focus:border-[#cba6f7] focus:outline-none"
          />
          <button
            onClick={handleSave}
            disabled={saving || !label.trim()}
            className="px-3 py-2 bg-[#cba6f7] text-[#1e1e2e] text-sm font-semibold rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-[#f38ba8]">{error}</p>}

      {shouts.length === 0 ? (
        <p className="text-xs text-[#6c7086]">Nothing saved yet.</p>
      ) : (
        <ul className="space-y-2">
          {shouts.map(s => (
            <li key={s.id} className="flex items-start gap-2 bg-[#1e1e2e] rounded p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#cdd6f4] truncate">{s.label}</p>
                <p className="text-xs text-[#6c7086] truncate mt-0.5">
                  {buildShout(s.fields, s.templateId, s.separatorId, s.decorId).slice(0, 80)}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => onLoad(s.fields, s.templateId, s.separatorId, s.decorId)}
                  className="px-2 py-1 text-xs bg-[#45475a] text-[#cdd6f4] rounded hover:bg-[#585b70] transition-colors"
                >
                  Load
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="px-2 py-1 text-xs bg-[#45475a] text-[#f38ba8] rounded hover:bg-[#585b70] transition-colors"
                >
                  Del
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
