"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { VenueSwitcher } from "./venue-switcher"
import { UserMenu } from "./user-menu"
import { FeedbackDialog } from "./feedback-dialog"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu, Heart } from "lucide-react"
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
    <nav className="sticky top-4 z-50 mx-4 mb-4 rounded-2xl glass border border-white/5 transition-all duration-300 supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity">
          <Image
            src="/logo.png"
            alt="XIV Venue Manager"
            width={32}
            height={32}
            className="md:w-10 md:h-10 object-contain"
            priority
          />
          <span className="font-bold text-base md:text-xl hidden sm:inline font-heading tracking-tight">
            XIV Venue Manager
          </span>
        </Link>

        {/* Center - Venue Switcher (Desktop) */}
        <div className="hidden lg:flex flex-1 justify-center">
          {session && venues.length > 0 && (
            <VenueSwitcher venues={venues} />
          )}
        </div>

        {/* Right - Desktop Navigation */}
        <div className="hidden md:flex items-center gap-2 lg:gap-4">
          {session ? (
            <>
              <Button asChild variant="ghost" size="sm" className="font-medium hover:bg-white/5">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <FeedbackDialog />
              <Button asChild variant="ghost" size="sm" className="text-pink-400 hover:text-pink-300 hover:bg-pink-500/10">
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
              <Button asChild variant="ghost" size="sm" className="hover:bg-white/5">
                <Link href="/auth/signin">Sign In</Link>
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
              <SheetContent side="right" className="w-[280px] p-0 glass border-l-white/10">
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
