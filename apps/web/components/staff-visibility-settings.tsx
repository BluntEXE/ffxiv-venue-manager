"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageLoading } from "@/components/ui/loading-spinner"

interface StaffVisibilitySettingsProps {
  venueId: string
}

interface VisibilityFields {
  taskVisibility: "all" | "assigned" | "assigned_unassigned"
  salesVisibility: "all" | "own" | "none"
  eventVisibility: "all" | "published"
}

const ROWS: {
  key: keyof VisibilityFields
  label: string
  desc: string
  options: { value: string; label: string }[]
}[] = [
  {
    key: "taskVisibility",
    label: "Tasks",
    desc: "Which tasks staff can see",
    options: [
      { value: "all", label: "All tasks" },
      { value: "assigned", label: "Assigned only" },
      { value: "assigned_unassigned", label: "Assigned + unassigned" },
    ],
  },
  {
    key: "salesVisibility",
    label: "Sales",
    desc: "Which transactions staff can see",
    options: [
      { value: "all", label: "All transactions" },
      { value: "own", label: "Their own only" },
      { value: "none", label: "No access" },
    ],
  },
  {
    key: "eventVisibility",
    label: "Events",
    desc: "Which events staff can see",
    options: [
      { value: "all", label: "All (including drafts)" },
      { value: "published", label: "Published only" },
    ],
  },
]

export function StaffVisibilitySettings({ venueId }: StaffVisibilitySettingsProps) {
  const [values, setValues] = useState<VisibilityFields | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/venues/${venueId}/settings`)
      .then((res) => res.json())
      .then((data) =>
        setValues({
          taskVisibility: data.taskVisibility ?? "all",
          salesVisibility: data.salesVisibility ?? "all",
          eventVisibility: data.eventVisibility ?? "all",
        })
      )
      .catch(() => setError("Failed to load visibility settings"))
  }, [venueId])

  const handleSave = async () => {
    if (!values) return
    setIsSaving(true)
    setError("")
    setSaved(false)
    try {
      const res = await fetch(`/api/venues/${venueId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save")
      }
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  if (!values) {
    return (
      <div className="panel">
        <PageLoading text="Loading staff visibility..." />
      </div>
    )
  }

  return (
    <section className="panel">
      <div className="ph">
        <span className="pt">Staff visibility</span>
      </div>
      <p className="px-5 pt-3 text-xs text-[var(--fg-faint)]">
        Controls what STAFF-tier members can see. Revenue visibility is owner-only — manage it from Venue Settings.
      </p>
      <div className="mt-1">
        {ROWS.map((row) => (
          <div key={row.key} className="setrow">
            <div className="sinfo">
              <div className="stitle">{row.label}</div>
              <div className="sdesc">{row.desc}</div>
            </div>
            <Select
              value={values[row.key]}
              onValueChange={(v) => {
                setValues({ ...values, [row.key]: v })
                setSaved(false)
              }}
              disabled={isSaving}
            >
              <SelectTrigger className="w-[180px] h-8 text-xs bg-background border-[var(--blue-015)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {row.options.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 px-5 py-4">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-xs text-[var(--success-text)]">Saved</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </section>
  )
}
