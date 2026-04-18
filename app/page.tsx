import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
      : "bg-primary/10 text-primary"
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

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="flex flex-col items-center text-center space-y-8">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl">
            The Ultimate Venue Management Platform for{" "}
            <span className="text-primary">Final Fantasy XIV</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl">
            Run your FFXIV venue like a pro. Track events, manage staff, log sales
            in real-time, schedule shifts, and grow your community — all from one
            powerful dashboard and an in-game Dalamud plugin.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Button asChild size="lg" className="text-lg px-8 py-6 group">
              <Link href="/auth/signin">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-lg px-8 py-6">
              <Link href="#features">See Features</Link>
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            No credit card required. Sign in with Discord to get started.
          </p>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary tabular-nums">
                Unlimited
              </p>
              <p className="text-muted-foreground">Venues</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary tabular-nums">
                Unlimited
              </p>
              <p className="text-muted-foreground">Staff Members</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary tabular-nums">
                Real-time
              </p>
              <p className="text-muted-foreground">Live Dashboard</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary tabular-nums">
                100%
              </p>
              <p className="text-muted-foreground">Free Forever</p>
            </div>
          </div>
        </div>
      </section>

      {/* Plugin Callout */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="flex justify-center">
            <IconBadge size="xl">
              <Gamepad2 className="h-10 w-10" aria-hidden="true" />
            </IconBadge>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold">In-Game Dalamud Plugin</h2>
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              v3.3.0 — Catppuccin Mocha theme refresh
            </span>
          </div>
          <p className="text-lg text-muted-foreground">
            Log sales, track patrons, and manage shifts without ever leaving
            the game. The XIV Venue Manager plugin runs inside FFXIV via
            Dalamud, syncing every transaction and patron visit to your
            web dashboard in real-time.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
            <div className="p-4 rounded-lg bg-muted/50 border border-white/5">
              <p className="font-semibold mb-1 font-mono text-sm">/vm sale 500</p>
              <p className="text-sm text-muted-foreground">
                Log sales with slash commands
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border border-white/5">
              <p className="font-semibold mb-1">Auto-Sync Patrons</p>
              <p className="text-sm text-muted-foreground">
                Enter/leave tracked automatically
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border border-white/5">
              <p className="font-semibold mb-1">Shift Clock In/Out</p>
              <p className="text-sm text-muted-foreground">
                Start and end shifts in-game
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Everything You Need to Run Your Venue
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            From scheduling events to tracking revenue, we have you covered
            with powerful tools built specifically for FFXIV venues.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Event Management */}
          <Card className="border-2 transition-all hover:border-primary/40 hover:shadow-lg">
            <CardHeader>
              <IconBadge>
                <Calendar className="h-6 w-6" aria-hidden="true" />
              </IconBadge>
              <CardTitle className="mt-3">Event Management</CardTitle>
              <CardDescription>
                Full-featured event scheduling and tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Recurring event templates</FeatureCheck>
                <FeatureCheck>
                  Event status tracking (Draft, Published, Active)
                </FeatureCheck>
                <FeatureCheck>Attendance and revenue per event</FeatureCheck>
                <FeatureCheck>Partake.gg auto-sync</FeatureCheck>
                <FeatureCheck>Discord webhook announcements</FeatureCheck>
              </ul>
            </CardContent>
          </Card>

          {/* Live Mode */}
          <Card className="border-2 border-emerald-500/30 transition-all hover:border-emerald-500/60 hover:shadow-lg">
            <CardHeader>
              <IconBadge tone="emerald">
                <Radio className="h-6 w-6" aria-hidden="true" />
              </IconBadge>
              <CardTitle className="mt-3">Live Mode</CardTitle>
              <CardDescription>
                Real-time dashboard during active events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Live patron count and sales</FeatureCheck>
                <FeatureCheck>Real-time activity feed via SSE</FeatureCheck>
                <FeatureCheck>Running revenue total</FeatureCheck>
                <FeatureCheck>Event duration timer</FeatureCheck>
              </ul>
            </CardContent>
          </Card>

          {/* Shifts */}
          <Card className="border-2 border-emerald-500/30 transition-all hover:border-emerald-500/60 hover:shadow-lg">
            <CardHeader>
              <IconBadge tone="emerald">
                <Clock className="h-6 w-6" aria-hidden="true" />
              </IconBadge>
              <CardTitle className="mt-3">Shift Scheduling</CardTitle>
              <CardDescription>Schedule and track staff shifts</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Managers create and assign shifts</FeatureCheck>
                <FeatureCheck>In-game clock in/out via plugin</FeatureCheck>
                <FeatureCheck>Hours worked tracking</FeatureCheck>
                <FeatureCheck>FFXIV Server Time (ST) display</FeatureCheck>
              </ul>
            </CardContent>
          </Card>

          {/* Staff Management */}
          <Card className="border-2 transition-all hover:border-primary/40 hover:shadow-lg">
            <CardHeader>
              <IconBadge>
                <Users className="h-6 w-6" aria-hidden="true" />
              </IconBadge>
              <CardTitle className="mt-3">Staff Management</CardTitle>
              <CardDescription>
                Organize your team with roles and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Owner, Manager, Staff roles</FeatureCheck>
                <FeatureCheck>Custom roles (Bartender, DJ, etc.)</FeatureCheck>
                <FeatureCheck>Invite links for easy onboarding</FeatureCheck>
                <FeatureCheck>Granular visibility controls</FeatureCheck>
              </ul>
            </CardContent>
          </Card>

          {/* Sales & Timeline */}
          <Card className="border-2 transition-all hover:border-primary/40 hover:shadow-lg">
            <CardHeader>
              <IconBadge>
                <Coins className="h-6 w-6" aria-hidden="true" />
              </IconBadge>
              <CardTitle className="mt-3">Sales &amp; Timeline</CardTitle>
              <CardDescription>
                Track every gil with a unified activity feed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Log sales in-game or on the web</FeatureCheck>
                <FeatureCheck>Live timeline (sales + patrons)</FeatureCheck>
                <FeatureCheck>Staff sales attribution</FeatureCheck>
                <FeatureCheck>Filter by type (Sales / Patrons)</FeatureCheck>
              </ul>
            </CardContent>
          </Card>

          {/* Analytics */}
          <Card className="border-2 transition-all hover:border-primary/40 hover:shadow-lg">
            <CardHeader>
              <IconBadge>
                <BarChart3 className="h-6 w-6" aria-hidden="true" />
              </IconBadge>
              <CardTitle className="mt-3">Analytics Dashboard</CardTitle>
              <CardDescription>Visualize your venue&apos;s performance</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <FeatureCheck>Revenue trends over time</FeatureCheck>
                <FeatureCheck>Patron visit tracking</FeatureCheck>
                <FeatureCheck>Top services breakdown</FeatureCheck>
                <FeatureCheck>Per-event performance</FeatureCheck>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Additional Features */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Plus So Much More</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: ShoppingBag, title: "Service Catalog", blurb: "Define your offerings with prices" },
              { icon: Banknote, title: "Payroll Tracking", blurb: "Track staff earnings and tips" },
              { icon: Building2, title: "Multi-Venue", blurb: "Manage multiple venues easily" },
              { icon: Lock, title: "Privacy Controls", blurb: "Control what staff can see" },
              { icon: Smartphone, title: "Mobile Friendly", blurb: "Works great on any device" },
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
      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <IconBadge size="lg">
                <BookOpen className="h-8 w-8" aria-hidden="true" />
              </IconBadge>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Get Started with Our Guides
            </h2>
            <p className="text-lg text-muted-foreground">
              Step-by-step guides tailored to your role. Everything you need
              to hit the ground running.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Link
              href="/guide/owner"
              className="group block rounded-xl border-2 border-white/10 bg-muted/20 p-6 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-lg"
            >
              <div className="mb-3">
                <IconBadge>
                  <Crown className="h-6 w-6" aria-hidden="true" />
                </IconBadge>
              </div>
              <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                Owner &amp; Manager Guide
              </h3>
              <p className="text-sm text-muted-foreground">
                Venue setup, staff management, event scheduling, Partake.gg
                sync, shifts, analytics, Discord webhooks, and payroll.
              </p>
            </Link>

            <Link
              href="/guide/staff"
              className="group block rounded-xl border-2 border-white/10 bg-muted/20 p-6 transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-lg"
            >
              <div className="mb-3">
                <IconBadge>
                  <Drama className="h-6 w-6" aria-hidden="true" />
                </IconBadge>
              </div>
              <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
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
      <section className="border-t bg-muted/30">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold">
              Ready to Level Up Your Venue?
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Join venue owners across Eorzea who are already using XIV Venue Manager
              to streamline their operations and delight their patrons.
            </p>
            <Button asChild size="lg" className="text-lg px-8 py-6 group">
              <Link href="/auth/signin">
                Start Managing Your Venue
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container mx-auto px-4 py-8">
          <p className="text-sm text-muted-foreground text-center">
            XIV Venue Manager is not affiliated with SQUARE ENIX CO., LTD.
            FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.
          </p>
        </div>
      </footer>
    </div>
  )
}
