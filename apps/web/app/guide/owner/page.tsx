import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function OwnerManagerGuidePage() {
  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="mb-8">
          <Button asChild variant="outline" size="sm" className="border-[rgba(0,180,255,0.25)] text-foreground/70 hover:text-[var(--xiv-blue)] hover:border-[rgba(0,180,255,0.5)] hover:bg-[rgba(0,180,255,0.06)]">
            <Link href="/">&#8592; Back to Home</Link>
          </Button>
        </div>

        <article className="space-y-8">
          <header className="space-y-3">
            <h1 className="font-cinzel text-4xl font-bold tracking-wide">Owner &amp; Manager Guide</h1>
            <p className="text-xl text-muted-foreground">
              Setup and management reference for XIV Venue Manager.
            </p>
          </header>

          {/* Initial Setup */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Initial Setup</h2>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">1. Create Your Venue</h3>
              <ol className="list-decimal list-inside space-y-1.5 pl-2 text-sm leading-relaxed">
                <li>Sign in at <a href="https://xivvenuemanager.com" className="text-[var(--xiv-blue)] underline underline-offset-2 hover:opacity-80">xivvenuemanager.com</a> with Discord</li>
                <li>Click &quot;Create Venue&quot;</li>
                <li>Fill in your venue name, world, data center, and optional location/description</li>
              </ol>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">2. Install the Plugin</h3>
              <ol className="list-decimal list-inside space-y-1.5 pl-2 text-sm leading-relaxed">
                <li>Open Dalamud Settings (type <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xlsettings</code> in the game chat)</li>
                <li>Go to the <span className="font-medium">Experimental</span> tab</li>
                <li>Under <span className="font-medium">Custom Plugin Repositories</span>, paste this URL and click the <span className="font-medium">+</span> button:<br />
                  <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono select-all break-all">https://raw.githubusercontent.com/BluntEXE/XIVVenueManagerSync/master/repo.json</code>
                </li>
                <li>Click <span className="font-medium">Save and Close</span></li>
                <li>Open the Plugin Installer, search for &quot;XIVVenueManagerSync&quot;, and install it</li>
                <li>Open with <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm</code>, go to Settings</li>
                <li>Generate an API key on the website (Settings &gt; API Keys) and paste it in the plugin</li>
                <li>Set the server URL to <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">https://xivvenuemanager.com</code></li>
                <li>Select your venue</li>
              </ol>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">3. Configure Venue Settings</h3>
              <p className="text-sm leading-relaxed">In venue Settings:</p>
              <ul className="space-y-3 pl-2 text-sm leading-relaxed">
                <li className="space-y-1.5">
                  <span className="font-medium">Visibility Controls</span> &mdash; Control what staff can see:
                  <ul className="list-disc list-inside pl-4 space-y-1 mt-1.5 text-muted-foreground">
                    <li><code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">salesVisibility</code>: <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">all</code> (everyone sees all sales), <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">own</code> (staff see only their own), <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">none</code></li>
                    <li><code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">revenueVisibility</code>: Same options &mdash; controls revenue numbers in analytics and Live Mode</li>
                  </ul>
                </li>
                <li><span className="font-medium">Discord Webhooks</span> &mdash; Separate webhook URLs for staff, events, and revenue channels</li>
              </ul>
            </div>
          </section>

          {/* Managing Staff */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Managing Staff</h2>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Inviting Staff</h3>
              <p className="text-sm leading-relaxed">Go to Staff &gt; Invite, create an invite link, and share it. Staff sign in with Discord.</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Roles</h3>
              <ul className="space-y-2 pl-2 text-sm leading-relaxed">
                <li><span className="font-medium">Owner</span> &mdash; Full access to everything</li>
                <li><span className="font-medium">Manager</span> &mdash; Can manage events, tasks, shifts, services, staff, and view analytics</li>
                <li><span className="font-medium">Staff</span> &mdash; Can log sales, view their shifts, see events. Visibility depends on settings.</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Custom Roles</h3>
              <p className="text-sm leading-relaxed">Create custom roles like Bartender, DJ, Greeter under Staff &gt; Roles. Assign them to services so staff only see relevant offerings in the plugin.</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Temporary Roles (Deputize)</h3>
              <p className="text-sm leading-relaxed">Grant someone a higher role for a set time, useful when you need cover.</p>
              <ul className="space-y-2 pl-2 text-sm leading-relaxed list-disc list-inside">
                <li>On the Staff page, open a member&apos;s card and click <span className="font-medium">Manage Role</span></li>
                <li>Set a <span className="font-medium">Temporary Role</span> (e.g. Manager) and pick an expiry</li>
                <li>They get the elevated role immediately and revert to their permanent role when it expires</li>
                <li>Cards show a <span className="font-medium text-yellow-400">Temporary</span> badge while active; the badge turns warning-colored in the last 24h</li>
              </ul>
              <p className="text-sm leading-relaxed text-muted-foreground">Their permanent role stays in place.</p>
            </div>
          </section>

          {/* Services */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Services</h2>

            <p className="text-sm leading-relaxed">Services are the offerings your staff sell — drinks, dances, lap dances, etc. They appear as selectable items when staff log a sale in the plugin or website.</p>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Creating Services</h3>
              <ol className="list-decimal list-inside space-y-1.5 pl-2 text-sm leading-relaxed">
                <li>Go to Services and click &quot;Add Service&quot;</li>
                <li>Set a name, optional description, and default price</li>
                <li>Assign to one or more custom roles (optional) &mdash; staff only see services linked to their role(s), keeping the plugin clean</li>
                <li>Toggle active/inactive to hide services without deleting them</li>
              </ol>
            </div>
          </section>

          {/* Event Management */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Event Management</h2>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Creating Events</h3>
              <p className="text-sm leading-relaxed">Go to Events &gt; Create. Set title, type (Performance, Game Night, Social, etc.), start/end time, and description. Events start as Draft, move to Published (visible to staff), then Active (running).</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Event Templates</h3>
              <p className="text-sm leading-relaxed">For recurring events, create templates that save the title, type, description, and default times. Create new events from a template.</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Partake.gg Integration</h3>
              <p className="text-sm leading-relaxed">If your venue uses <a href="https://partake.gg" target="_blank" rel="noopener noreferrer" className="text-[var(--xiv-blue)] underline underline-offset-2 hover:opacity-80">Partake.gg</a> for event listings, you can automatically sync those events into XIV Venue Manager:</p>
              <ol className="list-decimal list-inside space-y-1.5 pl-2 text-sm leading-relaxed">
                <li>Go to Settings for your venue</li>
                <li>In the Integrations section, find <span className="font-medium">Partake.gg Event Sync</span></li>
                <li>Enter your Partake Team ID (found in your Partake team URL, e.g. <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">partake.gg/team/123</code>)</li>
                <li>Click <span className="font-medium">Save Settings</span>, then <span className="font-medium">Sync Now</span> to pull events immediately</li>
              </ol>
              <p className="text-sm leading-relaxed text-muted-foreground">Once linked, events sync every hour. Synced events show a <span className="font-medium text-[var(--xiv-blue)]">Partake</span> badge on the events list and detail pages. XIV Venue Manager creates new events and updates existing ones if the title or times change on Partake.</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Live Mode</h3>
              <p className="text-sm leading-relaxed">When an event is Active, the <span className="font-medium">Live</span> page shows real-time stats:</p>
              <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm text-muted-foreground">
                <li>Live patron count</li>
                <li>Running sale count and revenue total</li>
                <li>Live activity feed (every sale and patron movement appears instantly)</li>
                <li>Event duration timer</li>
              </ul>
              <p className="text-sm leading-relaxed text-muted-foreground">Powered by Server-Sent Events. No refresh needed.</p>
            </div>
          </section>

          {/* Shift Scheduling */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Shift Scheduling</h2>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Creating Shifts</h3>
              <ol className="list-decimal list-inside space-y-1.5 pl-2 text-sm leading-relaxed">
                <li>Go to Shifts and click &quot;Schedule Shift&quot;</li>
                <li>Select a staff member, date, start time, and end time</li>
                <li>All times are in <span className="font-medium">Server Time (ST)</span></li>
              </ol>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">How Shifts Work</h3>
              <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
                <li>Staff see their shifts on their dashboard and in the plugin</li>
                <li>Staff can Clock In up to 30 minutes before their shift starts</li>
                <li>Clock Out calculates hours worked automatically</li>
                <li>Statuses: Scheduled, Active, Completed, Missed, Cancelled</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Quick Commands</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                  <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm start</code>
                  <p className="text-xs text-muted-foreground mt-1">Clock into your current shift</p>
                </div>
                <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                  <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm end</code>
                  <p className="text-xs text-muted-foreground mt-1">Clock out of your active shift</p>
                </div>
              </div>
            </div>
          </section>

          {/* Sales & Revenue */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Sales &amp; Revenue</h2>

            <p className="text-sm leading-relaxed">Sales come from two places: the <span className="font-medium">plugin</span> (<code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm sale</code> commands or Sales tab) and the <span className="font-medium">website</span> (Sales page). Both create identical records with amount, customer, service, event, and staff attribution.</p>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Plugin Commands</h3>
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
              <h3 className="text-base font-semibold text-foreground/80">Timeline</h3>
              <p className="text-sm leading-relaxed">The Timeline merges all sales and patron activity into a single feed with real-time updates. Filter by Sales or Patrons. New entries appear at the top without refreshing.</p>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground/80">Analytics</h3>
              <p className="text-sm leading-relaxed">The Analytics page shows revenue over time, average transactions, top services, patron trends, and per-event performance with profit margins.</p>
            </div>
          </section>

          {/* Payroll */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Payroll</h2>

            <p className="text-sm leading-relaxed">The Payroll page calculates staff compensation based on completed shift hours. Managers and Owners see a breakdown of each staff member&apos;s hours worked and recommended payment amounts rounded to the nearest whole number.</p>

            <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
              <li>Set an hourly rate for your venue</li>
              <li>View total hours worked per staff member</li>
              <li>See calculated payment amounts based on shift records</li>
              <li>Add manual payroll entries with notes</li>
            </ul>
          </section>

          {/* Tasks */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Tasks</h2>

            <p className="text-sm leading-relaxed">Tasks let you assign and track to-dos for your team &mdash; prep items before an event, follow-ups, recurring duties, etc.</p>

            <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
              <li>Create tasks from the Tasks page; optionally assign to a staff member and set a due date</li>
              <li>Staff can view and complete their assigned tasks</li>
              <li><span className="font-medium">Task Visibility</span> (in Settings): <span className="font-medium">All</span> shows every task to all staff; <span className="font-medium">Assigned only</span> shows staff only the tasks assigned to them; <span className="font-medium">Assigned + unassigned</span> shows their tasks plus tasks with no assignee</li>
            </ul>
          </section>

          {/* Patron Logs */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Patron Logs</h2>

            <p className="text-sm leading-relaxed">The Patron Logs page (Owners and Managers only) gives you a full historical view of every patron visit. Filter by:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm text-muted-foreground">
              <li><span className="font-medium text-foreground">Event</span> &mdash; see all visits for a specific event</li>
              <li><span className="font-medium text-foreground">Date range</span> &mdash; defaults to the last 7 days</li>
              <li><span className="font-medium text-foreground">Character name</span> &mdash; look up a specific visitor</li>
              <li><span className="font-medium text-foreground">Classification</span> &mdash; patron, staff, or all (the plugin separates staff on active shifts from patrons)</li>
            </ul>
          </section>

          {/* Discord Webhooks */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Discord Webhooks</h2>

            <p className="text-sm leading-relaxed">Set up webhooks in Settings to auto-post to Discord:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
              <li>Sale Logged, Daily Sales Summary</li>
              <li>Task Created/Completed, Staff Joined</li>
              <li>Partake Event Mirror: auto-posts your Partake events to Discord (with flyer images) within 7 days of the start date, and updates the post for edits and cancellations</li>
            </ul>
            <p className="text-sm leading-relaxed text-muted-foreground">Route different types to different channels (e.g., revenue to a private channel, events to a public one). The Partake Event Mirror requires your venue to have a linked Partake team in Settings.</p>
          </section>

          {/* Server Time */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Server Time (ST)</h2>

            <p className="text-sm leading-relaxed">All times are displayed in <span className="font-medium">Server Time (ST)</span>:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
              <li>NA (Aether, Primal, Crystal, Dynamis): Eastern Time</li>
              <li>EU (Chaos, Light): UTC</li>
              <li>JP (Elemental, Gaia, Mana, Meteor): JST</li>
              <li>OCE (Materia): AEST</li>
            </ul>
          </section>

          {/* Tips */}
          <section className="space-y-6">
            <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Tips</h2>

            <ul className="space-y-2.5 pl-2 text-sm leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Use <span className="font-medium">Live Mode</span> during events to watch patron flow and revenue.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Set up Discord webhooks early for automatic community updates</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Use <span className="font-medium">Event Templates</span> for recurring events</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Review <span className="font-medium">Analytics</span> weekly to spot trends</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Set <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">salesVisibility</code> to <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">own</code> if you want staff to only see their own performance</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">&#10003;</span>
                <span>Link your <span className="font-medium">Partake.gg</span> team in Settings to import events without creating them manually.</span>
              </li>
            </ul>
          </section>
        </article>
      </div>
    </div>
  )
}
