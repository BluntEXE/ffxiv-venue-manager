import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function StaffGuidePage() {
  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="mb-8">
          <Button asChild variant="outline" size="sm">
            <Link href="/">&#8592; Back to Home</Link>
          </Button>
        </div>

        <article className="space-y-8">
          <header className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight">Staff Guide</h1>
            <p className="text-xl text-muted-foreground">
              Your guide as an XIV Venue Manager staff member.
            </p>
          </header>

          {/* Getting Started */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-2">Getting Started</h2>

            <ol className="space-y-3 pl-2 text-sm leading-relaxed">
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs bg-primary/20 text-primary rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span><span className="font-medium">Accept your invite.</span> Your manager will send an invite link; click it and sign in with Discord.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs bg-primary/20 text-primary rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div>
                  <span className="font-medium">Install the plugin</span>
                  <ol className="list-decimal list-inside space-y-1.5 pl-2 mt-2">
                    <li>Open Dalamud Settings (type <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">/xlsettings</code> in the game chat)</li>
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
                <span className="font-mono text-xs bg-primary/20 text-primary rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span><span className="font-medium">Configure the plugin:</span> Open it with <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">/xvm</code>, go to Settings, paste your API key (from the website under Settings &gt; API Keys), set the server URL to <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">https://xivvenuemanager.com</code>, and select your venue.</span>
              </li>
            </ol>
          </section>

          {/* Dashboard */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-2">Your Dashboard</h2>

            <p className="text-sm leading-relaxed">Your venue dashboard shows:</p>
            <ul className="space-y-2 pl-2 text-sm leading-relaxed">
              <li><span className="font-medium">My Shifts</span> &mdash; Your upcoming and active shifts</li>
              <li><span className="font-medium">Upcoming Events</span> &mdash; Events happening soon at your venue. Some events may be auto-synced from <a href="https://partake.gg" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">Partake.gg</a>; these show a <span className="font-medium text-indigo-400">Partake</span> badge and update automatically.</li>
            </ul>
          </section>

          {/* Logging Sales */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-2">Logging Sales</h2>

            <div className="space-y-3">
              <h3 className="text-lg font-medium text-muted-foreground">From the Plugin (Recommended)</h3>
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-muted/30 rounded-lg p-3">
                  <code className="text-xs font-mono font-medium">/xvm sale 500 Ehno</code>
                  <p className="text-xs text-muted-foreground mt-1">Open Sales tab with amount and customer prefilled</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <code className="text-xs font-mono font-medium">/xvm sale! 500 Ehno</code>
                  <p className="text-xs text-muted-foreground mt-1">Log sale instantly without opening UI; chat confirmation shown</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <code className="text-xs font-mono font-medium">/xvm target 500</code>
                  <p className="text-xs text-muted-foreground mt-1">Open Sales tab with your current target as customer</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <code className="text-xs font-mono font-medium">/xvm target! 500</code>
                  <p className="text-xs text-muted-foreground mt-1">Log sale instantly for your current target; no UI needed</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-medium text-muted-foreground">From the Website</h3>
              <p className="text-sm leading-relaxed">Go to your venue&apos;s Sales page and use the Log Sale button.</p>
            </div>
          </section>

          {/* Patron Tracking */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-2">Patron Tracking</h2>

            <p className="text-sm leading-relaxed">The plugin tracks when patrons enter and leave your venue&apos;s housing plot, syncing in the background.</p>

            <ul className="space-y-2 pl-2 text-sm leading-relaxed list-disc list-inside">
              <li><span className="font-medium">Event-gated by default:</span> patrons are only logged while a published event is active. Toggle in plugin Settings if you want always-on tracking.</li>
              <li><span className="font-medium">Staff aren&apos;t double-counted:</span> if you&apos;re on an active shift, the plugin classifies you as staff, not a patron (v3.2.0+).</li>
              <li><span className="font-medium">Snooze alerts:</span> run <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">/xvm snooze</code> to silence patron tracking notifications until you leave the house instance.</li>
            </ul>
          </section>

          {/* Shifts */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-2">Shifts</h2>

            <div className="space-y-3">
              <h3 className="text-lg font-medium text-muted-foreground">Viewing Your Shifts</h3>
              <ul className="space-y-2 pl-2 text-sm leading-relaxed">
                <li><span className="font-medium">Plugin</span> &mdash; Open <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">/xvm</code> and go to the My Shift tab</li>
                <li><span className="font-medium">Website</span> &mdash; Check the Shifts page or your dashboard home</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-medium text-muted-foreground">Clocking In and Out</h3>
              <p className="text-sm leading-relaxed mb-3">Use the plugin UI or quick commands:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div className="bg-muted/30 rounded-lg p-3">
                  <code className="text-xs font-mono font-medium">/xvm start</code>
                  <p className="text-xs text-muted-foreground mt-1">Clock into your current shift</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <code className="text-xs font-mono font-medium">/xvm end</code>
                  <p className="text-xs text-muted-foreground mt-1">Clock out of your active shift</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">Or open the plugin (<code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">/xvm</code>), go to the My Shift tab, and use the Clock In / Clock Out buttons. You can clock in up to 30 minutes early and up to 60 minutes late.</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-medium text-muted-foreground">Server Time (ST)</h3>
              <p className="text-sm leading-relaxed">All times show in <span className="font-medium">Server Time (ST)</span>, the standard FFXIV time for your data center. Your timezone doesn&apos;t matter.</p>
            </div>
          </section>

          {/* Tasks */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-2">Tasks</h2>

            <p className="text-sm leading-relaxed">Your manager may assign you tasks on the Tasks page &mdash; prep items, event duties, follow-ups, etc. Depending on your venue&apos;s task visibility setting, you may also see unassigned tasks or all tasks.</p>
            <p className="text-sm leading-relaxed text-muted-foreground">Mark tasks complete from the Tasks page when you&apos;re done.</p>
          </section>

          {/* Timeline */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-2">Timeline</h2>

            <p className="text-sm leading-relaxed">The Timeline shows a live feed of venue activity: sales and patron visits. Filter by:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li><span className="font-medium text-foreground">All Activity</span> &mdash; Everything</li>
              <li><span className="font-medium text-foreground">Sales</span> &mdash; Just transactions</li>
              <li><span className="font-medium text-foreground">Patrons</span> &mdash; Just enter/leave events</li>
            </ul>
            <p className="text-sm leading-relaxed text-muted-foreground">New entries appear without refreshing.</p>
          </section>

          {/* Live Mode */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-2">Live Mode</h2>

            <p className="text-sm leading-relaxed">During active events, the Live page shows patron count, sales, revenue (your manager&apos;s visibility settings control what you see), and a live activity feed.</p>
          </section>

          {/* Tips */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold border-b border-white/10 pb-2">Tips</h2>

            <ul className="space-y-2.5 pl-2 text-sm leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Use <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">/xvm sale!</code> or <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">/xvm target!</code> for fast logging during busy events; no UI interruption.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Use <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">/xvm start</code> and <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono">/xvm end</code> for quick shift management</span>
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
  )
}
