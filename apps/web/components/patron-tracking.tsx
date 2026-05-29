"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ServerTime, SERVER_TIME_LABEL } from "@/components/server-time"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Users, ArrowUpCircle, ArrowDownCircle } from "lucide-react"

interface PatronLog {
  id: string
  action: "ENTER" | "EXIT"
  countChange: number
  timestamp: string
  staff: {
    id: string
    name: string | null
  } | null
}

interface PatronTrackingProps {
  venueId: string
  eventId?: string
}

export function PatronTracking({ venueId, eventId }: PatronTrackingProps) {
  const [currentCount, setCurrentCount] = useState(0)
  const [logs, setLogs] = useState<PatronLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchPatronData = async () => {
    try {
      const url = eventId
        ? `/api/venues/${venueId}/patron-tracking?eventId=${eventId}`
        : `/api/venues/${venueId}/patron-tracking`

      const response = await fetch(url)
      if (!response.ok) throw new Error("Failed to fetch patron data")

      const data = await response.json()
      setCurrentCount(data.currentCount)
      setLogs(data.logs.slice(0, 10)) // Show last 10 entries
      setError("")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to load patron data")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPatronData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPatronData, 30000)
    return () => clearInterval(interval)
  }, [venueId, eventId])

  const handleLog = async (action: "ENTER" | "EXIT") => {
    setIsSubmitting(true)
    setError("")

    try {
      const response = await fetch(`/api/venues/${venueId}/patron-tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, eventId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to log patron")
      }

      const data = await response.json()
      setCurrentCount(data.currentCount)

      // Add new log to the top
      setLogs((prev) => [data.log, ...prev.slice(0, 9)])
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to log patron")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Loading patron tracking...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Patron Tracking
        </CardTitle>
        <CardDescription>Track guests entering and leaving the venue</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert className="bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        {/* Current Count Display */}
        <div className="text-center p-6 bg-[rgba(0,180,255,0.06)] rounded-xl border border-[rgba(0,180,255,0.15)]">
          <div className="text-sm text-muted-foreground mb-2">Current Patrons</div>
          <div className="text-5xl font-bold text-[var(--xiv-blue)]">{currentCount}</div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            size="lg"
            variant="default"
            onClick={() => handleLog("ENTER")}
            disabled={isSubmitting}
            className="h-20 text-lg"
          >
            <ArrowUpCircle className="h-6 w-6 mr-2" />
            Patron Entered
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => handleLog("EXIT")}
            disabled={isSubmitting || currentCount === 0}
            className="h-20 text-lg"
          >
            <ArrowDownCircle className="h-6 w-6 mr-2" />
            Patron Left
          </Button>
        </div>

        {/* Recent Activity */}
        <div>
          <h4 className="text-sm font-medium mb-3">Recent Activity</h4>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No patron activity yet
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    {log.action === "ENTER" ? (
                      <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4 text-orange-600" />
                    )}
                    <Badge variant={log.action === "ENTER" ? "default" : "outline"}>
                      {log.action === "ENTER" ? "Entered" : "Left"}
                    </Badge>
                    {log.staff?.name && (
                      <span className="text-muted-foreground">by {log.staff.name}</span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    <ServerTime date={log.timestamp} formatStr="time" /> {SERVER_TIME_LABEL}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Auto-refreshes every 30 seconds
        </div>
      </CardContent>
    </Card>
  )
}
