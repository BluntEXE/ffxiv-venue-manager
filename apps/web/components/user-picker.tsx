"use client"

// Ported from FroggeBot Dashboard (src/components/UserPicker.tsx) as a resource drop — NOT
// wired into any page yet. Two things to adapt when wiring:
//   1. The fetch URL below targets Frogge's route shape (/api/guilds/{guildId}/member-search).
//      This app will want /api/venues/{venueId}/discord/member-search or similar — a thin
//      route wrapping lib/discord-rest.ts's searchGuildMembers(), gated by venue membership,
//      resolving venueId -> guildId server-side.
//   2. Class names are Frogge's Tailwind tokens; translate to this app's design system.
// Behavior notes below are Frogge's, unedited.

import { useEffect, useId, useRef, useState } from "react"

interface MemberOption {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

// Drop-in replacement for a raw Discord-user-ID text input — renders a hidden input under
// the same `name`, so the form handlers reading it never need to change. All mutable state
// (debounce timer, AbortController, highlighted index) lives in refs/useState here, never
// module scope: this component is meant to be mounted many times independently on one page,
// and nothing here may leak between instances.
// Signals "type here to search" rather than "click to open a list" — this box has no fixed
// option set to show on click/focus, unlike PickerField's real <select>, so it needs its own
// affordance distinguishing the two interaction models.
function SearchIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function UserPicker({
  guildId,
  name,
  placeholder,
  initialMember = null,
}: {
  guildId: string
  name: string
  placeholder?: string
  // Pre-seeds the picker with an already-resolved member (e.g. a room's current owner) - without
  // this, the picker always starts blank regardless of what's already saved, and re-submitting the
  // form without deliberately re-picking someone would silently clear the field.
  initialMember?: MemberOption | null
}) {
  const listboxId = useId()
  const [manualMode, setManualMode] = useState(false)
  const [query, setQuery] = useState(initialMember?.displayName ?? "")
  const [manualValue, setManualValue] = useState("")
  const [results, setResults] = useState<MemberOption[]>([])
  const [selected, setSelected] = useState<MemberOption | null>(initialMember)
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [searchFailed, setSearchFailed] = useState(false)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = (q: string) => {
    abortRef.current?.abort()
    if (q.trim().length < 2) {
      setResults([])
      setSearchFailed(false)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    fetch(`/api/guilds/${guildId}/member-search?query=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("search failed"))))
      .then((data: MemberOption[]) => {
        setResults(data)
        setSearchFailed(false)
        setHighlighted(0)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setResults([])
        setSearchFailed(true)
      })
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query), 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  function pick(member: MemberOption) {
    setSelected(member)
    setQuery(member.displayName)
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlighted((h) => Math.min(h + 1, results.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      pick(results[highlighted])
    } else if (event.key === "Escape") {
      setOpen(false)
    }
  }

  if (manualMode) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          name={name}
          value={manualValue}
          onChange={(e) => setManualValue(e.target.value)}
          placeholder="Discord user ID"
          className="w-40 rounded-md border border-border bg-panel px-2 py-1.5 font-data text-[12px] text-text outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setManualMode(false)}
          className="text-[11px] text-muted hover:text-accent"
        >
          Search instead
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative flex flex-wrap items-center gap-1.5">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <div className="relative">
        <SearchIcon />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setSelected(null)
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Start typing a username..."}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listboxId}
          className="w-48 rounded-md border border-border bg-panel py-1.5 pl-7 pr-2 text-[12.5px] text-text outline-none focus:border-accent"
        />
        {open && query.trim().length < 2 && (
          <div className="absolute z-10 mt-1 w-64 rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[12px] text-muted shadow-md">
            Type at least 2 characters to search members.
          </div>
        )}
        {open && query.trim().length >= 2 && results.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-10 mt-1 w-64 rounded-lg border border-border bg-panel shadow-md"
          >
            {results.map((member, index) => (
              <li
                key={member.id}
                role="option"
                aria-selected={index === highlighted}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(member)
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12.5px] ${
                  index === highlighted ? "bg-accent-soft text-accent" : "text-text"
                }`}
              >
                {member.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatarUrl} alt="" className="h-5 w-5 flex-none rounded-full" />
                ) : (
                  <span className="h-5 w-5 flex-none rounded-full bg-panel-2" />
                )}
                <span className="truncate">{member.displayName}</span>
                <span className="truncate font-data text-[10px] text-muted">@{member.username}</span>
              </li>
            ))}
          </ul>
        )}
        {open && query.trim().length >= 2 && results.length === 0 && (
          <div className="absolute z-10 mt-1 w-64 rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[12px] text-muted shadow-md">
            {searchFailed ? "Search unavailable. Try again." : "No members found."}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => runSearch(query)}
        title="Retry search"
        className="rounded-md border border-border bg-panel-2 px-1.5 py-1 text-[11px] text-muted hover:border-accent hover:text-text"
      >
        ↻
      </button>
      <button type="button" onClick={() => setManualMode(true)} className="text-[11px] text-muted hover:text-accent">
        Enter ID
      </button>
    </div>
  )
}
