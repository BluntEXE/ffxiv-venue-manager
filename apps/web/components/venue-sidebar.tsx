"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { VenueSwitcher } from "./venue-switcher"
import { FeedbackDialog } from "./feedback-dialog"
import { useSidebar } from "./sidebar-context"
import { cn } from "@/lib/utils"
import {
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

interface VenueSidebarProps {
  venueSlug: string
  venueName: string
  userRole: string
  userName?: string
  userEmail?: string
  venues?: Array<{ id: string; name: string; slug: string; dataCenter?: string; world?: string }>
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
  const { open, setOpen } = useSidebar()

  const navGroups: NavGroup[] = [
    {
      label: "Explore",
      items: [
        { href: `/discover?from=${venueSlug}`, label: "Discover", icon: Compass },
        { href: `/following?from=${venueSlug}`, label: "Following", icon: BookHeart },
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

  const close = () => setOpen(false)

  const NavContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Venue switcher */}
      {venues.length > 0 && (
        <div className="px-3 pt-4 pb-3 border-b border-[var(--blue-008)]">
          <VenueSwitcher venues={venues} activeSlug={venueSlug} />
        </div>
      )}

      <div className="flex-1 py-3 overflow-y-auto sidebar-scroll">
        <nav className="px-[14px] space-y-5">
          {navGroups.map((group) => {
            const filtered = filterItems(group.items)
            if (!filtered.length) return null
            return (
              <div key={group.label}>
                <p className="grp-label px-3 mb-[8px]">{group.label}</p>
                <div className="space-y-0.5">
                  {filtered.map((item) => {
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 px-3 py-[9px] rounded-lg text-[0.875rem] font-medium transition-colors border-l-2",
                          active
                            ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)] font-semibold border-[var(--xiv-blue)] shadow-[var(--glow-cta-soft)]"
                            : "text-foreground hover:bg-[var(--blue-007)] border-transparent"
                        )}
                      >
                        <item.icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active ? "text-[var(--xiv-navy)]" : "text-muted-foreground")} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge !== undefined && item.badge !== null && (
                          <span className={cn(
                            "text-[0.7rem] font-semibold px-2 py-px rounded-full min-w-[1.25rem] text-center",
                            active
                              ? "bg-[rgba(7,11,20,0.25)] text-[var(--xiv-navy)]"
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
      </div>

      {/* Settings */}
      <div className="border-t border-[var(--blue-008)] p-[8px] space-y-0.5">
        <Link
          href={`/dashboard/${venueSlug}/settings`}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 px-3 py-[9px] rounded-lg text-[0.875rem] font-medium transition-colors border-l-2",
            isActive(`/dashboard/${venueSlug}/settings`)
              ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)] font-semibold border-[var(--xiv-blue)]"
              : "text-foreground hover:bg-[var(--blue-007)] border-transparent"
          )}
        >
          <Settings className={cn("h-[18px] w-[18px] shrink-0", isActive(`/dashboard/${venueSlug}/settings`) ? "text-[var(--xiv-navy)]" : "text-muted-foreground")} />
          <span>Settings</span>
        </Link>
      </div>

      {/* Footer */}
      <div className="px-4 pb-[14px] pt-[12px] border-t border-[var(--blue-008)]">
        <p className="text-[0.62rem] leading-[1.5] text-[var(--fg-faint)]">
          XIV Venue Manager is not affiliated with SQUARE ENIX CO., LTD.
        </p>
      </div>
    </div>
  )

  const MobileBottom = ({ onNavigate }: { onNavigate: () => void }) => (
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
      {/* Scrim overlay — mobile only when open */}
      {open && (
        <div
          className="[@media(min-width:1081px)]:hidden fixed inset-0 bg-[rgba(7,11,20,0.6)] backdrop-blur-[2px] z-[39]"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed z-40 flex flex-col overflow-hidden",
          "top-[80px] left-5 bottom-5 w-[260px]",
          "rounded-xl border border-[rgba(255,255,255,0.06)]",
          "xiv-sidebar-glass",
          // Desktop: always visible; mobile: slides in/out
          "[@media(min-width:1081px)]:translate-x-0",
          open
            ? "translate-x-0 transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            : "[@media(max-width:1080px)]:-translate-x-[calc(100%+24px)] transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        )}
      >
        <NavContent onNavigate={close} />
        <div className="[@media(min-width:1081px)]:hidden">
          <MobileBottom onNavigate={close} />
        </div>
      </aside>
    </>
  )
}
