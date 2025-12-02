"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateTimePicker } from "@/components/ui/date-time-picker"

const EVENT_TYPES = [
  { value: "PERFORMANCE", label: "Performance" },
  { value: "GAME_NIGHT", label: "Game Night" },
  { value: "SPECIAL", label: "Special Event" },
  { value: "SOCIAL", label: "Social Gathering" },
  { value: "PRIVATE", label: "Private Event" },
  { value: "OTHER", label: "Other" },
]

const EVENT_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
]

export default function NewEventPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [startTime, setStartTime] = useState<Date>()
  const [endTime, setEndTime] = useState<Date>()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError("")

    if (!startTime || !endTime) {
      setError("Please select both start and end times")
      setIsSubmitting(false)
      return
    }

    if (endTime <= startTime) {
      setError("End time must be after start time")
      setIsSubmitting(false)
      return
    }

    const formData = new FormData(e.currentTarget)
    const data = {
      title: formData.get("title"),
      description: formData.get("description"),
      eventType: formData.get("eventType"),
      status: formData.get("status"),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }

    try {
      // First, get the venue ID from the slug
      const venueResponse = await fetch(`/api/venues`)
      if (!venueResponse.ok) {
        const venueError = await venueResponse.json()
        throw new Error(venueError.error || "Failed to fetch venue")
      }

      const venues = await venueResponse.json()
      const venue = venues.find((v: any) => v.slug === slug)
      if (!venue) throw new Error("Venue not found")

      const response = await fetch(`/api/venues/${venue.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create event")
      }

      router.push(`/dashboard/${slug}/events`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto p-8 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Create New Event</CardTitle>
          <CardDescription>
            Schedule a new event for your venue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Event Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                name="title"
                placeholder="Live Music Night"
                required
              />
            </div>

            {/* Event Type */}
            <div className="space-y-2">
              <Label htmlFor="eventType">Event Type *</Label>
              <Select name="eventType" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Join us for an evening of live music and entertainment..."
                rows={4}
              />
            </div>

            {/* Start Time */}
            <div className="space-y-2">
              <Label>Start Time *</Label>
              <DateTimePicker
                date={startTime}
                onDateChange={setStartTime}
                placeholder="Select start time"
              />
            </div>

            {/* End Time */}
            <div className="space-y-2">
              <Label>End Time *</Label>
              <DateTimePicker
                date={endTime}
                onDateChange={setEndTime}
                placeholder="Select end time"
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select name="status" defaultValue="DRAFT" required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Draft events are only visible to staff. Published events are visible to everyone.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex gap-4">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Creating..." : "Create Event"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
