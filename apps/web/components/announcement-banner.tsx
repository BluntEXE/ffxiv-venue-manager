"use client"

import { useState } from "react"
import { X, Megaphone, ExternalLink } from "lucide-react"

type Announcement = {
  id: string
  title: string
  message: string
  link: string | null
  linkLabel: string | null
}

export function AnnouncementBanner({ announcements }: { announcements: Announcement[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = announcements.filter(a => !dismissed.has(a.id))
  if (visible.length === 0) return null

  async function dismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]))
    await fetch(`/api/announcements/${id}/dismiss`, { method: "POST" })
  }

  return (
    <div className="space-y-2 mb-6">
      {visible.map(a => (
        <div
          key={a.id}
          className="relative flex items-start gap-3 rounded-xl border border-[rgba(0,180,255,0.28)] bg-[rgba(0,180,255,0.07)] px-4 py-3.5 pr-10"
        >
          <Megaphone className="h-4 w-4 text-[var(--xiv-blue)] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--xiv-blue)]">{a.title}</p>
            <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{a.message}</p>
            {a.link && (
              <a
                href={a.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--xiv-blue)] hover:underline mt-1.5"
              >
                {a.linkLabel ?? "Learn more"}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <button
            onClick={() => dismiss(a.id)}
            className="absolute top-3 right-3 text-[var(--fg-faint)] hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
