import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function OwnerManagerGuidePage() {
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
          <h1 className="font-cinzel text-4xl font-bold tracking-wide xiv-glow-text mb-3">Owner &amp; Manager Guide</h1>
          <p className="text-lg text-muted-foreground mb-6">Setup and management reference for XIV Venue Manager.</p>
          {/* Audience role switcher — matches prototype */}
          <div className="flex gap-1 bg-[rgba(7,11,20,0.6)] border border-[var(--blue-015)] rounded-full p-1 w-fit">
            <span className="text-sm font-semibold px-4 py-1.5 rounded-full bg-[var(--xiv-blue)] text-[var(--xiv-navy)]">
              Owners &amp; managers
            </span>
            <Link href="/guide/staff" className="text-sm font-semibold px-4 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] transition-colors">
              Staff
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10 items-start">

          {/* Sticky TOC sidebar */}
          <aside className="hidden lg:block sticky top-20">
            <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--blue-008)] font-semibold text-sm">
                <svg className="w-3.5 h-3.5 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                On this page
              </div>
              <nav className="py-1">
                {[
                  { id: "setup",       label: "Initial Setup" },
                  { id: "staff",       label: "Managing Staff" },
                  { id: "services",    label: "Services" },
                  { id: "events",      label: "Event Management" },
                  { id: "shifts",      label: "Shift Scheduling" },
                  { id: "sales",       label: "Sales & Revenue" },
                  { id: "payroll",     label: "Payroll" },
                  { id: "tasks",       label: "Tasks" },
                  { id: "auto-greeter",label: "Auto-Greeter" },
                  { id: "patron-logs", label: "Patron Logs" },
                  { id: "webhooks",    label: "Discord Webhooks" },
                  { id: "server-time", label: "Server Time" },
                  { id: "tips",        label: "Tips" },
                ].map(({ id, label }) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="flex items-center gap-2 px-4 py-2 text-[0.8rem] text-muted-foreground hover:text-[var(--xiv-blue)] hover:bg-[var(--blue-007)] transition-colors"
                  >
                    <span className="w-1 h-1 rounded-full bg-[var(--blue-035)] flex-shrink-0" />
                    {label}
                  </a>
                ))}
              </nav>
              <div className="border-t border-[var(--blue-008)] p-3">
                <Link href="/guide/staff" className="flex items-center gap-2 text-[0.78rem] text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors">
                  <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  Staff guide →
                </Link>
              </div>
            </div>
          </aside>

          <article className="space-y-8 min-w-0">
          <header className="sr-only">
            <h1>Owner &amp; Manager Guide</h1>
          </header>

          {/* What's New */}
          <div className="bg-[rgba(0,180,255,0.06)] border border-[rgba(0,180,255,0.2)] rounded-lg p-4 space-y-1.5">
            <p className="text-xs font-semibold text-[var(--xiv-blue)] uppercase tracking-widest">Recent Updates</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><span className="font-medium text-foreground">Website redesign</span> &mdash; The dashboard and all pages have a new look. Navigation, cards, and layout have been updated.</li>
              <li><span className="font-medium text-foreground">Plugin UI redesign (v3.8.0)</span> &mdash; The plugin has a new XIV blue design to match the website, including a changelog window that opens automatically after updates.</li>
              <li><span className="font-medium text-foreground">Slash commands renamed</span> &mdash; <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/vm</code> is now <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvm</code> and <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/venue</code> is now <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/xvenue</code>. Update any macros your team uses.</li>
              <li><span className="font-medium text-foreground">Auto-greeter (v3.7.0)</span> &mdash; The plugin can now automatically send a <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/tell</code> to patrons when they enter your venue. Configure in plugin Settings.</li>
            </ul>
          </div>

          {/* Initial Setup */}
          <section className="space-y-6">
            <h2 id="setup" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Initial Setup</h2>

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
            <h2 id="staff" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Managing Staff</h2>

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
            <h2 id="services" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Services</h2>

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
            <h2 id="events" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Event Management</h2>

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
            <h2 id="shifts" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Shift Scheduling</h2>

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
            <h2 id="sales" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Sales &amp; Revenue</h2>

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
            <h2 id="payroll" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Payroll</h2>

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
            <h2 id="tasks" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Tasks</h2>

            <p className="text-sm leading-relaxed">Tasks let you assign and track to-dos for your team &mdash; prep items before an event, follow-ups, recurring duties, etc.</p>

            <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
              <li>Create tasks from the Tasks page; optionally assign to a staff member and set a due date</li>
              <li>Staff can view and complete their assigned tasks</li>
              <li><span className="font-medium">Task Visibility</span> (in Settings): <span className="font-medium">All</span> shows every task to all staff; <span className="font-medium">Assigned only</span> shows staff only the tasks assigned to them; <span className="font-medium">Assigned + unassigned</span> shows their tasks plus tasks with no assignee</li>
            </ul>
          </section>

          {/* Auto-Greeter */}
          <section className="space-y-6">
            <h2 id="auto-greeter" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Auto-Greeter</h2>

            <p className="text-sm leading-relaxed">The plugin can automatically send a <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">/tell</code> to patrons when they enter your venue&apos;s housing plot.</p>

            <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
              <li>Enable and configure the message in plugin <span className="font-medium">Settings</span></li>
              <li>Only fires for patrons &mdash; staff on active shifts are not greeted</li>
              <li>Works alongside patron tracking; the plugin must be running</li>
            </ul>
          </section>

          {/* Patron Logs */}
          <section className="space-y-6">
            <h2 id="patron-logs" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Patron Logs</h2>

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
            <h2 id="webhooks" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Discord Webhooks</h2>

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
            <h2 id="server-time" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Server Time (ST)</h2>

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
            <h2 id="tips" className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">Tips</h2>

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
    </div>
  )
}
