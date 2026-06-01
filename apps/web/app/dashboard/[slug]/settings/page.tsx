"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { PageLoading } from "@/components/ui/loading-spinner"
import type { VenueSettings } from "@xiv-venue-manager/types"


export default function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const router = useRouter()
  const [slug, setSlug] = useState<string>("")
  const [settings, setSettings] = useState<VenueSettings>({
    taskVisibility: "all",
    salesVisibility: "all",
    revenueVisibility: "all",
    eventVisibility: "all",
    discordWebhookUrl: "",
    webhooks: {
      taskCreated: false,
      taskCompleted: false,
      partakeEvent: false,
      saleLogged: false,
      dailySalesSummary: false,
      staffJoined: false,
    },
    discordWebhooks: {
      staff: "",
      events: "",
      revenue: "",
    },
    partakeTeamId: null,
    discoverySources: {},
  })
  // Venue profile DB fields (saved separately)
  const [venueName, setVenueName] = useState("")
  const [venueDescription, setVenueDescription] = useState("")
  const [venueLocation, setVenueLocation] = useState("")
  const [tagInput, setTagInput] = useState("")

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState("")
  const [venueId, setVenueId] = useState<string>("")
  const [userRole, setUserRole] = useState<string>("")

  // Unwrap params
  useEffect(() => {
    params.then((p) => setSlug(p.slug))
  }, [params])

  // Fetch settings
  useEffect(() => {
    if (!slug) return

    const fetchSettings = async () => {
      try {
        setIsLoading(true)
        setError("")

        // Get venue ID
        const venueResponse = await fetch(`/api/venues?slug=${slug}`)
        if (!venueResponse.ok) throw new Error("Failed to fetch venue")

        const venues = await venueResponse.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)
        if (!venue) throw new Error("Venue not found")

        // Set venue profile DB fields
        setVenueId(venue.id)
        setVenueName(venue.name ?? "")
        setVenueDescription(venue.description ?? "")
        setVenueLocation(venue.location ?? "")
        if (venue.memberships?.[0]) {
          setUserRole(venue.memberships[0].role)
        }

        // Get settings
        const settingsResponse = await fetch(`/api/venues/${venue.id}/settings`)
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json()
          setSettings({
            ...settingsData,
            // Ensure discordWebhookUrl is never null
            discordWebhookUrl: settingsData.discordWebhookUrl || "",
            // Ensure webhooks object exists with defaults
            webhooks: settingsData.webhooks || {
              taskCreated: false,
              taskCompleted: false,
              partakeEvent: false,
              saleLogged: false,
              dailySalesSummary: false,
              staffJoined: false,
            },
            // Ensure discordWebhooks object exists with defaults
            discordWebhooks: settingsData.discordWebhooks || {
              staff: "",
              events: "",
              revenue: "",
            },
            partakeTeamId: settingsData.partakeTeamId ?? null,
            discoverySources: settingsData.discoverySources ?? {},
          })
        }
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "Failed to load settings")
      } finally {
        setIsLoading(false)
      }
    }

    fetchSettings()
  }, [slug])

  const handleSave = async () => {
    setIsSaving(true)
    setError("")
    setSuccess(false)

    try {
      if (!venueId) throw new Error("Venue not loaded")

      // Save venue profile DB fields (name, description, location) via PATCH
      const profileRes = await fetch(`/api/venues/${venueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: venueName.trim() || undefined,
          description: venueDescription || null,
          location: venueLocation || null,
        }),
      })
      if (!profileRes.ok) {
        const d = await profileRes.json()
        throw new Error(d.error || "Failed to save venue profile")
      }

      // Save settings JSON (tagline, tags, hours, permissions, webhooks etc.)
      const settingsRes = await fetch(`/api/venues/${venueId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!settingsRes.ok) {
        const d = await settingsRes.json()
        throw new Error(d.error || "Failed to save settings")
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to save settings")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteVenue = async () => {
    setIsDeleting(true)
    setError("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete venue")
      }

      // Redirect to dashboard
      router.push("/dashboard")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to delete venue")
      setIsDeleting(false)
    }
  }

  if (!slug) {
    return <div className="container mx-auto p-8"><PageLoading /></div>
  }

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner max-w-3xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 md:mb-8">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="page-h1">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your venue profile, integrations and permissions</p>
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="self-start shrink-0">
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>

        {/* Alerts */}
        {success && (
          <Alert className="mb-4 bg-emerald-500/10 border-emerald-500/20">
            <AlertDescription className="text-emerald-400">Settings saved.</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert className="mb-4 bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <PageLoading text="Loading settings…" />
        ) : (
          <div className="space-y-4">

            {/* ── Venue profile ── */}
            <section className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-[0.95rem]">
                <svg className="w-4 h-4 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                Venue profile
              </div>
              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="venue-name">Venue name</Label>
                    <Input id="venue-name" value={venueName} onChange={e => setVenueName(e.target.value)} disabled={isSaving}
                      className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tagline">Tagline</Label>
                    <Input id="tagline" placeholder="e.g. A dockside tavern for wayward souls"
                      value={settings.tagline ?? ""} onChange={e => setSettings({ ...settings, tagline: e.target.value })}
                      disabled={isSaving} className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2 p-2 rounded-lg border border-[var(--blue-015)] bg-background min-h-[42px] items-center">
                    {(settings.tags ?? []).map((tag: string) => (
                      <span key={tag} className="inline-flex items-center gap-1.5 text-[0.72rem] font-medium px-2.5 py-1 rounded-full bg-[var(--blue-010)] text-[var(--xiv-blue)] border border-[var(--blue-020)]">
                        {tag}
                        <button type="button" onClick={() => setSettings({ ...settings, tags: (settings.tags ?? []).filter((t: string) => t !== tag) })}
                          className="hover:text-destructive transition-colors text-[var(--fg-faint)]">
                          <svg className="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </span>
                    ))}
                    <input
                      placeholder="Add tag…"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                          e.preventDefault()
                          const newTag = tagInput.trim().replace(/,$/, "")
                          if (newTag && !(settings.tags ?? []).includes(newTag)) {
                            setSettings({ ...settings, tags: [...(settings.tags ?? []), newTag] })
                          }
                          setTagInput("")
                        }
                        if (e.key === "Backspace" && !tagInput && (settings.tags ?? []).length) {
                          setSettings({ ...settings, tags: (settings.tags ?? []).slice(0, -1) })
                        }
                      }}
                      disabled={isSaving}
                      className="flex-1 min-w-[80px] bg-transparent outline-none text-sm placeholder:text-[var(--fg-faint)]"
                    />
                  </div>
                  <p className="text-[0.68rem] text-[var(--fg-faint)]">Press Enter or comma to add. e.g. 18+, Bar, RP, Live Music</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="venue-desc">Description</Label>
                  <textarea id="venue-desc" rows={3}
                    placeholder="Tell patrons what makes your venue special…"
                    value={venueDescription}
                    onChange={e => setVenueDescription(e.target.value)}
                    disabled={isSaving}
                    className="w-full text-sm bg-background border border-[var(--blue-015)] focus:border-[var(--blue-035)] rounded-lg px-3 py-2 outline-none resize-y text-foreground placeholder:text-[var(--fg-faint)] transition-colors"
                  />
                </div>
              </div>
            </section>

            {/* ── Location & hours ── */}
            <section className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-[0.95rem]">
                <svg className="w-4 h-4 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                Location &amp; hours
              </div>
              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="venue-location">Ward &amp; Plot</Label>
                    <Input id="venue-location" placeholder="e.g. Goblet · W5 P31"
                      value={venueLocation} onChange={e => setVenueLocation(e.target.value)}
                      disabled={isSaving} className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data Centre &amp; World</Label>
                    <Input value={`${venueDescription ? "" : ""}${slug}`} disabled
                      className="bg-background border-[var(--blue-015)] opacity-50 cursor-not-allowed text-[var(--fg-faint)] font-mono text-sm"
                      placeholder="Set during venue creation" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="default-hours">Default hours (ST)</Label>
                    <Input id="default-hours" placeholder="e.g. 10PM–2AM"
                      value={settings.defaultHours ?? ""} onChange={e => setSettings({ ...settings, defaultHours: e.target.value })}
                      disabled={isSaving} className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="open-nights">Open nights</Label>
                    <Input id="open-nights" placeholder="e.g. Fri & Sat"
                      value={settings.openNights ?? ""} onChange={e => setSettings({ ...settings, openNights: e.target.value })}
                      disabled={isSaving} className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)]" />
                  </div>
                </div>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium">Adult (18+) venue</p>
                    <p className="text-xs text-[var(--fg-faint)]">Show the 18+ badge on your public listing.</p>
                  </div>
                  <button type="button"
                    onClick={() => setSettings({ ...settings, isAdult: !settings.isAdult })}
                    disabled={isSaving}
                    className={`relative w-[38px] h-[22px] rounded-full border transition-all duration-200 flex-shrink-0 ${
                      settings.isAdult ? "bg-[var(--xiv-blue)] border-[var(--xiv-blue)]" : "bg-[var(--blue-010)] border-[var(--blue-020)]"
                    }`}>
                    <span className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full transition-all duration-200 ${
                      settings.isAdult ? "translate-x-4 bg-[var(--xiv-navy)]" : "bg-[var(--fg-faint)]"
                    }`} />
                  </button>
                </div>
              </div>
            </section>

            {/* ── Integrations ── */}
            <section className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-[0.95rem]">
                <svg className="w-4 h-4 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Integrations
              </div>

              {/* Dalamud */}
              <div className="introw">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="2" width="12" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Dalamud Plugin</p>
                  <p className="text-xs text-muted-foreground mt-0.5">In-game sales, clock-in and patron capture</p>
                </div>
                <Link
                  href={`/dashboard/${slug}/settings/api-keys`}
                  className="text-xs font-semibold text-[var(--xiv-blue)] hover:underline shrink-0"
                >
                  Manage API Keys →
                </Link>
              </div>

              {/* Partake */}
              <div className="px-5 py-4 border-b border-[var(--blue-008)]">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--blue-010)] border border-[var(--blue-018)] flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Partake.gg</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Publish events to the community calendar</p>
                  </div>
                  {settings.partakeTeamId && (
                    <span className="text-[0.7rem] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                      Connected
                    </span>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    placeholder="Partake team ID (e.g. 123)"
                    value={settings.partakeTeamId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value
                      setSettings({ ...settings, partakeTeamId: val ? parseInt(val, 10) : null })
                    }}
                    disabled={isSaving}
                    min={1}
                    className="flex-1 bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)] text-sm h-9"
                  />
                  {settings.partakeTeamId && (
                    <Button variant="outline" size="sm" disabled={isSyncing} onClick={async () => {
                      setIsSyncing(true); setSyncResult("")
                      try {
                        const res = await fetch(`/api/venues/${venueId}/sync-partake`, { method: "POST" })
                        if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Sync failed") }
                        const d = await res.json()
                        setSyncResult(`Synced: ${d.results.created} new, ${d.results.updated} updated`)
                        setTimeout(() => setSyncResult(""), 5000)
                      } catch (err: unknown) {
                        setSyncResult(err instanceof Error ? err.message : "Sync failed")
                      } finally { setIsSyncing(false) }
                    }}>
                      {isSyncing ? "Syncing…" : "Sync now"}
                    </Button>
                  )}
                </div>
                {syncResult && <p className="text-xs text-emerald-400 mt-2">{syncResult}</p>}
                {settings.partakeTeamId && <p className="text-xs text-[var(--fg-faint)] mt-1.5">Syncs automatically every hour.</p>}
              </div>

              {/* Discord */}
              <div className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-10 h-10 rounded-lg bg-[var(--blue-010)] border border-[var(--blue-018)] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Discord</p>
                  <p className="text-xs text-muted-foreground mt-0.5">OAuth sign-in and event webhooks</p>
                </div>
                <span className="text-[0.7rem] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  Connected
                </span>
              </div>
            </section>

            {/* ── Discord Webhooks ── */}
            <section className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-[0.95rem]">
                <svg className="w-4 h-4 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                Discord Webhooks
              </div>
              <div className="p-5 space-y-5">
                <p className="text-xs text-[var(--fg-faint)]">
                  Server Settings → Integrations → Webhooks → New Webhook. Paste the URL below.
                </p>
                {[
                  {
                    id: "webhook-staff", label: "Staff operations", desc: "Task and staff notifications",
                    value: settings.discordWebhooks.staff,
                    onChange: (v: string) => setSettings({ ...settings, discordWebhooks: { ...settings.discordWebhooks, staff: v } }),
                    checks: [
                      { id: "task-created",  label: "Task created",  val: settings.webhooks.taskCreated,  set: (v: boolean) => setSettings({ ...settings, webhooks: { ...settings.webhooks, taskCreated: v } }),  disabled: false },
                      { id: "task-done",     label: "Task completed", val: settings.webhooks.taskCompleted, set: (v: boolean) => setSettings({ ...settings, webhooks: { ...settings.webhooks, taskCompleted: v } }), disabled: false },
                      { id: "staff-joined", label: "Staff joined",   val: settings.webhooks.staffJoined,  set: (v: boolean) => setSettings({ ...settings, webhooks: { ...settings.webhooks, staffJoined: v } }),  disabled: false },
                    ],
                  },
                  {
                    id: "webhook-events", label: "Events channel", desc: "Event announcements and Partake mirrors",
                    value: settings.discordWebhooks.events,
                    onChange: (v: string) => setSettings({ ...settings, discordWebhooks: { ...settings.discordWebhooks, events: v } }),
                    checks: [
                      { id: "partake-mirror", label: "Partake event mirror", val: settings.webhooks.partakeEvent, set: (v: boolean) => setSettings({ ...settings, webhooks: { ...settings.webhooks, partakeEvent: v } }), disabled: !settings.partakeTeamId },
                    ],
                  },
                  {
                    id: "webhook-revenue", label: "Revenue channel", desc: "Sales and daily summaries",
                    value: settings.discordWebhooks.revenue,
                    onChange: (v: string) => setSettings({ ...settings, discordWebhooks: { ...settings.discordWebhooks, revenue: v } }),
                    checks: [
                      { id: "sale-logged",   label: "Sale logged",        val: settings.webhooks.saleLogged,       set: (v: boolean) => setSettings({ ...settings, webhooks: { ...settings.webhooks, saleLogged: v } }),       disabled: false },
                      { id: "daily-summary", label: "Daily sales summary", val: settings.webhooks.dailySalesSummary, set: (v: boolean) => setSettings({ ...settings, webhooks: { ...settings.webhooks, dailySalesSummary: v } }), disabled: false },
                    ],
                  },
                ].map((wh) => (
                  <div key={wh.id}>
                    <Label htmlFor={wh.id} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      {wh.label}
                    </Label>
                    <Input
                      id={wh.id}
                      type="url"
                      placeholder="https://discord.com/api/webhooks/…"
                      value={wh.value}
                      onChange={(e) => wh.onChange(e.target.value)}
                      disabled={isSaving}
                      className="bg-background border-[var(--blue-015)] focus:border-[var(--blue-035)] text-sm h-9 mb-1"
                    />
                    <p className="text-xs text-[var(--fg-faint)] mb-2">{wh.desc}</p>
                    {wh.value && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-2 border-l-2 border-[var(--blue-015)]">
                        {wh.checks.map((c) => (
                          <label key={c.id} className={`flex items-center gap-2 text-xs cursor-pointer ${c.disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
                            <Checkbox
                              checked={c.val}
                              onCheckedChange={(v) => c.set(v as boolean)}
                              disabled={isSaving || c.disabled}
                              className="w-3.5 h-3.5"
                            />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ── How patrons find you ── */}
            <section className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-[0.95rem]">
                <svg className="w-4 h-4 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                How patrons find you
                <span className="ml-auto text-xs text-[var(--fg-faint)] font-normal">Shown in Analytics</span>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Estimate how patrons typically discover your venue. These percentages appear in your Analytics dashboard.
                  They don&apos;t need to add up to 100%.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: "partake",     label: "Partake.gg listing",  placeholder: "e.g. 50" },
                    { key: "shout",       label: "In-game /shout",      placeholder: "e.g. 25" },
                    { key: "discord",     label: "Discord",             placeholder: "e.g. 15" },
                    { key: "wordOfMouth", label: "Word of mouth",       placeholder: "e.g. 10" },
                    { key: "other",       label: "Other",               placeholder: "e.g. 0"  },
                  ].map(({ key, label, placeholder }) => {
                    const val = (settings.discoverySources as Record<string, number | undefined> | undefined)?.[key] ?? ""
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <Label className="flex-1 text-sm">{label}</Label>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            placeholder={placeholder}
                            value={val}
                            onChange={(e) => {
                              const num = e.target.value === "" ? undefined : Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0))
                              setSettings({
                                ...settings,
                                discoverySources: {
                                  ...settings.discoverySources,
                                  [key]: num,
                                },
                              })
                            }}
                            disabled={isSaving}
                            className="w-20 h-8 text-sm bg-background border-[var(--blue-015)] text-right"
                          />
                          <span className="text-xs text-muted-foreground w-4">%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>

            {/* ── Staff permissions ── */}
            <section className="rounded-xl border border-[var(--blue-018)] bg-card overflow-hidden">
              <div className="flex items-center gap-2.5 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-[0.95rem]">
                <svg className="w-4 h-4 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Staff permissions
              </div>
              <p className="px-5 pt-3 text-xs text-[var(--fg-faint)]">Owners and managers always have full access. These settings apply to staff only.</p>
              <div className="divide-y divide-[var(--blue-008)] mt-3">
                {[
                  {
                    id: "task-vis", label: "Tasks", desc: "Which tasks staff can see",
                    value: settings.taskVisibility,
                    onChange: (v: string) => setSettings({ ...settings, taskVisibility: v as "all" | "assigned" | "assigned_unassigned" }),
                    options: [
                      { value: "all", label: "All tasks" },
                      { value: "assigned", label: "Assigned only" },
                      { value: "assigned_unassigned", label: "Assigned + unassigned" },
                    ],
                  },
                  {
                    id: "sales-vis", label: "Sales", desc: "Which transactions staff can see",
                    value: settings.salesVisibility,
                    onChange: (v: string) => setSettings({ ...settings, salesVisibility: v as "all" | "own" | "none" }),
                    options: [
                      { value: "all", label: "All transactions" },
                      { value: "own", label: "Their own only" },
                      { value: "none", label: "No access" },
                    ],
                  },
                  {
                    id: "rev-vis", label: "Revenue", desc: "Revenue statistics visibility",
                    value: settings.revenueVisibility,
                    onChange: (v: string) => setSettings({ ...settings, revenueVisibility: v as "all" | "hide" | "own" }),
                    options: [
                      { value: "all", label: "All statistics" },
                      { value: "own", label: "Personal only" },
                      { value: "hide", label: "Hidden" },
                    ],
                  },
                  {
                    id: "event-vis", label: "Events", desc: "Which events staff can see",
                    value: settings.eventVisibility,
                    onChange: (v: string) => setSettings({ ...settings, eventVisibility: v as "all" | "published" }),
                    options: [
                      { value: "all", label: "All (including drafts)" },
                      { value: "published", label: "Published only" },
                    ],
                  },
                ].map((row) => (
                  <div key={row.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="text-xs text-[var(--fg-faint)]">{row.desc}</p>
                    </div>
                    <Select value={row.value} onValueChange={row.onChange} disabled={isSaving}>
                      <SelectTrigger className="w-[180px] h-8 text-xs bg-background border-[var(--blue-015)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {row.options.map((o) => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Danger zone ── */}
            {userRole === "OWNER" && (
              <section className="rounded-xl border border-[rgba(243,139,168,0.3)] bg-card overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[rgba(243,139,168,0.18)] font-semibold text-[0.95rem] text-[var(--destructive)]">
                  <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01"/></svg>
                  Danger zone
                </div>
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Delete venue</p>
                    <p className="text-xs text-[var(--fg-faint)] mt-0.5">Permanently removes the venue and all associated data. Cannot be undone.</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={isDeleting}>
                        {isDeleting ? "Deleting…" : "Delete venue"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this venue?</AlertDialogTitle>
                        <AlertDialogDescription>
                          All events, staff, tasks, sales and settings will be permanently removed. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteVenue} className="bg-destructive text-white hover:bg-destructive/90">
                          Yes, delete permanently
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </VenueLayoutClient>
  )
}
