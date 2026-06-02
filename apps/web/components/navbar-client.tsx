"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { UserMenu } from "./user-menu"
import { FeedbackDialog } from "./feedback-dialog"
import { useSidebar } from "./sidebar-context"
import { Menu, Heart, Bell, CheckCheck } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Session } from "next-auth"

interface NavbarClientProps {
  session: Session | null
  venues: Array<{ id: string; name: string; slug: string; role: string }>
}

const PLUGIN_STALE_MS = 5 * 60 * 1000 // 5 minutes

export function NavbarClient({ session, venues }: NavbarClientProps) {
  const { toggle } = useSidebar()
  const pathname = usePathname()
  const [pluginSynced, setPluginSynced] = useState(false)

  // True for any page that has a sidebar: venue dashboard pages, discover, following
  // Excludes /dashboard/account/* (personal pages with no sidebar)
  const isVenuePage = !!(
    pathname?.match(/^\/dashboard\/(?!account)[^/]+(?:\/|$)/) ||
    pathname === "/discover" ||
    pathname === "/following"
  )

  // Current venue context for user chip subtitle
  const currentSlug = pathname?.match(/^\/dashboard\/([^/]+)/)?.[1]
  const currentVenue = currentSlug ? venues.find((v) => v.slug === currentSlug) : undefined

  // Poll plugin sync status every 30s when on a venue page
  useEffect(() => {
    if (!isVenuePage || !currentVenue?.id) { setPluginSynced(false); return }
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`/api/venues/${currentVenue.id}/plugin-status`)
        if (!res.ok || cancelled) return
        const { lastUsedAt } = await res.json()
        if (!cancelled) setPluginSynced(!!lastUsedAt && Date.now() - new Date(lastUsedAt).getTime() < PLUGIN_STALE_MS)
      } catch { /* network error — keep last state */ }
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [isVenuePage, currentVenue?.id])

  return (
    <nav className="sticky top-0 z-50 w-full xiv-nav xiv-glass relative">
      <div className="h-[60px] flex items-center gap-5 px-6">

        {/* Hamburger — left of brand, only visible below 1081px on venue pages */}
        {isVenuePage && (
          <button
            onClick={toggle}
            className="[@media(min-width:1081px)]:hidden p-[6px] rounded-[calc(0.75rem-4px)] text-foreground hover:bg-[var(--blue-007)] transition-colors flex-shrink-0"
            aria-label="Toggle navigation"
          >
            <Menu className="w-[22px] h-[22px]" />
          </button>
        )}

        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
          <Image
            src="/xiv-icon.png"
            alt="XIV Venue Manager"
            width={32}
            height={32}
            className="object-contain transition-opacity group-hover:opacity-90"
            priority
          />
          <span className="hidden sm:flex items-baseline gap-1.5 font-cinzel tracking-wide">
            <span className="font-bold text-base text-xiv">XIV</span>
            <span className="font-medium text-sm text-foreground/80">Venue Manager</span>
          </span>
        </Link>

        <div className="flex-1" />

        {/* Right */}
        <div className="flex items-center gap-[14px]">
          {session ? (
            <>
              {/* Sync pill — hidden on mobile, only shown when plugin recently synced */}
              {isVenuePage && pluginSynced && (
                <div className="hidden [@media(min-width:1081px)]:inline-flex items-center gap-2 px-[11px] py-[5px] rounded-full text-[0.74rem] font-medium font-mono border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.08)] text-[var(--success-text)]">
                  <span className="xiv-live-dot scale-75" />
                  Plugin synced
                </div>
              )}

              {/* Bell */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="relative p-[7px] rounded-[var(--radius-md)] text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] transition-colors" aria-label="Notifications">
                    <Bell className="h-[19px] w-[19px]" />
                    <span className="absolute top-[5px] right-[5px] w-[7px] h-[7px] rounded-full bg-[var(--xiv-blue)] border-2 border-background" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-0 border-[var(--blue-018)] bg-[rgba(7,11,20,0.96)] backdrop-blur-2xl">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--blue-008)]">
                    <span className="font-semibold text-sm">Notifications</span>
                    <CheckCheck className="h-3.5 w-3.5 text-[var(--fg-faint)]" />
                  </div>
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <Bell className="h-8 w-8 text-[var(--fg-faint)] mb-3 opacity-30" />
                    <p className="text-sm text-muted-foreground">No new notifications</p>
                    <p className="text-xs text-[var(--fg-faint)] mt-1">Activity from events, sales and staff will appear here</p>
                  </div>
                </PopoverContent>
              </Popover>

              <FeedbackDialog />

              <Button asChild variant="ghost" size="sm" className="text-[var(--support-pink)] hover:text-pink-300 hover:bg-[rgba(243,139,168,0.08)]">
                <Link href="https://ko-fi.com/ehnocure" target="_blank" rel="noopener noreferrer">
                  <Heart className="h-4 w-4 mr-1" />
                  Support
                </Link>
              </Button>

              <UserMenu
                user={session.user}
                currentVenueName={currentVenue?.name}
                currentVenueRole={currentVenue?.role}
              />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="text-pink-400 hover:text-pink-300 hover:bg-pink-500/10">
                <Link href="https://ko-fi.com/ehnocure" target="_blank" rel="noopener noreferrer">
                  <Heart className="h-4 w-4 mr-1" />
                  Support
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-sm text-foreground/60 hover:text-foreground hover:bg-[rgba(0,180,255,0.06)]">
                <Link href="/auth/signin">Sign In</Link>
              </Button>
              <Button asChild size="sm" className="font-cinzel font-semibold tracking-wide ml-1 text-xs xiv-btn-shimmer xiv-cta">
                <Link href="/auth/signin">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
