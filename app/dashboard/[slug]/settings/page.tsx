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

interface WebhookSettings {
  taskCreated: boolean
  taskCompleted: boolean
  eventCreated: boolean
  eventStartingSoon: boolean
  saleLogged: boolean
  dailySalesSummary: boolean
  staffJoined: boolean
}

interface DiscordWebhooks {
  staff: string
  events: string
  revenue: string
}

interface VenueSettings {
  taskVisibility: "all" | "assigned" | "assigned_unassigned"
  salesVisibility: "all" | "own" | "none"
  revenueVisibility: "all" | "hide" | "own"
  eventVisibility: "all" | "published"
  webhooks: WebhookSettings
  discordWebhooks: DiscordWebhooks
  // Legacy support
  discordWebhookUrl?: string
}

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
      eventCreated: false,
      eventStartingSoon: false,
      saleLogged: false,
      dailySalesSummary: false,
      staffJoined: false,
    },
    discordWebhooks: {
      staff: "",
      events: "",
      revenue: "",
    },
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
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
              eventCreated: false,
              eventStartingSoon: false,
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

      {/* Success Message */}
      {success && (
        <Alert className="mb-6 bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">
            Settings saved successfully!
          </AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert className="mb-6 bg-red-50 border-red-200">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
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
              <div className="text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p>
                  <strong>How to create a webhook:</strong> In Discord, go to Server Settings → Integrations → Webhooks → New Webhook.
                  Copy the webhook URL and paste it below. You can use different channels for different notification types.
                </p>
              </div>

              {/* Staff Operations Webhook */}
              <div className="space-y-3 border rounded-lg p-4 bg-gradient-to-r from-purple-50 to-transparent">
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
                  <div className="space-y-2 pl-4 border-l-2 border-purple-300">
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
              <div className="space-y-3 border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-transparent">
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
                  <div className="space-y-2 pl-4 border-l-2 border-blue-300">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="webhook-event-created"
                        checked={settings.webhooks.eventCreated}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            webhooks: {
                              ...settings.webhooks,
                              eventCreated: checked as boolean,
                            },
                          })
                        }
                        disabled={isSaving}
                      />
                      <label
                        htmlFor="webhook-event-created"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        📅 Event Created
                      </label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="webhook-event-starting-soon"
                        checked={settings.webhooks.eventStartingSoon}
                        onCheckedChange={(checked) =>
                          setSettings({
                            ...settings,
                            webhooks: {
                              ...settings.webhooks,
                              eventStartingSoon: checked as boolean,
                            },
                          })
                        }
                        disabled={isSaving}
                      />
                      <label
                        htmlFor="webhook-event-starting-soon"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        ⏰ Event Starting Soon
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Revenue Webhook */}
              <div className="space-y-3 border rounded-lg p-4 bg-gradient-to-r from-green-50 to-transparent">
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
                  <div className="space-y-2 pl-4 border-l-2 border-green-300">
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

              <div className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
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
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-blue-900">ℹ️ Important Notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-blue-800 space-y-2">
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
            <Card className="bg-red-50 border-red-200">
              <CardHeader>
                <CardTitle className="text-red-900">⚠️ Danger Zone</CardTitle>
                <CardDescription className="text-red-700">
                  Irreversible actions that will permanently delete data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-red-800">
                    Deleting a venue will permanently remove:
                  </p>
                  <ul className="text-sm text-red-800 list-disc list-inside space-y-1 ml-2">
                    <li>All events and event history</li>
                    <li>All staff members and their roles</li>
                    <li>All tasks and assignments</li>
                    <li>All sales transactions and financial data</li>
                    <li>All services and offerings</li>
                    <li>All venue settings and configurations</li>
                  </ul>
                  <p className="text-sm text-red-800 font-semibold mt-4">
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
                        className="bg-red-600 hover:bg-red-700"
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
