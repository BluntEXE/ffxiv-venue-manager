"use client"

import { useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"

/**
 * Shown only when the logged-in user has no linked FFXIV character at all
 * (computed server-side by the page, not tracked as a dismissal here) - the
 * point is to keep nagging until they actually link one, not to nag once
 * and never again. Dismissing just hides it for the current page view;
 * it reappears next visit if still applicable. Deliberately a separate
 * component from AnnouncementBanner, not merged into it, so it can never
 * be confused with or crowd out a real announcement.
 */
export function CharacterLinkNudge() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div
      className="relative rounded-xl overflow-hidden mb-3"
      style={{
        background: "linear-gradient(135deg, rgba(249,226,175,0.08) 0%, rgba(249,226,175,0.03) 100%)",
        border: "1px solid rgba(249,226,175,0.25)",
      }}
    >
      <div className="px-5 py-3.5 pr-10 flex items-center gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground flex-1 min-w-0">
          Link your FFXIV character so sales, shifts, and staff lists show your character name instead of your Discord
          name.
        </p>
        <Link
          href="/dashboard/account/characters"
          className="text-sm font-semibold text-[var(--xiv-blue)] hover:underline flex-shrink-0"
        >
          Link a character
        </Link>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
