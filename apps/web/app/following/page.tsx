import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CrystalDivider } from "@/components/ui/crystal-divider"
import { MapPin, ArrowRight, Heart, Radio } from "lucide-react"

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
            select: { title: true, status: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const open = follows.filter(f => f.venue.events.length > 0)
  const closed = follows.filter(f => f.venue.events.length === 0)

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">

        <div className="mb-8 text-center">
          <CrystalDivider className="mb-4" />
          <h1 className="font-cinzel text-3xl md:text-4xl font-bold tracking-[0.02em] mb-2">Following</h1>
          <p className="text-muted-foreground">Venues you follow</p>
        </div>

        {follows.length === 0 ? (
          <div className="text-center py-20">
            <Heart className="h-12 w-12 text-muted-foreground opacity-30 mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">You haven't followed any venues yet.</p>
            <Button asChild variant="cta">
              <Link href="/discover">Discover Venues</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {open.length > 0 && (
              <div>
                <p className="stat-label text-[var(--success-text)] mb-3 flex items-center gap-2">
                  <span className="xiv-live-dot scale-75" /> Open now ({open.length})
                </p>
                <VenueList follows={open} />
              </div>
            )}
            {closed.length > 0 && (
              <div>
                <p className="stat-label mb-3">Closed ({closed.length})</p>
                <VenueList follows={closed} dimmed />
              </div>
            )}
          </div>
        )}
    </div>
  )
}

function VenueList({ follows, dimmed }: { follows: any[]; dimmed?: boolean }) {
  return (
    <div className="space-y-2">
      {follows.map(({ venue }) => (
        <div key={venue.id} className={`flex items-center gap-4 px-4 py-3 rounded-xl border border-[var(--blue-008)] hover:border-[var(--blue-018)] hover:bg-[var(--blue-004)] transition-all ${dimmed ? "opacity-70" : ""}`}>
          <div className="h-10 w-10 rounded-lg bg-[var(--blue-010)] flex items-center justify-center text-sm font-cinzel font-bold text-[var(--xiv-blue)] shrink-0">
            {venue.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{venue.name}</p>
            <p className="text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 inline mr-0.5" />
              {venue.dataCenter} · {venue.world}
              {venue.location && ` · ${venue.location}`}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {venue.events.length > 0
              ? <Badge variant="status-open" className="text-[10px]">Open</Badge>
              : <Badge variant="status-closed" className="text-[10px]">Closed</Badge>
            }
            <Button asChild variant="outline-blue" size="sm" className={!venue.events.length ? "opacity-50 pointer-events-none" : ""}>
              <Link href={`/venues/${venue.slug}`}>Visit <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
