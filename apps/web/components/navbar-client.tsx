"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { VenueSwitcher } from "./venue-switcher"
import { UserMenu } from "./user-menu"
import { FeedbackDialog } from "./feedback-dialog"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu, Heart, Bell, Plug, CheckCheck } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useState } from "react"
import type { Session } from "next-auth"

interface NavbarClientProps {
  session: Session | null
  venues: Array<{ id: string; name: string; slug: string }>
}

export function NavbarClient({ session, venues }: NavbarClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  // Check if we're on a venue page (has venue sidebar)
  const isVenuePage = pathname?.match(/^\/dashboard\/[^/]+(?:\/|$)/) && pathname !== "/dashboard"

  return (
    <nav className="sticky top-0 z-50 w-full xiv-nav xiv-glass relative">
      <div className="container mx-auto px-6 h-[60px] flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 md:gap-3 group">
          <Image
            src="/xiv-icon.png"
            alt="XIV Venue Manager"
            width={32}
            height={32}
            className="md:w-9 md:h-9 object-contain transition-opacity group-hover:opacity-90"
            priority
          />
          <span className="hidden sm:flex items-baseline gap-1.5 font-cinzel tracking-wide">
            <span className="font-bold text-base md:text-lg text-xiv">XIV</span>
            <span className="font-medium text-sm md:text-base text-foreground/80">Venue Manager</span>
          </span>
        </Link>

        {/* Center - public nav links only (venue switcher lives in sidebar) */}
        <div className="hidden lg:flex flex-1 justify-center">
          {!session && (
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm" className="text-sm text-foreground/60 hover:text-foreground hover:bg-[rgba(0,180,255,0.06)] transition-colors tracking-wide">
                <Link href="/#features">Features</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-sm text-foreground/60 hover:text-foreground hover:bg-[rgba(0,180,255,0.06)] transition-colors tracking-wide">
                <Link href="/#guides">Guides</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Right - auth actions */}
        <div className="hidden md:flex items-center gap-1">
          {session ? (
            <>
              {/* TODO: wire to api_keys.lastUsedAt — show green only if plugin posted within ~5min */}
              {isVenuePage && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.08)] text-[var(--success-text)] mr-1">
                  <span className="xiv-live-dot scale-75" />
                  Plugin synced
                </div>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-foreground/60 hover:text-foreground hover:bg-[var(--blue-007)] relative" aria-label="Notifications">
                    <Bell className="h-4 w-4" />
                  </Button>
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
              <UserMenu user={session.user} />
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

        {/* Mobile Menu Button - Hidden on venue pages (venue sidebar handles mobile menu) */}
        {!isVenuePage && (
          <div className="md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="min-h-11 min-w-11 hover:bg-white/5" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] p-0 border-l border-[rgba(0,180,255,0.18)] bg-[rgba(7,11,20,0.98)]">
                <div className="flex flex-col h-full">
                  <div className="p-6 border-b border-white/10">
                    <h2 className="font-bold text-lg font-heading">Menu</h2>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4">
                    {session ? (
                      <div className="space-y-4">
                        {/* User Info */}
                        <div className="pb-4 border-b border-white/10">
                          <p className="font-medium font-heading">{session.user?.name || "User"}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {session.user?.email}
                          </p>
                        </div>

                        {/* Venue Switcher */}
                        {venues.length > 0 && (
                          <div className="pb-4 border-b border-white/10">
                            <p className="text-sm font-medium mb-2 text-muted-foreground">
                              YOUR VENUES
                            </p>
                            <VenueSwitcher venues={venues} />
                          </div>
                        )}

                        {/* Navigation Links */}
                        <div className="space-y-2">
                          <Button
                            asChild
                            variant="ghost"
                            className="w-full justify-start hover:bg-white/5"
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <Link href="/dashboard">Dashboard</Link>
                          </Button>
                          <div className="pt-2" onClick={() => setMobileMenuOpen(false)}>
                            <FeedbackDialog />
                          </div>
                          <Button
                            asChild
                            variant="ghost"
                            className="w-full justify-start text-pink-400 hover:text-pink-300 hover:bg-pink-500/10"
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <Link href="https://ko-fi.com/ehnocure" target="_blank" rel="noopener noreferrer">
                              <Heart className="h-4 w-4 mr-2" />
                              Support the Project
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        asChild
                        className="w-full"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Link href="/auth/signin">Sign In</Link>
                      </Button>
                    )}
                  </div>

                  {session && (
                    <div className="p-4 border-t border-white/10">
                      <Button
                        variant="outline"
                        className="w-full hover:bg-white/5 border-white/10"
                        onClick={() => {
                          setMobileMenuOpen(false)
                          // Sign out handled by UserMenu
                        }}
                        asChild
                      >
                        <Link href="/api/auth/signout">Sign Out</Link>
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    </nav>
  )
}
