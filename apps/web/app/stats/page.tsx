import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Building2,
  Activity,
  Plug,
  CalendarDays,
  Users,
  ShoppingBag,
  Clock,
  CheckCircle2,
  Link2,
  Coins,
  Globe2,
  Sparkles,
  ArrowRight,
} from "lucide-react"
import { getPublicStats, type PublicStats } from "@/lib/public-stats"

// Server-render stats; ISR refresh every 60s. The /api/stats endpoint
// caches for 5 minutes via Redis, so even cold renders are cheap.
export const revalidate = 60

export const metadata: Metadata = {
  title: "Usage stats — XIV Venue Manager",
  description:
    "Live aggregate usage stats for XIV Venue Manager: venues onboarded, events tracked, sales logged, and more across the FFXIV venue community.",
}

async function loadStats(): Promise<PublicStats | null> {
  try {
    return await getPublicStats()
  } catch (error) {
    console.error("Stats page load failed:", error)
    return null
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return fmt(n)
}

function relTime(iso: string | null): string {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function StatCard({
  icon: Icon,
  value,
  label,
  hint,
  tone = "blue",
}: {
  icon: typeof Building2
  value: string
  label: string
  hint?: string
  tone?: "blue" | "emerald"
}) {
  const toneClass = tone === "emerald" ? "text-emerald-400" : "text-[var(--xiv-blue)]"
  const bgClass = tone === "emerald" ? "bg-emerald-500/10" : "bg-[rgba(0,180,255,0.1)]"
  return (
    <div className="xiv-card rounded-xl p-6">
      <div className="flex items-start gap-4">
        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-lg ${bgClass} ${toneClass} flex-shrink-0`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className={`text-3xl md:text-4xl font-bold tabular-nums ${toneClass}`}>
            {value}
          </p>
          <p className="text-muted-foreground mt-1">{label}</p>
          {hint && (
            <p className="text-xs text-muted-foreground/60 mt-1">{hint}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default async function StatsPage() {
  const stats = await loadStats()

  if (!stats) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="font-cinzel text-3xl font-bold mb-4 tracking-wide">Stats unavailable</h1>
        <p className="text-muted-foreground">
          We couldn&apos;t load usage stats just now. Try again in a moment.
        </p>
      </div>
    )
  }

  const firstVenueLabel = stats.firstVenueAt
    ? new Date(stats.firstVenueAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : null

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            Live data
          </div>
          <h1 className="font-cinzel text-4xl md:text-6xl font-bold tracking-wide max-w-3xl text-balance">
            Real venues. <span className="text-[var(--xiv-blue)] xiv-glow-text">Real usage.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
            Aggregate stats from the XIV Venue Manager community. No names, no
            individual venues — just the numbers that prove the platform is in
            use right now.
          </p>
        </div>
      </section>

      {/* Live row */}
      <section className="container mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StatCard
            icon={Activity}
            tone="emerald"
            value={relTime(stats.lastActivityAt)}
            label="Last activity"
            hint="Most recent sale or patron logged across all venues"
          />
          <StatCard
            icon={Building2}
            tone="emerald"
            value={fmt(stats.venuesActive30d)}
            label="Active venues"
            hint="Logged a sale, event, or patron in the last 30 days"
          />
        </div>
      </section>

      {/* All-time grid */}
      <section className="container mx-auto px-4 py-8">
        <h2 className="font-cinzel text-2xl font-bold mb-8 text-center tracking-wide">All-time totals</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard icon={Building2} value={fmt(stats.venuesTotal)} label="Venues onboarded" />
          <StatCard icon={Plug} value={fmt(stats.pluginInstalls)} label="Plugin installs" hint="Active Dalamud plugin API keys" />
          <StatCard icon={CalendarDays} value={fmt(stats.eventsTotal)} label="Events tracked" />
          <StatCard icon={Users} value={fmt(stats.patronEntriesTotal)} label="Patron entries logged" />
          <StatCard icon={ShoppingBag} value={fmt(stats.salesTotal)} label="Sales logged" />
          <StatCard icon={Coins} value={`${fmtCompact(stats.gilTracked)} gil`} label="Gil tracked" hint="Cumulative across every sale" />
          <StatCard icon={Clock} value={fmt(stats.shiftsTotal)} label="Shifts clocked" />
          <StatCard icon={CheckCircle2} value={fmt(stats.tasksCompleted)} label="Tasks completed" />
          <StatCard icon={Link2} value={fmt(stats.partakeEventsSynced)} label="Partake events synced" />
        </div>
      </section>

      {/* Footer */}
      <section className="container mx-auto px-4 py-12">
        <div className="xiv-card rounded-xl p-8 border-[rgba(0,180,255,0.25)]">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div className="flex items-center gap-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-[rgba(0,180,255,0.1)] text-[var(--xiv-blue)] flex-shrink-0">
                <Globe2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold text-lg">
                  Active across {stats.dataCenters} data centers
                  {firstVenueLabel ? ` · running since ${firstVenueLabel}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  Stats refresh every 5 minutes. Aggregate-only — no
                  individual venues are listed.
                </p>
              </div>
            </div>
            <Button asChild size="lg" className="xiv-btn-shimmer group">
              <Link href="/auth/signin">
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                Add your venue
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
