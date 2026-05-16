import type { TemplateId } from '../types'
import { TEMPLATES } from '../lib/shout-templates'

interface Props {
  selected: TemplateId
  onChange: (id: TemplateId) => void
}

export function TemplateSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      {TEMPLATES.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}

          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            selected === t.id
              ? 'bg-[#cba6f7] text-[#1e1e2e]'
              : 'bg-[#45475a] text-[#cdd6f4] hover:bg-[#585b70]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
