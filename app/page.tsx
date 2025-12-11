import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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
            Run your FFXIV venue like a pro. Track events, manage staff, monitor sales,
            and grow your community — all from one powerful dashboard.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Button asChild size="lg" className="text-lg px-8 py-6">
              <Link href="/auth/signin">
                Get Started Free
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-lg px-8 py-6">
              <Link href="#features">
                See Features
              </Link>
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
              <p className="text-3xl md:text-4xl font-bold text-primary">Unlimited</p>
              <p className="text-muted-foreground">Venues</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary">Unlimited</p>
              <p className="text-muted-foreground">Staff Members</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary">Real-time</p>
              <p className="text-muted-foreground">Analytics</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-primary">100%</p>
              <p className="text-muted-foreground">Free Forever</p>
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
            From scheduling events to tracking revenue, we've got you covered with powerful tools built specifically for FFXIV venues.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Event Management */}
          <Card className="border-2">
            <CardHeader>
              <div className="text-4xl mb-2">📅</div>
              <CardTitle>Event Management</CardTitle>
              <CardDescription>
                Full-featured event scheduling and calendar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Interactive calendar view
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Recurring event templates
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Event status tracking (Draft, Published, Active)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Attendance and revenue per event
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Staff Management */}
          <Card className="border-2">
            <CardHeader>
              <div className="text-4xl mb-2">👥</div>
              <CardTitle>Staff Management</CardTitle>
              <CardDescription>
                Organize your team with roles and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Owner, Manager, Staff roles
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Custom roles (Bartender, DJ, etc.)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Invite links for easy onboarding
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Granular visibility controls
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Sales Tracking */}
          <Card className="border-2">
            <CardHeader>
              <div className="text-4xl mb-2">💰</div>
              <CardTitle>Sales & Revenue</CardTitle>
              <CardDescription>
                Track every gil that flows through your venue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Service-based sales logging
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Per-event revenue tracking
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Staff sales attribution
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> CSV export for records
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Analytics */}
          <Card className="border-2">
            <CardHeader>
              <div className="text-4xl mb-2">📊</div>
              <CardTitle>Analytics Dashboard</CardTitle>
              <CardDescription>
                Visualize your venue's performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Revenue trends over time
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Patron visit tracking
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Top services breakdown
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Event completion rates
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Task Management */}
          <Card className="border-2">
            <CardHeader>
              <div className="text-4xl mb-2">✅</div>
              <CardTitle>Task Management</CardTitle>
              <CardDescription>
                Keep your team organized and accountable
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Create and assign tasks
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Priority levels (Low to Urgent)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Due dates and categories
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Role-based task assignment
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Discord Integration */}
          <Card className="border-2">
            <CardHeader>
              <div className="text-4xl mb-2">🔔</div>
              <CardTitle>Discord Webhooks</CardTitle>
              <CardDescription>
                Keep your community in the loop automatically
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Event announcements
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Task completion alerts
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Sales notifications
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> Multi-channel support
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Additional Features */}
      <section className="border-y bg-muted/30">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Plus So Much More
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="space-y-2">
              <div className="text-3xl">🛍️</div>
              <h3 className="font-semibold">Service Catalog</h3>
              <p className="text-sm text-muted-foreground">Define your offerings with prices</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl">💵</div>
              <h3 className="font-semibold">Payroll Tracking</h3>
              <p className="text-sm text-muted-foreground">Track staff earnings and tips</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl">🏢</div>
              <h3 className="font-semibold">Multi-Venue</h3>
              <p className="text-sm text-muted-foreground">Manage multiple venues easily</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl">🔒</div>
              <h3 className="font-semibold">Privacy Controls</h3>
              <p className="text-sm text-muted-foreground">Control what staff can see</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl">📱</div>
              <h3 className="font-semibold">Mobile Friendly</h3>
              <p className="text-sm text-muted-foreground">Works great on any device</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl">🎨</div>
              <h3 className="font-semibold">Role Colors</h3>
              <p className="text-sm text-muted-foreground">Customize role appearance</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl">📋</div>
              <h3 className="font-semibold">Event Templates</h3>
              <p className="text-sm text-muted-foreground">Save time with templates</p>
            </div>
            <div className="space-y-2">
              <div className="text-3xl">⚡</div>
              <h3 className="font-semibold">Fast & Reliable</h3>
              <p className="text-sm text-muted-foreground">Built for performance</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold">
            Ready to Level Up Your Venue?
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Join venue owners across Eorzea who are already using XIV Venue Manager
            to streamline their operations and delight their patrons.
          </p>
          <Button asChild size="lg" className="text-lg px-8 py-6">
            <Link href="/auth/signin">
              Start Managing Your Venue
            </Link>
          </Button>
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
