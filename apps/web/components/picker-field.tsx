"use client"

// Ported from FroggeBot Dashboard (src/components/PickerField.tsx) as a resource drop — NOT
// wired into any page yet. Class names are Frogge's Tailwind tokens (bg-panel, text-text,
// border-border, font-data, accent) and need translating to this app's design system when
// wiring. Feed `options` from lib/discord-rest.ts's getGuildRoles/getGuildChannels (via a
// server component or a small API route). Behavior notes below are Frogge's, unedited.

import { useState } from "react"
import { useRouter } from "next/navigation"

interface PickerOption {
  value: string
  label: string
}

// Shared wrapper for the Role and Channel pickers — both are the same shape: toggle between
// a server-populated <select> and a plain text fallback, plus a refresh button. If `options`
// comes back empty (the page's Discord fetch failed), starts already in manual mode rather
// than rendering a dead, empty <select>.
//
// The <input>/<select> below are keyed by `defaultValue`: both are uncontrolled, and
// `defaultValue` only applies at mount, so a fresh value from the server after a
// revalidatePath-only Server Action Save would otherwise silently never show up until a hard
// navigation. Keying forces a remount (and a fresh defaultValue) only when the actual value
// changed, leaving manualMode/refreshing untouched otherwise.
export function PickerField({
  name,
  options,
  defaultValue,
  emptyLabel,
}: {
  name: string
  options: PickerOption[]
  defaultValue?: string
  emptyLabel?: string
}) {
  const router = useRouter()
  const [manualMode, setManualMode] = useState(options.length === 0)
  const [refreshing, setRefreshing] = useState(false)

  function handleRefresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 600)
  }

  if (manualMode) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          key={defaultValue ?? ""}
          name={name}
          defaultValue={defaultValue}
          placeholder="Discord ID"
          className="w-40 rounded-md border border-border bg-panel px-2 py-1.5 font-data text-[12px] text-text outline-none focus:border-accent"
        />
        {options.length > 0 && (
          <button
            type="button"
            onClick={() => setManualMode(false)}
            className="text-[11px] text-muted hover:text-accent"
          >
            Pick from list
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        key={defaultValue ?? ""}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-[180px] truncate rounded-md border border-border bg-panel px-2 py-1.5 text-[12.5px] text-text outline-none focus:border-accent"
      >
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleRefresh}
        title="Refresh list"
        className={`rounded-md border border-border bg-panel-2 px-1.5 py-1 text-[11px] text-muted hover:border-accent hover:text-text ${refreshing ? "animate-spin" : ""}`}
      >
        ↻
      </button>
      <button type="button" onClick={() => setManualMode(true)} className="text-[11px] text-muted hover:text-accent">
        Enter ID
      </button>
    </div>
  )
}
