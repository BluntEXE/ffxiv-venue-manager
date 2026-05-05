"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { Breadcrumb } from "@/components/breadcrumb"
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
  })
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

        // Get user's role for this venue
        setVenueId(venue.id)
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
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save settings")
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
      <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-4xl">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Venue", href: `/dashboard/${slug}` },
            { label: "Settings" },
          ]}
        />

        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">Venue Settings</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
            Control what your staff can see and access
          </p>
        </div>

        {/* Sub-pages */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Manage external connections for this venue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Link
                href={`/dashboard/${slug}/settings/api-keys`}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                Dalamud Plugin API Keys &rarr;
              </Link>
              <p className="text-xs text-muted-foreground mt-1">
                Generate keys so the XIV-App Dalamud plugin can sync patron visits.
              </p>
            </div>

            {/* Partake Integration */}
            <div className="border rounded-lg p-4 bg-gradient-to-r from-indigo-500/10 to-transparent">
              <Label htmlFor="partake-team-id" className="text-base font-semibold flex items-center gap-2">
                Partake.gg Event Sync
              </Label>
              <p className="text-sm text-muted-foreground mt-1 mb-3">
                Link your Partake team to automatically sync events. Find your Team ID on your{" "}
                <a href="https://partake.gg" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Partake.gg
                </a>{" "}
                team dashboard URL (e.g. partake.gg/team/<strong>123</strong>).
              </p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    id="partake-team-id"
                    type="number"
                    placeholder="e.g. 123"
                    value={settings.partakeTeamId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value
                      setSettings({
                        ...settings,
                        partakeTeamId: val ? parseInt(val, 10) : null,
                      })
                    }}
                    disabled={isSaving}
                    min={1}
                  />
                </div>
                {settings.partakeTeamId && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSyncing}
                    onClick={async () => {
                      setIsSyncing(true)
                      setSyncResult("")
                      try {
                        const res = await fetch(`/api/venues/${venueId}/sync-partake`, {
                          method: "POST",
                        })
                        if (!res.ok) {
                          const data = await res.json()
                          throw new Error(data.error || "Sync failed")
                        }
                        const data = await res.json()
                        setSyncResult(`Synced: ${data.results.created} new, ${data.results.updated} updated, ${data.results.skipped} unchanged`)
                        setTimeout(() => setSyncResult(""), 5000)
                      } catch (err: unknown) {
                        setSyncResult(err instanceof Error ? err.message : "Sync failed")
                      } finally {
                        setIsSyncing(false)
                      }
                    }}
                  >
                    {isSyncing ? "Syncing..." : "Sync Now"}
                  </Button>
                )}
              </div>
              {syncResult && (
                <p className="text-sm text-emerald-400 mt-2">{syncResult}</p>
              )}
              {settings.partakeTeamId && (
                <p className="text-xs text-muted-foreground mt-2">
                  Events sync automatically every hour. Use &quot;Sync Now&quot; to pull events immediately.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Success Message */}
        {success && (
          <Alert className="mb-6 bg-emerald-500/10 border-green-500/20">
            <AlertDescription className="text-emerald-400">
              Settings saved successfully!
            </AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive-foreground">{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <PageLoading text="Loading settings..." />
        ) : (
          <div className="space-y-6">
            {/* Task Visibility Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Task Visibility</CardTitle>
                <CardDescription>
                  Control which tasks staff members can see
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="task-visibility">Staff can see:</Label>
                  <Select
                    value={settings.taskVisibility}
                    onValueChange={(value: string) =>
                      setSettings({ ...settings, taskVisibility: value as "all" | "assigned" | "assigned_unassigned" })
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger id="task-visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        All Tasks (Full Transparency)
                      </SelectItem>
                      <SelectItem value="assigned">
                        Only Assigned Tasks (Privacy Mode)
                      </SelectItem>
                      <SelectItem value="assigned_unassigned">
                        Assigned + Unassigned Tasks (Hybrid)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-sm text-muted-foreground mt-2">
                    {settings.taskVisibility === "all" && (
                      <p>
                        ✅ <strong>Full Transparency:</strong> All staff can see all tasks,
                        promoting teamwork and awareness of venue operations.
                      </p>
                    )}
                    {settings.taskVisibility === "assigned" && (
                      <p>
                        🔒 <strong>Privacy Mode:</strong> Staff only see tasks assigned
                        to them. Good for focused work and privacy.
                      </p>
                    )}
                    {settings.taskVisibility === "assigned_unassigned" && (
                      <p>
                        ⚖️ <strong>Hybrid Mode:</strong> Staff see their tasks plus
                        unassigned tasks they can claim. Balanced approach.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sales Visibility Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Sales Data Visibility</CardTitle>
                <CardDescription>
                  Control which sales transactions staff can see
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sales-visibility">Staff can see:</Label>
                  <Select
                    value={settings.salesVisibility}
                    onValueChange={(value: string) =>
                      setSettings({ ...settings, salesVisibility: value as "all" | "own" | "none" })
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger id="sales-visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Transactions</SelectItem>
                      <SelectItem value="own">Their Own Transactions Only</SelectItem>
                      <SelectItem value="none">No Access to Sales Page</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-sm text-muted-foreground mt-2">
                    {settings.salesVisibility === "all" && (
                      <p>
                        ✅ <strong>Full Access:</strong> Staff can see all sales
                        transactions. Good for team accountability.
                      </p>
                    )}
                    {settings.salesVisibility === "own" && (
                      <p>
                        🔒 <strong>Own Only:</strong> Staff only see sales they
                        logged. Good for commission tracking.
                      </p>
                    )}
                    {settings.salesVisibility === "none" && (
                      <p>
                        ❌ <strong>No Access:</strong> Staff cannot access the sales
                        page at all. Managers only.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Visibility Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Visibility</CardTitle>
                <CardDescription>
                  Control whether staff can see revenue statistics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="revenue-visibility">Staff can see:</Label>
                  <Select
                    value={settings.revenueVisibility}
                    onValueChange={(value: string) =>
                      setSettings({ ...settings, revenueVisibility: value as "all" | "hide" | "own" })
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger id="revenue-visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Revenue Statistics</SelectItem>
                      <SelectItem value="own">Only Their Own Revenue</SelectItem>
                      <SelectItem value="hide">Hide All Revenue</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-sm text-muted-foreground mt-2">
                    {settings.revenueVisibility === "all" && (
                      <p>
                        ✅ <strong>Full Stats:</strong> Staff can see total revenue,
                        today's revenue, and averages.
                      </p>
                    )}
                    {settings.revenueVisibility === "own" && (
                      <p>
                        📊 <strong>Personal Stats:</strong> Staff only see revenue
                        from their own sales.
                      </p>
                    )}
                    {settings.revenueVisibility === "hide" && (
                      <p>
                        🔒 <strong>Hidden:</strong> All revenue statistics are hidden
                        from staff.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Event Visibility Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Event Visibility</CardTitle>
                <CardDescription>
                  Control which events staff can see
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="event-visibility">Staff can see:</Label>
                  <Select
                    value={settings.eventVisibility}
                    onValueChange={(value: string) =>
                      setSettings({ ...settings, eventVisibility: value as "all" | "published" })
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger id="event-visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events (Including Drafts)</SelectItem>
                      <SelectItem value="published">Published Events Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-sm text-muted-foreground mt-2">
                    {settings.eventVisibility === "all" && (
                      <p>
                        ✅ <strong>All Events:</strong> Staff can see draft events and
                        help with planning.
                      </p>
                    )}
                    {settings.eventVisibility === "published" && (
                      <p>
                        📅 <strong>Published Only:</strong> Staff only see confirmed
                        events. Drafts are hidden.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Discord Webhooks Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Discord Webhooks</CardTitle>
                <CardDescription>
                  Receive automated notifications in different Discord channels.
                  Set up separate webhooks for different types of notifications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-sm text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <p>
                    <strong>How to create a webhook:</strong> In Discord, go to Server Settings → Integrations → Webhooks → New Webhook.
                    Copy the webhook URL and paste it below. You can use different channels for different notification types.
                  </p>
                </div>

                {/* Staff Operations Webhook */}
                <div className="space-y-3 border rounded-lg p-4 bg-gradient-to-r from-purple-500/10 to-transparent">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-staff" className="text-base font-semibold flex items-center gap-2">
                      👥 Staff Operations Channel
                    </Label>
                    <Input
                      id="webhook-staff"
                      type="url"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={settings.discordWebhooks.staff}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          discordWebhooks: {
                            ...settings.discordWebhooks,
                            staff: e.target.value,
                          },
                        })
                      }
                      disabled={isSaving}
                    />
                    <p className="text-sm text-muted-foreground">
                      Notifications related to tasks and staff management
                    </p>
                  </div>

                  {settings.discordWebhooks.staff && (
                    <div className="space-y-2 pl-4 border-l-2 border-purple-500/30">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="webhook-task-created"
                          checked={settings.webhooks.taskCreated}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              webhooks: {
                                ...settings.webhooks,
                                taskCreated: checked as boolean,
                              },
                            })
                          }
                          disabled={isSaving}
                        />
                        <label
                          htmlFor="webhook-task-created"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          📋 Task Created
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="webhook-task-completed"
                          checked={settings.webhooks.taskCompleted}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              webhooks: {
                                ...settings.webhooks,
                                taskCompleted: checked as boolean,
                              },
                            })
                          }
                          disabled={isSaving}
                        />
                        <label
                          htmlFor="webhook-task-completed"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          ✅ Task Completed
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="webhook-staff-joined"
                          checked={settings.webhooks.staffJoined}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              webhooks: {
                                ...settings.webhooks,
                                staffJoined: checked as boolean,
                              },
                            })
                          }
                          disabled={isSaving}
                        />
                        <label
                          htmlFor="webhook-staff-joined"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          👥 Staff Joined
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Events Webhook */}
                <div className="space-y-3 border rounded-lg p-4 bg-gradient-to-r from-blue-500/10 to-transparent">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-events" className="text-base font-semibold flex items-center gap-2">
                      📅 Events Channel
                    </Label>
                    <Input
                      id="webhook-events"
                      type="url"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={settings.discordWebhooks.events}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          discordWebhooks: {
                            ...settings.discordWebhooks,
                            events: e.target.value,
                          },
                        })
                      }
                      disabled={isSaving}
                    />
                    <p className="text-sm text-muted-foreground">
                      Notifications about venue events and schedules
                    </p>
                  </div>

                  {settings.discordWebhooks.events && (
                    <div className="space-y-2 pl-4 border-l-2 border-blue-500/30">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="webhook-partake-event"
                          checked={settings.webhooks.partakeEvent}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              webhooks: {
                                ...settings.webhooks,
                                partakeEvent: checked as boolean,
                              },
                            })
                          }
                          disabled={isSaving || !settings.partakeTeamId}
                        />
                        <label
                          htmlFor="webhook-partake-event"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          📅 Partake Event Mirror
                        </label>
                      </div>
                      <p className="text-xs text-muted-foreground pl-6">
                        Mirrors Partake events to this Discord channel when they fall within 7 days of start.
                        Posts include flyer images and a Partake link. Edits and cancellations are kept in sync automatically.
                        Requires a linked Partake team.
                      </p>
                    </div>
                  )}
                </div>

                {/* Revenue Webhook */}
                <div className="space-y-3 border rounded-lg p-4 bg-gradient-to-r from-green-500/10 to-transparent">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-revenue" className="text-base font-semibold flex items-center gap-2">
                      💰 Revenue Channel
                    </Label>
                    <Input
                      id="webhook-revenue"
                      type="url"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={settings.discordWebhooks.revenue}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          discordWebhooks: {
                            ...settings.discordWebhooks,
                            revenue: e.target.value,
                          },
                        })
                      }
                      disabled={isSaving}
                    />
                    <p className="text-sm text-muted-foreground">
                      Notifications about sales and financial data
                    </p>
                  </div>

                  {settings.discordWebhooks.revenue && (
                    <div className="space-y-2 pl-4 border-l-2 border-green-500/30">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="webhook-sale-logged"
                          checked={settings.webhooks.saleLogged}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              webhooks: {
                                ...settings.webhooks,
                                saleLogged: checked as boolean,
                              },
                            })
                          }
                          disabled={isSaving}
                        />
                        <label
                          htmlFor="webhook-sale-logged"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          💰 Sale Logged
                        </label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="webhook-daily-sales-summary"
                          checked={settings.webhooks.dailySalesSummary}
                          onCheckedChange={(checked) =>
                            setSettings({
                              ...settings,
                              webhooks: {
                                ...settings.webhooks,
                                dailySalesSummary: checked as boolean,
                              },
                            })
                          }
                          disabled={isSaving}
                        />
                        <label
                          htmlFor="webhook-daily-sales-summary"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          📊 Daily Sales Summary
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-sm text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p>
                    <strong>💡 Tip:</strong> You can use the same webhook URL for all channels if you want all notifications in one place,
                    or set up different channels to organize your notifications. Uncheck individual notification types to disable them.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex gap-4">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Settings"}
              </Button>
              <Button variant="outline" asChild disabled={isSaving}>
                <Link href={`/dashboard/${slug}`}>Cancel</Link>
              </Button>
            </div>

            {/* Info Card */}
            <Card className="bg-blue-500/10 border-blue-500/20">
              <CardHeader>
                <CardTitle className="text-blue-400">ℹ️ Important Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  • <strong>Owners and Managers</strong> always have full access to
                  everything regardless of these settings.
                </p>
                <p>
                  • These settings only affect <strong>STAFF members</strong>.
                </p>
                <p>
                  • Changes take effect immediately after saving.
                </p>
                <p>
                  • Staff will not be notified of permission changes.
                </p>
              </CardContent>
            </Card>

            {/* Danger Zone - Only show for owners */}
            {userRole === "OWNER" && (
              <Card className="bg-destructive/10 border-destructive/20">
                <CardHeader>
                  <CardTitle className="text-destructive">⚠️ Danger Zone</CardTitle>
                  <CardDescription className="text-destructive/80">
                    Irreversible actions that will permanently delete data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-destructive-foreground">
                      Deleting a venue will permanently remove:
                    </p>
                    <ul className="text-sm text-destructive-foreground list-disc list-inside space-y-1 ml-2">
                      <li>All events and event history</li>
                      <li>All staff members and their roles</li>
                      <li>All tasks and assignments</li>
                      <li>All sales transactions and financial data</li>
                      <li>All services and offerings</li>
                      <li>All venue settings and configurations</li>
                    </ul>
                    <p className="text-sm text-destructive font-semibold mt-4">
                      ⚠️ This action cannot be undone. All data will be permanently lost.
                    </p>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={isDeleting}>
                        {isDeleting ? "Deleting..." : "Delete Venue"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this venue and all associated data.
                          This action cannot be undone.
                          <br /><br />
                          All events, staff, tasks, sales, services, and settings will be permanently removed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteVenue}
                          className="bg-destructive text-white hover:bg-destructive/90"
                        >
                          Yes, delete permanently
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </VenueLayoutClient>
  )
}
