import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { CrystalDivider } from "@/components/ui/crystal-divider"
import { MapPin, ArrowRight, Heart } from "lucide-react"

export default async function FollowingPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const follows = await prisma.venueFollow.findMany({
    where: { userId: session.user.id },
    include: {
      venue: {
        include: {
          _count: { select: { follows: true } },
          events: {
            where: { status: "ACTIVE" },
            take: 1,
            select: { title: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const open   = follows.filter(f => f.venue.events.length > 0)
  const closed = follows.filter(f => f.venue.events.length === 0)

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8 text-center xiv-fade-up">
        <CrystalDivider className="mb-4" />
        <h1 className="font-cinzel text-3xl md:text-4xl font-bold tracking-[0.02em] mb-2">Following</h1>
        <p className="text-muted-foreground">Venues you follow across the realm</p>
      </div>

      {follows.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="h-12 w-12 text-muted-foreground opacity-30 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">You haven&apos;t followed any venues yet.</p>
          <Button asChild variant="cta">
            <Link href="/discover">Discover Venues</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {open.length > 0 && (
            <div>
              {/* Section divider */}
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--success-text)]">
                  <span className="xiv-live-dot scale-75" />
                  Open now
                </span>
                <div className="flex-1 h-px bg-[var(--blue-008)]" />
                <span className="text-xs text-[var(--fg-faint)]">{open.length} of {follows.length}</span>
              </div>
              <VenueList follows={open} slug="" />
            </div>
          )}

          {closed.length > 0 && (
            <div>
              {/* Section divider */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Closed
                </span>
                <div className="flex-1 h-px bg-[var(--blue-008)]" />
                <span className="text-xs text-[var(--fg-faint)]">{closed.length}</span>
              </div>
              <VenueList follows={closed} slug="" dimmed />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function VenueList({ follows, dimmed }: { follows: { venue: { id: string; name: string; slug: string; dataCenter: string; world: string; location: string | null; events: { title: string }[] } }[]; slug: string; dimmed?: boolean }) {
  return (
    <div className="space-y-2">
      {follows.map(({ venue }) => {
        const isOpen = venue.events.length > 0
        return (
          <div
            key={venue.id}
            className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all ${
              dimmed
                ? "border-[var(--blue-008)] opacity-60 hover:opacity-100"
                : "border-[var(--blue-015)] hover:border-[var(--blue-035)] hover:bg-[var(--blue-004)]"
            }`}
          >
            {/* Icon badge */}
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-base font-cinzel font-bold flex-shrink-0 ${
              isOpen
                ? "bg-[var(--blue-010)] border border-[var(--blue-018)] text-[var(--xiv-blue)]"
                : "bg-[rgba(108,112,134,0.08)] border border-[var(--border)] text-[var(--fg-faint)]"
            }`}>
              {venue.name.charAt(0)}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-semibold text-sm ${dimmed ? "text-[var(--fg-subtle)]" : ""}`}>
                  {venue.name}
                </span>
                {isOpen && venue.events[0] && (
                  <span className="text-[0.68rem] px-2 py-0.5 rounded-full bg-[var(--blue-010)] text-[var(--xiv-blue)] border border-[var(--blue-018)] hidden sm:inline">
                    {venue.events[0].title}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {venue.dataCenter} · {venue.world}
                {venue.location && ` · ${venue.location}`}
              </p>
            </div>

            {/* Status + action */}
            <div className="flex items-center gap-2 shrink-0">
              {isOpen ? (
                <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Open
                </span>
              ) : (
                <span className="text-[0.7rem] font-semibold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full bg-[rgba(108,112,134,0.10)] text-[var(--fg-faint)] border border-[var(--border)]">
                  Closed
                </span>
              )}
              <Button
                asChild
                variant="outline-blue"
                size="sm"
                className={!isOpen ? "opacity-40 pointer-events-none" : ""}
              >
                <Link href={`/venues/${venue.slug}`}>
                  Visit <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
