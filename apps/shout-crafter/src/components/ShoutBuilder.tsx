import type { ShoutFields } from '../types'
import { ALL_WORLDS } from '../lib/worlds'

interface Props {
  fields: ShoutFields
  onChange: (fields: ShoutFields) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-[#a6adc8] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputClass = "w-full bg-[#1e1e2e] text-[#cdd6f4] placeholder-[#6c7086] rounded px-3 py-2 text-sm border border-[#45475a] focus:border-[#cba6f7] focus:outline-none"

export function ShoutBuilder({ fields, onChange }: Props) {
  function set(key: keyof ShoutFields, value: string) {
    onChange({ ...fields, [key]: value })
  }

  return (
    <div className="bg-[#313244] rounded p-4 space-y-4">
      <h2 className="text-sm font-semibold text-[#cdd6f4]">Fields</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Venue Name">
          <input
            value={fields.venueName}
            onChange={e => set('venueName', e.target.value)}
            placeholder="The Velvet Lounge"
            className={inputClass}
          />
        </Field>

        <Field label="Tagline / Vibe">
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
          <label className="block text-xs font-medium text-[#a6adc8] uppercase tracking-wide">Age Rating</label>
          <label className="flex items-center gap-2 h-[38px] cursor-pointer">
            <input
              type="checkbox"
              checked={fields.isAdult}
              onChange={e => onChange({ ...fields, isAdult: e.target.checked })}
              className="w-4 h-4 accent-[#cba6f7]"
            />
            <span className="text-sm text-[#cdd6f4]">18+ (adult content)</span>
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

        <Field label="Links (Discord / Partake)">
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
