"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { VenueSwitcher } from "./venue-switcher"
import { FeedbackDialog } from "./feedback-dialog"
import { cn } from "@/lib/utils"
import {
  Menu,
  Heart,
  Home,
  BarChart3,
  Calendar,
  Radio,
  Users,
  Clock,
  CheckSquare,
  ShoppingBag,
  Coins,
  Scroll,
  History,
  Wallet,
  Settings,
  Compass,
  BookHeart,
  type LucideIcon,
} from "lucide-react"
import { useState } from "react"

interface VenueSidebarProps {
  venueSlug: string
  venueName: string
  userRole: string
  userName?: string
  userEmail?: string
  venues?: Array<{ id: string; name: string; slug: string }>
  livePatronCount?: number
}

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles?: string[]
  badge?: number | string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

export function VenueSidebar({
  venueSlug,
  venueName,
  userRole,
  userName,
  userEmail,
  venues = [],
  livePatronCount,
}: VenueSidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navGroups: NavGroup[] = [
    {
      label: "Explore",
      items: [
        { href: "/discover", label: "Discover", icon: Compass },
        { href: "/following", label: "Following", icon: BookHeart },
      ],
    },
    {
      label: "Manage",
      items: [
        { href: `/dashboard/${venueSlug}`, label: "Overview", icon: Home },
        {
          href: `/dashboard/${venueSlug}/analytics`,
          label: "Analytics",
          icon: BarChart3,
          roles: ["OWNER", "MANAGER"],
        },
        {
          href: `/dashboard/${venueSlug}/live`,
          label: "Live Mode",
          icon: Radio,
          badge: livePatronCount,
        },
      ],
    },
    {
      label: "Operations",
      items: [
        { href: `/dashboard/${venueSlug}/events`, label: "Events", icon: Calendar },
        { href: `/dashboard/${venueSlug}/staff`, label: "Staff", icon: Users },
        { href: `/dashboard/${venueSlug}/shifts`, label: "Shifts", icon: Clock },
        { href: `/dashboard/${venueSlug}/tasks`, label: "Tasks", icon: CheckSquare },
        { href: `/dashboard/${venueSlug}/services`, label: "Services", icon: ShoppingBag },
      ],
    },
    {
      label: "Records",
      items: [
        { href: `/dashboard/${venueSlug}/sales`, label: "Sales", icon: Coins },
        {
          href: `/dashboard/${venueSlug}/payroll`,
          label: "Payroll",
          icon: Wallet,
          roles: ["OWNER", "MANAGER"],
        },
        { href: `/dashboard/${venueSlug}/timeline`, label: "Timeline", icon: Scroll },
        {
          href: `/dashboard/${venueSlug}/patron-logs`,
          label: "Patron Logs",
          icon: History,
          roles: ["OWNER", "MANAGER"],
        },
      ],
    },
  ]

  const isActive = (href: string) =>
    href === `/dashboard/${venueSlug}`
      ? pathname === href
      : pathname.startsWith(href)

  const filterItems = (items: NavItem[]) =>
    items.filter((item) => !item.roles || item.roles.includes(userRole))

  const NavContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Venue switcher */}
      {venues.length > 0 && (
        <div className="px-3 pt-4 pb-3 border-b border-[var(--blue-008)]">
          <VenueSwitcher venues={venues} />
        </div>
      )}

      <ScrollArea className="flex-1 py-3">
        <nav className="px-2 space-y-5">
          {navGroups.map((group) => {
            const filtered = filterItems(group.items)
            if (!filtered.length) return null
            return (
              <div key={group.label}>
                <p className="stat-label px-3 mb-1.5">{group.label}</p>
                <div className="space-y-0.5">
                  {filtered.map((item) => {
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative",
                          active
                            ? "bg-[var(--xiv-blue)] text-[#070b14] font-semibold border-l-2 border-[var(--xiv-blue)]"
                            : "text-foreground/70 hover:text-foreground hover:bg-[var(--blue-007)] border-l-2 border-transparent"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge !== undefined && item.badge !== null && (
                          <span className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center",
                            active
                              ? "bg-[rgba(7,11,20,0.25)] text-[#070b14]"
                              : "bg-[var(--blue-012)] text-[var(--xiv-blue)]"
                          )}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Settings + bottom */}
      <div className="border-t border-[var(--blue-008)] p-2 space-y-0.5">
        <Link
          href={`/dashboard/${venueSlug}/settings`}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors border-l-2",
            isActive(`/dashboard/${venueSlug}/settings`)
              ? "bg-[var(--xiv-blue)] text-[#070b14] font-semibold border-[var(--xiv-blue)]"
              : "text-foreground/70 hover:text-foreground hover:bg-[var(--blue-007)] border-transparent"
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </Link>
      </div>

      {/* Legal disclaimer */}
      <p className="px-4 pb-3 text-[10px] text-[var(--fg-faint)] leading-relaxed">
        XIV Venue Manager is not affiliated with SQUARE ENIX CO., LTD.
      </p>
    </div>
  )

  const MobileFooter = ({ onNavigate }: { onNavigate: () => void }) => (
    <div className="p-3 border-t border-[var(--blue-008)] space-y-2">
      {userName && (
        <div className="pb-2 border-b border-[var(--blue-008)]">
          <p className="text-sm font-medium">{userName}</p>
          {userEmail && <p className="text-xs text-muted-foreground">{userEmail}</p>}
        </div>
      )}
      <div onClick={onNavigate}><FeedbackDialog /></div>
      <Button asChild variant="ghost" size="sm" className="w-full justify-start text-[var(--support-pink)] hover:text-pink-300 hover:bg-[rgba(243,139,168,0.08)]">
        <Link href="https://ko-fi.com/ehnocure" target="_blank" rel="noopener noreferrer">
          <Heart className="h-4 w-4 mr-2" />
          Support the Project
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href="/api/auth/signout">Sign Out</Link>
      </Button>
    </div>
  )

  return (
    <>
      {/* Mobile FAB */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              size="lg"
              className="rounded-full h-14 w-14 shadow-[var(--glow-fab)] border border-[var(--blue-035)]"
              aria-label="Open navigation menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[280px] p-0 flex flex-col border-r border-[var(--blue-015)]"
            style={{ background: "rgba(7,11,20,0.97)" }}
          >
            <NavContent onNavigate={() => setMobileOpen(false)} />
            <MobileFooter onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop floating sidebar */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-[260px] fixed left-4 top-20 bottom-4 rounded-xl border border-[var(--blue-015)] overflow-hidden"
        style={{
          background: "rgba(7,11,20,0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <NavContent />
      </aside>
    </>
  )
}
