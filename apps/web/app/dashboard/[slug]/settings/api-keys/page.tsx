"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ApiKey {
  id: string
  key: string
  name: string
  createdAt: string
  lastUsedAt?: string | null
  revokedAt: string | null
  venue?: {
    id: string
    name: string
    slug: string
  }
}

interface Membership {
  role?: string
  status?: string
}

interface Venue {
  id: string
  name: string
  slug: string
  memberships?: Membership[]
}

export default function ApiKeysPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const [slug, setSlug] = useState<string>("")
  const [currentVenue, setCurrentVenue] = useState<Venue | null>(null)
  const [notOwner, setNotOwner] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showKey, setShowKey] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    params.then((p) => {
      setSlug(p.slug)
      fetchData(p.slug)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  // Auto-dismiss success messages after 3s so they don't stack up.
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(""), 3000)
    return () => clearTimeout(t)
  }, [success])

  async function fetchData(venueSlug: string) {
    setIsLoading(true)
    setError("")
    try {
      const [venuesRes, keysRes] = await Promise.all([
        fetch("/api/venues"),
        fetch("/api/plugin/keys"),
      ])

      if (!venuesRes.ok) {
        setError("Failed to load your venues")
        setIsLoading(false)
        return
      }

      const venues: Venue[] = await venuesRes.json()
      const match = venues.find((v) => v.slug === venueSlug) ?? null
      setCurrentVenue(match)

      if (!match) {
        setError("Venue not found")
        setIsLoading(false)
        return
      }

      const ownerMembership = match.memberships?.find(
        (m) => ["OWNER", "MANAGER", "STAFF"].includes(m.role ?? "") && m.status === "active"
      )
      if (!ownerMembership) {
        setNotOwner(true)
        setIsLoading(false)
        return
      }

      if (keysRes.ok) {
        const data = await keysRes.json()
        setApiKeys(data.keys || [])
      }
    } catch (err) {
      console.error("Failed to fetch API keys:", err)
      setError("Failed to load API keys")
    } finally {
      setIsLoading(false)
    }
  }

  // Only show keys that belong to the venue this page is scoped to.
  const venueKeys = useMemo(
    () => apiKeys.filter((k) => k.venue?.slug === slug),
    [apiKeys, slug]
  )

  async function createApiKey() {
    if (!currentVenue) return
    if (!newKeyName.trim()) {
      setError("Please enter a name for the API key")
      return
    }

    setIsCreating(true)
    setError("")
    setSuccess("")

    try {
      const res = await fetch("/api/plugin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: currentVenue.id, name: newKeyName.trim() }),
      })

      const data = await res.json()

      if (res.ok) {
        setApiKeys([data, ...apiKeys])
        setNewKeyName("")
        setShowKey(data.key)
      } else {
        setError(data.error || "Failed to create API key")
      }
    } catch {
      setError("Failed to create API key")
    } finally {
      setIsCreating(false)
    }
  }

  async function revokeApiKey(keyId: string) {
    if (
      !confirm(
        "Revoke this API key? Any plugin installation using it will stop working immediately. This cannot be undone."
      )
    ) {
      return
    }

    try {
      const res = await fetch(`/api/plugin/keys/${keyId}`, {
        method: "DELETE",
      })

      if (res.ok) {
        setApiKeys(
          apiKeys.map((k) =>
            k.id === keyId ? { ...k, revokedAt: new Date().toISOString() } : k
          )
        )
        setSuccess("API key revoked")
      } else {
        setError("Failed to revoke API key")
      }
    } catch {
      setError("Failed to revoke API key")
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setSuccess("Copied to clipboard")
  }

  if (isLoading) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner"><p className="text-muted-foreground text-sm">Loading…</p></div>
      </VenueLayoutClient>
    )
  }

  if (notOwner) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner max-w-4xl">
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>Only active venue members can manage API keys for the Dalamud plugin.</AlertDescription>
          </Alert>
        </div>
      </VenueLayoutClient>
    )
  }

  return (
    <VenueLayoutClient slug={slug}>
    <div className="page-inner max-w-4xl">
      <div className="mb-6 md:mb-8">
        <VenueEyebrow slug={slug} />
        <h1 className="page-h1">
          API Keys
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
          Generate keys so the XIV-App Dalamud plugin can send patron visits to{" "}
          <span className="font-medium">{currentVenue?.name}</span>.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-6 border-emerald-500/40 bg-emerald-500/10">
          <AlertDescription className="text-emerald-300">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Create New Key */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
          <svg className="w-4 h-4 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          Create new API key
          <span className="ml-auto text-xs text-[var(--fg-faint)] font-normal">Shown once — copy immediately</span>
        </div>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3 md:gap-4 md:items-end">
            <div className="flex-1">
              <Label htmlFor="keyName">Key Name</Label>
              <Input
                id="keyName"
                placeholder="e.g., My gaming PC"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="mt-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCreating) createApiKey()
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                A label to help you remember where this key is installed.
              </p>
            </div>
            <Button onClick={createApiKey} disabled={isCreating}>
              {isCreating ? "Creating..." : "Generate Key"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Show newly created key + Dalamud setup instructions */}
      {showKey && (
        <Card className="mb-6 border-emerald-500/50 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="text-emerald-300">
              Copy your API key now
            </CardTitle>
            <CardDescription className="text-emerald-200/80">
              This is the only time the full key will ever be shown. If you
              lose it, revoke it and generate a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={showKey}
                readOnly
                className="font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                onClick={() => copyToClipboard(showKey)}
              >
                Copy
              </Button>
              <Button variant="ghost" onClick={() => setShowKey(null)}>
                Done
              </Button>
            </div>

            <div className="rounded-md border border-emerald-500/30 bg-background p-4 space-y-3">
              <div className="text-sm font-semibold text-emerald-300">
                Next: Set up the Venue Manager plugin
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">
                  First time? Install the plugin (click to expand)
                </summary>
                <ol className="list-decimal list-inside space-y-1 mt-2 pl-2">
                  <li>
                    In FFXIV, open Dalamud settings with{" "}
                    <code className="bg-muted text-foreground px-1 rounded">/xlsettings</code>
                  </li>
                  <li>
                    Go to the{" "}
                    <span className="font-medium text-foreground">Experimental</span> tab
                  </li>
                  <li>
                    Under{" "}
                    <span className="font-medium text-foreground">
                      Custom Plugin Repositories
                    </span>
                    , paste:
                  </li>
                </ol>
                <div className="flex gap-2 mt-2">
                  <Input
                    readOnly
                    value="https://raw.githubusercontent.com/BluntEXE/XIVVenueManagerSync/master/repo.json"
                    className="font-mono text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(
                        "https://raw.githubusercontent.com/BluntEXE/XIVVenueManagerSync/master/repo.json"
                      )
                    }
                  >
                    Copy
                  </Button>
                </div>
                <ol
                  start={4}
                  className="list-decimal list-inside space-y-1 mt-2 pl-2"
                >
                  <li>
                    Tick the enable checkbox next to the URL, then click{" "}
                    <span className="font-medium text-foreground">Save and Close</span>
                  </li>
                  <li>
                    Open{" "}
                    <code className="bg-muted text-foreground px-1 rounded">/xlplugins</code>,
                    search for{" "}
                    <span className="font-medium text-foreground">Venue Manager</span>, and install it
                  </li>
                </ol>
              </details>
              <div>
                <div className="text-xs font-semibold text-emerald-300 mb-1">
                  Connect your key
                </div>
                <ol className="text-sm text-foreground list-decimal list-inside space-y-1">
                  <li>
                    In-game, type{" "}
                    <code className="bg-muted px-1 rounded">/xvenue</code>{" "}
                    to open the plugin window
                  </li>
                  <li>
                    Switch to the <span className="font-medium">Settings</span> tab
                    and scroll to <span className="font-medium">XIV-App Sync</span>
                  </li>
                  <li>
                    Tick <span className="font-medium">Enable XIV-App Sync</span>,
                    then paste the API key above into the{" "}
                    <span className="font-medium">API Key</span> field
                  </li>
                  <li>
                    Click <span className="font-medium">Fetch Venues</span> and pick{" "}
                    <span className="font-medium">{currentVenue?.name}</span> from
                    the dropdown
                  </li>
                  <li>
                    Visits to your venue will now sync automatically. You can
                    come back here any time to revoke this key.
                  </li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Keys */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
          <svg className="w-4 h-4 text-[var(--xiv-blue)]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Active keys
          <span className="ml-auto text-xs text-[var(--fg-faint)] font-normal">{venueKeys.length} key{venueKeys.length !== 1 ? "s" : ""}</span>
        </div>
        <CardContent>
          {venueKeys.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No API keys yet. Create one above to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {venueKeys.map((key) => (
                <div
                  key={key.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${
                    key.revokedAt ? "bg-muted/40 opacity-60" : "bg-muted/20"
                  }`}
                >
                  <div>
                    <div className="font-medium">{key.name}</div>
                    <div className="text-sm text-muted-foreground font-mono">
                      {key.key}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Created:{" "}
                      {new Date(key.createdAt).toLocaleDateString()}
                      {key.lastUsedAt &&
                        ` • Last used: ${new Date(
                          key.lastUsedAt
                        ).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {key.revokedAt ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => revokeApiKey(key.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <Link
          href={`/dashboard/${slug}/settings`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Settings
        </Link>
        <Link
          href="/dashboard/api-keys"
          className="text-sm text-primary hover:underline"
        >
          See all your API keys &rarr;
        </Link>
      </div>
    </div>
    </VenueLayoutClient>
  )
}
