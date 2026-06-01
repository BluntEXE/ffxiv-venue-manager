import Link from "next/link"
import Image from "next/image"
import { getPublicStats } from "@/lib/public-stats"

export const revalidate = 60

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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LatestPluginVersion } from "@/components/latest-plugin-version"
import {
  Gamepad2,
  Calendar,
  Radio,
  Clock,
  Users,
  Coins,
  BarChart3,
  ShoppingBag,
  Banknote,
  Building2,
  Lock,
  Smartphone,
  Bell,
  Link2,
  CheckCircle2,
  BookOpen,
  Crown,
  Drama,
  ArrowRight,
  Check,
} from "lucide-react"

function FeatureCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

function IconBadge({
  children,
  tone = "primary",
  size = "md",
}: {
  children: React.ReactNode
  tone?: "primary" | "emerald"
  size?: "sm" | "md" | "lg" | "xl"
}) {
  const toneClasses =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-500"
      : "bg-[rgba(0,180,255,0.1)] text-[var(--xiv-blue)]"
  const sizeClasses = {
    sm: "w-10 h-10 rounded-lg",
    md: "w-12 h-12 rounded-lg",
    lg: "w-16 h-16 rounded-2xl",
    xl: "w-20 h-20 rounded-2xl",
  }[size]
  return (
    <div
      className={`inline-flex items-center justify-center ${sizeClasses} ${toneClasses}`}
    >
      {children}
    </div>
  )
}

export default async function Home() {
  const stats = await getPublicStats().catch(() => null)
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="xiv-hero-bg overflow-hidden">
        <div className="container mx-auto px-4 py-16 md:py-28">
          <div className="flex flex-col items-center text-center space-y-8">
            <h1 className="xiv-fade-up font-cinzel font-bold tracking-wide max-w-4xl leading-tight" style={{fontSize: 'var(--text-hero)'}}>
              Venue management built for{" "}
              <span className="xiv-glow-text">FFXIV</span>
            </h1>

            <p className="xiv-fade-up-delay-1 text-xl md:text-2xl text-muted-foreground max-w-2xl">
              Track events, log sales, and manage staff from a web dashboard or inside FFXIV via Dalamud.
            </p>

            <div className="xiv-fade-up-delay-2 flex flex-col sm:flex-row gap-4 mt-4">
              <Button asChild size="lg" className="xiv-btn-shimmer text-lg px-8 py-6 group font-semibold" style={{background: 'var(--xiv-blue)', color: '#070b14', boxShadow: '0 0 28px rgba(0,180,255,0.4)'}}>
                <Link href="/auth/signin">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-lg px-8 py-6 border-[var(--xiv-blue-border)] hover:bg-[var(--xiv-blue-dim)] hover:border-[var(--xiv-blue)]">
                <Link href="#features">See Features</Link>
              </Button>
            </div>

            <p className="xiv-fade-up-delay-2 text-sm text-muted-foreground">
              Sign in with Discord to get started.
            </p>
          </div>

          {/* Product preview frame */}
          <div className="mt-14 max-w-[840px] mx-auto w-full xiv-fade-up-delay-2">
            <div className="rounded-xl overflow-hidden border border-[rgba(0,180,255,0.2)] bg-card shadow-[0_30px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(0,180,255,0.08)]">
              {/* Browser chrome bar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--blue-008)] bg-[rgba(7,11,20,0.6)]">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--border)]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--border)]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--border)]" />
                <span className="ml-3 font-mono text-[0.74rem] text-[var(--fg-faint)]">xivvenuemanager.com / live</span>
              </div>
              {/* Preview body */}
              <div className="p-5 grid grid-cols-1 sm:grid-cols-[1.3fr_1fr] gap-4">
                {/* Session bar — full width */}
                <div className="sm:col-span-2 flex items-center gap-4 flex-wrap px-4 py-3.5 rounded-lg border border-[var(--blue-015)]"
                  style={{ background: "linear-gradient(180deg, rgba(0,180,255,0.05), var(--background))" }}>
                  <span className="inline-flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--success-text)]">
                    <span className="xiv-live-dot scale-90" />Live now
                  </span>
                  <span className="font-cinzel font-bold text-[1.15rem]">Open Mic Night</span>
                  <div className="flex-1" />
                  <span className="font-mono text-[1.1rem]">01:23:47</span>
                </div>
                {/* Stat cards */}
                <div className="bg-background border border-[var(--blue-015)] rounded-lg px-4 py-3.5">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[var(--fg-faint)]">In venue now</p>
                  <p className="font-[var(--font-heading)] font-bold text-[1.4rem] mt-1.5">24</p>
                </div>
                <div className="bg-background border border-[var(--blue-015)] rounded-lg px-4 py-3.5">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[var(--fg-faint)]">Sales tonight</p>
                  <p className="font-[var(--font-heading)] font-bold text-[1.4rem] mt-1.5 text-[var(--xiv-blue)]">47,500 gil</p>
                </div>
                {/* Activity feed — full width */}
                <div className="sm:col-span-2 bg-background border border-[var(--blue-015)] rounded-lg overflow-hidden">
                  {[
                    { icon: "enter", label: <><strong>Seraphine Valois</strong> entered the venue</>, time: "just now", blue: false },
                    { icon: "sale",  label: <>K&apos;tani logged a sale — <span className="text-[var(--xiv-blue)] font-semibold">500 gil</span></>, time: "1m ago", blue: true },
                  ].map(({ icon, label, time, blue }, i) => (
                    <div key={i} className={`flex items-center gap-2.5 px-4 py-2.5 text-[0.8rem] ${i > 0 ? "border-t border-[var(--blue-008)]" : ""}`}>
                      <span className={`w-[26px] h-[26px] rounded flex items-center justify-center flex-shrink-0 ${blue ? "bg-[var(--blue-010)] text-[var(--xiv-blue)] border border-[var(--blue-018)]" : "bg-[var(--success-soft)] text-[var(--success-text)] border border-[rgba(16,185,129,0.25)]"}`}>
                        {blue
                          ? <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                          : <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                        }
                      </span>
                      <span className="flex-1">{label}</span>
                      <span className="text-[0.72rem] text-[var(--fg-faint)] ml-auto">{time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof strip — live aggregates */}
      <section className="border-y border-[rgba(0,180,255,0.1)] bg-[#060b16]">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-0 text-sm text-muted-foreground text-center">
            {stats ? (
              <>
                <span><span className="font-semibold text-foreground tabular-nums">{fmt(stats.venuesActive30d)}</span> active venues</span>
                <span className="hidden sm:inline mx-4 text-[rgba(0,180,255,0.3)]">|</span>
                <span><span className="font-semibold text-foreground tabular-nums">{fmt(stats.eventsTotal)}</span> events tracked</span>
                <span className="hidden sm:inline mx-4 text-[rgba(0,180,255,0.3)]">|</span>
                <span><span className="font-semibold text-[var(--xiv-blue)] tabular-nums">{fmtCompact(stats.gilTracked)} gil</span> flowing through the economy</span>
                <span className="hidden sm:inline mx-4 text-[rgba(0,180,255,0.3)]">|</span>
                <span>last activity <span className="font-semibold text-emerald-400">{relTime(stats.lastActivityAt)}</span></span>
              </>
            ) : (
              <span className="opacity-40">Loading usage data&hellip;</span>
            )}
            <span className="hidden sm:inline mx-4 text-[rgba(0,180,255,0.3)]">|</span>
            <Link href="/stats" className="hover:text-[var(--xiv-blue)] transition-colors inline-flex items-center gap-1">
              Full stats <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Plugin Callout */}
      <section className="container mx-auto px-4 py-16 md:py-20 xiv-scroll-reveal">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="flex justify-center">
            <IconBadge size="xl">
              <Gamepad2 className="h-10 w-10" aria-hidden="true" />
            </IconBadge>
          </div>
          <h2 className="font-cinzel text-3xl md:text-4xl font-bold tracking-wide">In-Game Dalamud Plugin</h2>
          <div className="flex justify-center">
            <LatestPluginVersion />
          </div>
          <p className="text-lg text-muted-foreground">
            Log sales, track patrons, and manage shifts without leaving
            the game. The plugin runs inside FFXIV, syncing every sale and
            patron visit to your dashboard as it happens.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            <div className="p-5 rounded-lg xiv-card flex flex-col gap-2">
              <p className="font-mono text-sm font-semibold" style={{color: 'var(--xiv-blue)'}}>/xvm sale 500</p>
              <p className="text-sm text-muted-foreground leading-snug">Log sales with slash commands</p>
            </div>
            <div className="p-5 rounded-lg xiv-card flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">Auto-Sync Patrons</p>
              <p className="text-sm text-muted-foreground leading-snug">Enter/leave tracked automatically</p>
            </div>
            <div className="p-5 rounded-lg xiv-card flex flex-col gap-2">
              <p className="text-sm font-semibold text-foreground">Shift Clock In/Out</p>
              <p className="text-sm text-muted-foreground leading-snug">Start and end shifts in-game</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-16">
          <div className="xiv-divider">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="6" y="0" width="8.485" height="8.485" transform="rotate(45 6 0)" fill="rgba(0,180,255,0.7)"/></svg>
          </div>
          <h2 className="font-cinzel text-3xl md:text-4xl font-bold tracking-wide">
            Tools built for FFXIV venues
          </h2>
        </div>

        {/* Editorial feature rows — numbered, full-width, premium */}
        <div className="max-w-4xl mx-auto">

          <div className="xiv-feature-row xiv-scroll-reveal">
            <span className="xiv-feature-num" aria-hidden="true">01</span>
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <IconBadge><Calendar className="h-6 w-6" aria-hidden="true" /></IconBadge>
                  <h3 className="font-cinzel font-bold text-xl tracking-wide">Event Management</h3>
                </div>
                <p className="text-muted-foreground mb-4 leading-relaxed">Full-featured scheduling: draft, publish, run. Revenue and attendance tracked per event with Discord announcements on autopilot.</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground">
                  <FeatureCheck>Recurring templates</FeatureCheck>
                  <FeatureCheck>Partake.gg auto-sync</FeatureCheck>
                  <FeatureCheck>Draft / Published / Active states</FeatureCheck>
                  <FeatureCheck>Discord webhooks</FeatureCheck>
                </ul>
              </div>
            </div>
          </div>

          <div className="xiv-feature-row xiv-scroll-reveal">
            <span className="xiv-feature-num" aria-hidden="true">02</span>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <IconBadge tone="emerald"><Radio className="h-6 w-6" aria-hidden="true" /></IconBadge>
                <h3 className="font-cinzel font-bold text-xl tracking-wide">Live Mode</h3>
              </div>
              <p className="text-muted-foreground mb-4 leading-relaxed">A real-time command centre during your open events. Patron count, running gil total, and every sale pushed live via server-sent events.</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Live patron count and sales</FeatureCheck>
                <FeatureCheck>Running revenue total</FeatureCheck>
                <FeatureCheck>Activity feed via SSE</FeatureCheck>
                <FeatureCheck>No refresh needed</FeatureCheck>
              </ul>
            </div>
          </div>

          <div className="xiv-feature-row xiv-scroll-reveal">
            <span className="xiv-feature-num" aria-hidden="true">03</span>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <IconBadge><Users className="h-6 w-6" aria-hidden="true" /></IconBadge>
                <h3 className="font-cinzel font-bold text-xl tracking-wide">Staff Management</h3>
              </div>
              <p className="text-muted-foreground mb-4 leading-relaxed">Roles, permissions, and onboarding built for venue teams of any size. Control what each person can see and do.</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Owner, Manager, Staff roles</FeatureCheck>
                <FeatureCheck>Custom roles (DJ, Bartender…)</FeatureCheck>
                <FeatureCheck>Invite links</FeatureCheck>
                <FeatureCheck>Granular visibility controls</FeatureCheck>
              </ul>
            </div>
          </div>

          <div className="xiv-feature-row xiv-scroll-reveal">
            <span className="xiv-feature-num" aria-hidden="true">04</span>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <IconBadge><Coins className="h-6 w-6" aria-hidden="true" /></IconBadge>
                <h3 className="font-cinzel font-bold text-xl tracking-wide">Sales &amp; Timeline</h3>
              </div>
              <p className="text-muted-foreground mb-4 leading-relaxed">Every gil accounted for. Log from in-game with a slash command or on the web — it lands in the timeline in real time.</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Log in-game or on the web</FeatureCheck>
                <FeatureCheck>Staff sales attribution</FeatureCheck>
                <FeatureCheck>Live timeline feed</FeatureCheck>
                <FeatureCheck>Filter by type</FeatureCheck>
              </ul>
            </div>
          </div>

          <div className="xiv-feature-row xiv-scroll-reveal">
            <span className="xiv-feature-num" aria-hidden="true">05</span>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <IconBadge tone="emerald"><Clock className="h-6 w-6" aria-hidden="true" /></IconBadge>
                <h3 className="font-cinzel font-bold text-xl tracking-wide">Shift Scheduling</h3>
              </div>
              <p className="text-muted-foreground mb-4 leading-relaxed">Assign shifts before the event, then staff clock in and out without leaving FFXIV. Hours are tracked automatically.</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Create and assign shifts</FeatureCheck>
                <FeatureCheck>In-game clock in/out</FeatureCheck>
                <FeatureCheck>FFXIV Server Time display</FeatureCheck>
                <FeatureCheck>Hours summary per staff</FeatureCheck>
              </ul>
            </div>
          </div>

          <div className="xiv-feature-row xiv-scroll-reveal">
            <span className="xiv-feature-num" aria-hidden="true">06</span>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <IconBadge><BarChart3 className="h-6 w-6" aria-hidden="true" /></IconBadge>
                <h3 className="font-cinzel font-bold text-xl tracking-wide">Analytics</h3>
              </div>
              <p className="text-muted-foreground mb-4 leading-relaxed">Visualise your venue&apos;s performance over time. Revenue trends, patron visit heatmaps, and per-event breakdowns.</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Revenue trends</FeatureCheck>
                <FeatureCheck>Patron visit tracking</FeatureCheck>
                <FeatureCheck>Per-event performance</FeatureCheck>
                <FeatureCheck>Export-ready data</FeatureCheck>
              </ul>
            </div>
          </div>

        </div>
      </section>

      {/* Additional Features */}
      <section className="border-y border-[rgba(0,180,255,0.1)] bg-[#060b16]">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12">
            <div className="xiv-divider">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="6" y="0" width="8.485" height="8.485" transform="rotate(45 6 0)" fill="rgba(0,180,255,0.7)"/></svg>
            </div>
            <h2 className="font-cinzel text-3xl md:text-4xl font-bold mb-4 tracking-wide">Included</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: ShoppingBag, title: "Service Catalog", blurb: "Define your offerings with prices" },
              { icon: Banknote, title: "Payroll Tracking", blurb: "Track staff earnings and tips" },
              { icon: Building2, title: "Multi-Venue", blurb: "Manage multiple venues" },
              { icon: Lock, title: "Privacy Controls", blurb: "Control what staff can see" },
              { icon: Smartphone, title: "Mobile Friendly", blurb: "Works on any device" },
              { icon: Bell, title: "Discord Webhooks", blurb: "Auto-post events, sales, tasks" },
              { icon: Link2, title: "Partake.gg Sync", blurb: "Auto-import events from Partake" },
              { icon: CheckCircle2, title: "Task Management", blurb: "Assign, prioritize, track" },
            ].map(({ icon: Icon, title, blurb }) => (
              <div key={title} className="space-y-2 flex flex-col items-center">
                <IconBadge>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </IconBadge>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guides Section */}
      <section id="guides" className="container mx-auto px-4 py-16 md:py-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <IconBadge size="lg">
                <BookOpen className="h-8 w-8" aria-hidden="true" />
              </IconBadge>
            </div>
            <div className="xiv-divider">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="6" y="0" width="8.485" height="8.485" transform="rotate(45 6 0)" fill="rgba(0,180,255,0.7)"/></svg>
            </div>
            <h2 className="font-cinzel text-3xl md:text-4xl font-bold mb-4 tracking-wide">
              Start with a guide
            </h2>
            <p className="text-lg text-muted-foreground">
              Pick a guide for your role and start.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Link
              href="/guide/owner"
              className="group block rounded-xl p-6 xiv-card"
            >
              <div className="mb-3">
                <IconBadge>
                  <Crown className="h-6 w-6" aria-hidden="true" />
                </IconBadge>
              </div>
              <h3 className="text-xl font-semibold mb-2 transition-colors group-hover:text-[var(--xiv-blue)]">
                Owner &amp; Manager Guide
              </h3>
              <p className="text-sm text-muted-foreground">
                Venue setup, staff management, event scheduling, Partake.gg
                sync, shifts, analytics, Discord webhooks, and payroll.
              </p>
            </Link>

            <Link
              href="/guide/staff"
              className="group block rounded-xl p-6 xiv-card"
            >
              <div className="mb-3">
                <IconBadge>
                  <Drama className="h-6 w-6" aria-hidden="true" />
                </IconBadge>
              </div>
              <h3 className="text-xl font-semibold mb-2 transition-colors group-hover:text-[var(--xiv-blue)]">
                Staff Guide
              </h3>
              <p className="text-sm text-muted-foreground">
                Logging sales, plugin commands, shift clock-in/out,
                patron tracking, timeline, and live mode.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-[rgba(0,180,255,0.1)] bg-[#060b16]">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center space-y-8">
            <div className="xiv-divider">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="6" y="0" width="8.485" height="8.485" transform="rotate(45 6 0)" fill="rgba(0,180,255,0.7)"/></svg>
            </div>
            <h2 className="font-cinzel text-3xl md:text-4xl font-bold tracking-wide">
              Get your venue running.
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Your sales, staff hours, and patron counts. One dashboard.
            </p>
            <div className="flex flex-col items-center gap-2">
              <Button asChild size="lg" className="text-lg px-8 py-6 group" style={{background: 'var(--xiv-blue)', color: '#070b14', boxShadow: '0 0 24px rgba(0,180,255,0.35)'}}>
                <Link href="/auth/signin">
                  Start Managing Your Venue
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <p className="text-sm text-muted-foreground">Sign in with Discord in 30 seconds.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--blue-008)]">
        <div className="container mx-auto px-4 pt-12 pb-8">
          {/* 4-col grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 mb-10">
            {/* Brand col */}
            <div>
              <Link href="/" className="flex items-center gap-2.5 mb-4">
                <Image src="/xiv-icon.png" alt="XIV Venue Manager" width={28} height={28} className="object-contain" />
                <span className="font-cinzel font-bold tracking-wide text-sm">
                  <span style={{ color: "var(--xiv-blue)" }}>XIV</span>{" "}
                  <span className="text-foreground/80">Venue Manager</span>
                </span>
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[240px]">
                The all-in-one toolset for running roleplay venues in Final Fantasy XIV.
              </p>
              <Link
                href="https://ko-fi.com/ehnocure"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--support-pink)] hover:text-pink-300 transition-colors"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5c2 0 3.3 1.2 3.8 2.2C9.5 6.2 10.8 5 12.8 5 16.1 5 17.6 8.4 16 11.7 13.5 16.4 12 21 12 21z"/>
                </svg>
                Support on Ko-fi
              </Link>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold mb-4">Product</h4>
              <div className="space-y-2.5">
                {[
                  { label: "Features", href: "/#features" },
                  { label: "How it works", href: "/#how" },
                  { label: "Dashboard", href: "/dashboard" },
                  { label: "Discover venues", href: "/discover" },
                  { label: "Usage stats", href: "/stats" },
                ].map(({ label, href }) => (
                  <Link key={href} href={href} className="block text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors">{label}</Link>
                ))}
              </div>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-sm font-semibold mb-4">Resources</h4>
              <div className="space-y-2.5">
                {[
                  { label: "Owner guide", href: "/guide/owner" },
                  { label: "Staff guide", href: "/guide/staff" },
                  { label: "Plugin setup", href: "/guide/owner#plugin" },
                  { label: "Slash commands", href: "/guide/owner#commands" },
                  { label: "FAQ", href: "/guide/owner#faq" },
                ].map(({ label, href }) => (
                  <Link key={href} href={href} className="block text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors">{label}</Link>
                ))}
              </div>
            </div>

            {/* Community */}
            <div>
              <h4 className="text-sm font-semibold mb-4">Community</h4>
              <div className="space-y-2.5">
                {[
                  { label: "Discord", href: "https://discord.gg/xivvenuemanager" },
                  { label: "GitHub", href: "https://github.com/BluntEXE/xiv-venue-manager" },
                  { label: "Partake.gg", href: "https://partake.gg" },
                  { label: "Ko-fi", href: "https://ko-fi.com/ehnocure" },
                ].map(({ label, href }) => (
                  <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="block text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors">{label}</a>
                ))}
              </div>
            </div>
          </div>

          {/* Footer bottom */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-[var(--blue-008)]">
            <p className="text-[0.72rem] text-[var(--fg-faint)] leading-relaxed text-center sm:text-left max-w-[52ch]">
              &copy; {new Date().getFullYear()} XIV Venue Manager. A community fan tool — not affiliated with SQUARE ENIX CO., LTD. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.
            </p>
            {/* Social icons */}
            <div className="flex items-center gap-2">
              {[
                { href: "https://discord.gg/xivvenuemanager", label: "Discord", path: "M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5c1.7.4 3 1 4.2 1.8a16.5 16.5 0 0 0-14.6 0C6 4.5 7.3 3.9 9 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C1 8.9.2 13.3.6 17.6a19.9 19.9 0 0 0 6 3l.8-1.3c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l.8 1.3a19.9 19.9 0 0 0 6-3c.5-5-.7-9.4-3.4-13.2ZM8.9 15c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.2 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" },
                { href: "https://github.com/BluntEXE/xiv-venue-manager", label: "GitHub", path: "M12 2A10 10 0 0 0 8.8 21.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" },
                { href: "https://ko-fi.com/ehnocure", label: "Ko-fi", path: "M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5c2 0 3.3 1.2 3.8 2.2C9.5 6.2 10.8 5 12.8 5 16.1 5 17.6 8.4 16 11.7 13.5 16.4 12 21 12 21z" },
              ].map(({ href, label, path }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 rounded-lg border border-[var(--blue-015)] flex items-center justify-center text-muted-foreground hover:text-[var(--xiv-blue)] hover:border-[var(--blue-035)] transition-colors"
                >
                  <svg className="w-[17px] h-[17px] fill-current" viewBox="0 0 24 24" aria-hidden="true">
                    <path d={path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
