import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Staff Guide — XIV Venue Manager",
  description: "Everything staff need to know: plugin setup, logging sales, clocking shifts, patron tracking and more.",
}

import Link from "next/link"
import { GuideTOC } from "@/components/guide-toc"
import { SiteFooter } from "@/components/site-footer"

export default function StaffGuidePage() {
  return (
    <div className="min-h-screen">
      {/* Guide hero */}
      <div className="xiv-hero-bg overflow-hidden border-b border-[var(--blue-008)]">
        <div className="container mx-auto px-4 py-14 max-w-3xl">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors mb-6">
            &#8592; Back to Home
          </Link>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)]" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">Documentation</span>
          </div>
          <h1 className="font-cinzel text-4xl font-bold tracking-wide xiv-glow-text mb-3">Staff Guide</h1>
          <p className="text-lg text-muted-foreground mb-6">Everything you need to know as an XIV Venue Manager staff member.</p>
          {/* Audience role switcher */}
          <div className="flex gap-1 bg-[rgba(7,11,20,0.6)] border border-[var(--blue-015)] rounded-full p-1 w-fit">
            <Link href="/guide/owner" className="text-sm font-semibold px-4 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] transition-colors">
              Owners &amp; managers
            </Link>
            <span className="text-sm font-semibold px-4 py-1.5 rounded-full bg-[var(--xiv-blue)] text-[var(--xiv-navy)]">
              Staff
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-11 items-start">

          <GuideTOC
            items={[
              { id: "getting-started", label: "Getting Started" },
              { id: "dashboard",       label: "Your Dashboard" },
              { id: "sales",           label: "Logging Sales" },
              { id: "patrons",         label: "Patron Tracking" },
              { id: "shifts",          label: "Shifts" },
              { id: "tasks",           label: "Tasks" },
              { id: "timeline",        label: "Timeline" },
              { id: "live",            label: "Live Mode" },
              { id: "tips",            label: "Tips" },
            ]}
            footerLink={{ href: "/guide/owner", label: "Owner guide" }}
          />

          <article className="space-y-8 min-w-0">
          <header className="sr-only">
            <h1>Staff Guide</h1>
          </header>

          {/* What's New */}
          <div className="bg-[rgba(0,180,255,0.06)] border border-[rgba(0,180,255,0.2)] rounded-lg p-4 space-y-1.5">
            <p className="text-xs font-semibold text-[var(--xiv-blue)] uppercase tracking-widest">Recent Updates</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><span className="font-medium text-foreground">Website redesign</span>: The dashboard and every page has a new look. Navigation, cards, and layout are all updated.</li>
              <li><span className="font-medium text-foreground">Plugin UI redesign (v3.8.0)</span>: The plugin has a new XIV blue design to match the website.</li>
              <li><span className="font-medium text-foreground">Slash commands renamed</span>: <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/vm</code> is now <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm</code> and <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/venue</code> is now <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvenue</code>. Update your macros if you had any.</li>
            </ul>
          </div>

          {/* Getting Started */}
          <section id="getting-started" className="space-y-6 scroll-mt-[84px]">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Getting Started</h2>

            <ol className="space-y-3 pl-2 text-sm leading-relaxed">
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span><span className="font-medium">Accept your invite.</span> Your manager will send an invite link; click it and sign in with Discord.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div>
                  <span className="font-medium">Install the plugin</span>
                  <ol className="list-decimal list-inside space-y-1.5 pl-2 mt-2">
                    <li>Open Dalamud Settings (type <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xlsettings</code> in the game chat)</li>
                    <li>Go to the <span className="font-medium">Experimental</span> tab</li>
                    <li>Under <span className="font-medium">Custom Plugin Repositories</span>, paste this URL and click the <span className="font-medium">+</span> button:<br />
                      <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono select-all break-all">https://raw.githubusercontent.com/BluntEXE/XIVVenueManagerSync/master/repo.json</code>
                    </li>
                    <li>Click <span className="font-medium">Save and Close</span></li>
                    <li>Open the Plugin Installer, search for &quot;XIVVenueManagerSync&quot;, and install it</li>
                  </ol>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">3</span>
                <div className="space-y-2 text-sm leading-relaxed">
                  <span><span className="font-medium">Configure the plugin:</span> Open it with <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm</code> and go to Settings. Paste your API key, set the server URL to <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">https://xivvenuemanager.com</code>, and select your venue.</span>
                  <p className="text-muted-foreground">Your API key is in your venue dashboard — open the venue, click <span className="font-medium text-foreground">Settings</span> in the left sidebar (not the account menu in the top right), then <span className="font-medium text-foreground">API Keys</span>.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">4</span>
                <div className="space-y-2 text-sm leading-relaxed">
                  <span><span className="font-medium">Add your character:</span> On the website, open the account menu in the top right and go to <span className="font-medium">Account Settings</span>, then <span className="font-medium">Characters</span>. Add your FFXIV character name and world. This lets the plugin tell you apart from patrons so you are not counted as a visitor during your shift.</span>
                  <p className="text-muted-foreground">You also need to save the venue location in your own plugin. Visit the venue&apos;s housing plot in game, open the plugin&apos;s <span className="font-medium text-foreground">Venues</span> tab, enter a name, and click <span className="font-medium text-foreground">Save Venue</span>. Then select your venue from the <span className="font-medium text-foreground">XIV-App Venue</span> dropdown. This is saved per-person and must be done by each staff member individually.</p>
                </div>
              </li>
            </ol>
          </section>

          {/* Dashboard */}
          <section id="dashboard" className="space-y-6 scroll-mt-[84px]">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Your Dashboard</h2>

            <p className="text-sm leading-relaxed">Your venue dashboard shows:</p>
            <ul className="space-y-2 pl-2 text-sm leading-relaxed">
              <li><span className="font-medium">My Shifts</span>: Your upcoming and active shifts</li>
              <li><span className="font-medium">Upcoming Events</span>: Events happening soon at your venue. Some events may be auto-synced from <a href="https://partake.gg" target="_blank" rel="noopener noreferrer" className="text-[var(--xiv-blue)] underline underline-offset-2 hover:opacity-80">Partake.gg</a>; these show a <span className="font-medium text-[var(--xiv-blue)]">Partake</span> badge and update automatically.</li>
            </ul>
          </section>

          {/* Logging Sales */}
          <section id="sales" className="space-y-6 scroll-mt-[84px]">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Logging Sales</h2>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">From the Plugin (Recommended)</h3>
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                  <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm sale 500 Ehno</code>
                  <p className="text-xs text-muted-foreground mt-1">Open Sales tab with amount and customer prefilled</p>
                </div>
                <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                  <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm sale! 500 Ehno</code>
                  <p className="text-xs text-muted-foreground mt-1">Log sale instantly without opening UI; chat confirmation shown</p>
                </div>
                <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                  <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm target 500</code>
                  <p className="text-xs text-muted-foreground mt-1">Open Sales tab with your current target as customer</p>
                </div>
                <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                  <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm target! 500</code>
                  <p className="text-xs text-muted-foreground mt-1">Log sale instantly for your current target; no UI needed</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">From the Website</h3>
              <p className="text-sm leading-relaxed">Go to your venue&apos;s Sales page and use the Log Sale button.</p>
            </div>
          </section>

          {/* Patron Tracking */}
          <section id="patrons" className="space-y-6 scroll-mt-[84px]">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Patron Tracking</h2>

            <p className="text-sm leading-relaxed">The plugin tracks when patrons enter and leave your venue&apos;s housing plot, syncing in the background.</p>

            <ul className="space-y-2 pl-2 text-sm leading-relaxed list-disc list-inside">
              <li><span className="font-medium">Event-gated by default:</span> patrons are only logged while a published event is active. Toggle in plugin Settings if you want always-on tracking.</li>
              <li><span className="font-medium">Staff aren&apos;t double-counted:</span> if you&apos;re on an active shift, the plugin classifies you as staff, not a patron (v3.2.0+).</li>
              <li><span className="font-medium">Snooze alerts:</span> run <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm snooze</code> to silence patron tracking notifications until you leave the house instance.</li>
            </ul>
          </section>

          {/* Shifts */}
          <section id="shifts" className="space-y-6 scroll-mt-[84px]">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Shifts</h2>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Viewing Your Shifts</h3>
              <ul className="space-y-2 pl-2 text-sm leading-relaxed">
                <li><span className="font-medium">Plugin</span>: Open <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm</code> and go to the My Shift tab</li>
                <li><span className="font-medium">Website</span>: Check the Shifts page or your dashboard home</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Clocking In and Out</h3>
              <p className="text-sm leading-relaxed mb-3">Use the plugin UI or quick commands:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                  <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm start</code>
                  <p className="text-xs text-muted-foreground mt-1">Clock into your current shift</p>
                </div>
                <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                  <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm end</code>
                  <p className="text-xs text-muted-foreground mt-1">Clock out of your active shift</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">Or open the plugin (<code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm</code>), go to the My Shift tab, and use the Clock In / Clock Out buttons. You can clock in up to 30 minutes early and up to 60 minutes late.</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Server Time (ST)</h3>
              <p className="text-sm leading-relaxed">All times show in <span className="font-medium">Server Time (ST)</span>, the standard FFXIV time for your data center. Your timezone doesn&apos;t matter.</p>
            </div>
          </section>

          {/* Tasks */}
          <section id="tasks" className="space-y-6 scroll-mt-[84px]">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Tasks</h2>

            <p className="text-sm leading-relaxed">Your manager assigns tasks on the Tasks page: prep items, event duties, follow-ups. Depending on your venue&apos;s task visibility setting, you may also see unassigned tasks or all tasks.</p>
            <p className="text-sm leading-relaxed text-muted-foreground">Mark tasks complete from the Tasks page when you&apos;re done.</p>
          </section>

          {/* Timeline */}
          <section id="timeline" className="space-y-6 scroll-mt-[84px]">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Timeline</h2>

            <p className="text-sm leading-relaxed">The Timeline shows a live feed of venue activity: sales and patron visits. Filter by:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li><span className="font-medium text-foreground">All Activity</span>: Everything</li>
              <li><span className="font-medium text-foreground">Sales</span>: Just transactions</li>
              <li><span className="font-medium text-foreground">Patrons</span>: Just enter/leave events</li>
            </ul>
            <p className="text-sm leading-relaxed text-muted-foreground">New entries appear without refreshing.</p>
          </section>

          {/* Live Mode */}
          <section id="live" className="space-y-6 scroll-mt-[84px]">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Live Mode</h2>

            <p className="text-sm leading-relaxed">During active events, the Live page shows patron count, sales, revenue (your manager&apos;s visibility settings control what you see), and a live activity feed.</p>
          </section>

          {/* Tips */}
          <section id="tips" className="space-y-6 scroll-mt-[84px]">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Tips</h2>

            <ul className="space-y-2.5 pl-2 text-sm leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Use <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm sale!</code> or <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm target!</code> for fast logging during busy events; no UI interruption.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Use <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm start</code> and <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm end</code> for quick shift management</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Keep the plugin running during your shift so patron tracking stays active</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Check the Timeline after events to see the full activity history</span>
              </li>
            </ul>
          </section>
          </article>
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}
