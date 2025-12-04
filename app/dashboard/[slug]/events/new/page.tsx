"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateTimePicker } from "@/components/ui/date-time-picker"

interface EventTemplate {
  id: string
  name: string
  title: string
  description: string | null
  eventType: string
  timezone: string
  defaultStartTime: string
  defaultEndTime: string
}

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
  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [formValues, setFormValues] = useState({
    title: "",
    description: "",
    eventType: "OTHER",
  })

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch(`/api/venues/${slug}/event-templates`)
        if (response.ok) {
          const data = await response.json()
          setTemplates(data)
        }
      } catch (error) {
        console.error("Error fetching templates:", error)
      }
    }
    fetchTemplates()
  }, [slug])

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId)
    if (templateId === "none") {
      // Clear form when "None" is selected
      setFormValues({ title: "", description: "", eventType: "OTHER" })
      setStartTime(undefined)
      setEndTime(undefined)
      return
    }

    const template = templates.find((t) => t.id === templateId)
    if (template) {
      setFormValues({
        title: template.title,
        description: template.description || "",
        eventType: template.eventType,
      })

      // Set start and end times from template default times (using today's date)
      const today = new Date()
      const [startHours, startMinutes] = template.defaultStartTime.split(':').map(Number)
      const [endHours, endMinutes] = template.defaultEndTime.split(':').map(Number)

      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHours, startMinutes)
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endHours, endMinutes)

      setStartTime(start)
      setEndTime(end)
    }
  }

  // Auto-calculate end time when start time changes and template is selected
  useEffect(() => {
    if (startTime && selectedTemplate && selectedTemplate !== "none") {
      const template = templates.find((t) => t.id === selectedTemplate)
      if (template) {
        // Calculate duration from template times
        const [startHours, startMinutes] = template.defaultStartTime.split(':').map(Number)
        const [endHours, endMinutes] = template.defaultEndTime.split(':').map(Number)

        const templateStartMinutes = startHours * 60 + startMinutes
        const templateEndMinutes = endHours * 60 + endMinutes
        const durationMinutes = templateEndMinutes - templateStartMinutes

        // Apply duration to the new start time
        const end = new Date(startTime.getTime() + durationMinutes * 60000)
        setEndTime(end)
      }
    }
  }, [startTime, selectedTemplate, templates])

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
      title: formValues.title,
      description: formValues.description,
      eventType: formValues.eventType,
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
            {/* Create from Template */}
            {templates.length > 0 && (
              <div className="space-y-2 p-4 bg-muted rounded-lg">
                <Label htmlFor="template">Create from Template (Optional)</Label>
                <Select value={selectedTemplate || "none"} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template or create from scratch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None - Create from scratch</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Templates will pre-fill event details and set default times
                </p>
              </div>
            )}

            {/* Event Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                name="title"
                placeholder="Live Music Night"
                value={formValues.title}
                onChange={(e) => setFormValues({ ...formValues, title: e.target.value })}
                required
              />
            </div>

            {/* Event Type */}
            <div className="space-y-2">
              <Label htmlFor="eventType">Event Type *</Label>
              <Select
                name="eventType"
                value={formValues.eventType}
                onValueChange={(value) => setFormValues({ ...formValues, eventType: value })}
                required
              >
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
                value={formValues.description}
                onChange={(e) => setFormValues({ ...formValues, description: e.target.value })}
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
