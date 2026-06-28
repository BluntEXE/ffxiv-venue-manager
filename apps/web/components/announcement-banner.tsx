"use client"

import { useState } from "react"
import { X, ExternalLink } from "lucide-react"

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
    <div className="space-y-3 mb-6">
      {visible.map(a => (
        <div
          key={a.id}
          className="relative rounded-xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(0,180,255,0.10) 0%, rgba(0,180,255,0.04) 100%)",
            border: "1px solid rgba(0,180,255,0.35)",
            boxShadow: "0 0 24px rgba(0,180,255,0.08), inset 0 1px 0 rgba(0,180,255,0.15)",
          }}
        >
          {/* Top accent line */}
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: "linear-gradient(90deg, transparent, rgba(0,180,255,0.8) 40%, rgba(0,180,255,0.8) 60%, transparent)" }}
          />

          <div className="px-5 py-4 pr-10">
            {/* Title row */}
            <div className="flex items-center gap-2.5 mb-2">
              <span
                className="w-2 h-2 shrink-0 rotate-45"
                style={{ background: "var(--xiv-blue)", boxShadow: "0 0 8px rgba(0,180,255,0.7)" }}
              />
              <p className="font-cinzel text-sm font-semibold tracking-wide text-[var(--xiv-blue)]">
                {a.title}
              </p>
            </div>

            {/* Message — respects newlines */}
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2 pl-[18px]">
              {a.message.split("\n\n").map((para, i) => (
                <p key={i} style={{ whiteSpace: "pre-wrap" }}>{para}</p>
              ))}
            </div>

            {a.link && (
              <a
                href={a.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--xiv-blue)] hover:underline mt-3 pl-[18px]"
              >
                {a.linkLabel ?? "Learn more"}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <button
            onClick={() => dismiss(a.id)}
            className="absolute top-3.5 right-3.5 text-[var(--fg-faint)] hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
