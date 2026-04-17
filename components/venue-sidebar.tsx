"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { VenueSwitcher } from "./venue-switcher"
import { FeedbackDialog } from "./feedback-dialog"
import { cn } from "@/lib/utils"
import { Menu, Heart } from "lucide-react"
import { useState } from "react"

interface VenueSidebarProps {
  venueSlug: string
  venueName: string
  userRole: string
  userName?: string
  userEmail?: string
  venues?: Array<{ id: string; name: string; slug: string }>
}

interface NavItem {
  href: string
  label: string
  icon: string
  roles?: string[]
}

export function VenueSidebar({
  venueSlug,
  venueName,
  userRole,
  userName,
  userEmail,
  venues = []
}: VenueSidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems: NavItem[] = [
    {
      href: `/dashboard/${venueSlug}`,
      label: "Overview",
      icon: "🏠",
    },
    {
      href: `/dashboard/${venueSlug}/analytics`,
      label: "Analytics",
      icon: "📊",
      roles: ["OWNER", "MANAGER"],
    },
    {
      href: `/dashboard/${venueSlug}/events`,
      label: "Events",
      icon: "📅",
    },
    {
      href: `/dashboard/${venueSlug}/live`,
      label: "Live",
      icon: "🔴",
    },
    {
      href: `/dashboard/${venueSlug}/event-templates`,
      label: "Event Templates",
      icon: "📋",
      roles: ["OWNER", "MANAGER"],
    },
    {
      href: `/dashboard/${venueSlug}/staff`,
      label: "Staff",
      icon: "👥",
    },
    {
      href: `/dashboard/${venueSlug}/shifts`,
      label: "Shifts",
      icon: "🕐",
    },
    {
      href: `/dashboard/${venueSlug}/tasks`,
      label: "Tasks",
      icon: "✅",
    },
    {
      href: `/dashboard/${venueSlug}/services`,
      label: "Services",
      icon: "🛍️",
    },
    {
      href: `/dashboard/${venueSlug}/sales`,
      label: "Sales",
      icon: "💰",
    },
    {
      href: `/dashboard/${venueSlug}/timeline`,
      label: "Timeline",
      icon: "📜",
    },
    {
      href: `/dashboard/${venueSlug}/payroll`,
      label: "Payroll",
      icon: "💵",
      roles: ["OWNER", "MANAGER"],
    },
    {
      href: `/dashboard/${venueSlug}/settings`,
      label: "Settings",
      icon: "⚙️",
    },
  ]

  // Filter nav items based on role
  const filteredNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  )

  const DesktopNavContent = () => (
    <>
      <div className="px-3 py-4 border-b">
        <h2 className="font-bold text-lg mb-1 truncate">{venueName}</h2>
        <p className="text-xs text-muted-foreground">Role: {userRole}</p>
      </div>
      <ScrollArea className="flex-1 py-4">
        <div className="space-y-1 px-2">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </ScrollArea>
      <div className="p-3 border-t">
        <Button asChild variant="outline" className="w-full" size="sm">
          <Link href="/dashboard">← All Venues</Link>
        </Button>
      </div>
    </>
  )

  const MobileNavContent = () => (
    <>
      {/* User Info Section */}
      {userName && (
        <div className="px-3 py-4 border-b">
          <p className="font-medium">{userName}</p>
          {userEmail && (
            <p className="text-xs text-muted-foreground mt-1">{userEmail}</p>
          )}
        </div>
      )}

      {/* Venue Info and Role */}
      <div className="px-3 py-3 border-b">
        <h2 className="font-bold text-lg mb-1 truncate">{venueName}</h2>
        <p className="text-xs text-muted-foreground">Role: {userRole}</p>
      </div>

      {/* Venue Switcher */}
      {venues.length > 0 && (
        <div className="px-3 py-3 border-b">
          <p className="text-xs font-medium mb-2 text-muted-foreground uppercase">
            Switch Venue
          </p>
          <VenueSwitcher venues={venues} />
        </div>
      )}

      {/* Venue Navigation */}
      <ScrollArea className="flex-1 py-4">
        <div className="space-y-1 px-2">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </ScrollArea>

      {/* Bottom Actions */}
      <div className="p-3 border-t space-y-2">
        <Button asChild variant="outline" className="w-full" size="sm">
          <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
            ← All Venues
          </Link>
        </Button>
        <div onClick={() => setMobileOpen(false)}>
          <FeedbackDialog />
        </div>
        <Button asChild variant="ghost" className="w-full text-pink-600 hover:text-pink-700 hover:bg-pink-50" size="sm">
          <Link href="https://ko-fi.com/ehnocure" target="_blank" rel="noopener noreferrer">
            <Heart className="h-4 w-4 mr-2" />
            Support the Project
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full" size="sm">
          <Link href="/api/auth/signout">Sign Out</Link>
        </Button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button size="lg" className="rounded-full min-h-14 min-w-14 h-14 w-14 shadow-lg" aria-label="Open navigation menu">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
            <MobileNavContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[260px] glass border border-white/5 fixed left-4 top-24 bottom-4 rounded-xl transition-all duration-300">
        <DesktopNavContent />
      </aside>
    </>
  )
}
