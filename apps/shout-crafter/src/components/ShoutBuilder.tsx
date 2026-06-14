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
