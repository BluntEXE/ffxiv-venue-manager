"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LocalTime } from "@/components/server-time"

interface PotDistributionSummary {
  generatedAt: string
  recipientCount: number
  perPersonShare: string
}

interface GeneratePotPayrollButtonProps {
  venueSlug: string
  eventId: string
  existingDistribution: PotDistributionSummary | null
}

export function GeneratePotPayrollButton({
  venueSlug,
  eventId,
  existingDistribution,
}: GeneratePotPayrollButtonProps) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState("")

  async function handleGenerate() {
    setGenerating(true)
    setError("")
    try {
      const res = await fetch(`/api/venues/${venueSlug}/events/${eventId}/pot-payroll`, {
        method: "POST",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Failed to generate pot payroll (${res.status})`)
        return
      }
      router.refresh()
    } catch {
      setError("Network error generating pot payroll.")
    } finally {
      setGenerating(false)
    }
  }

  if (existingDistribution) {
    return (
      <p className="text-sm text-muted-foreground">
        Generated <LocalTime date={existingDistribution.generatedAt} formatStr="datetimelong" /> —{" "}
        {existingDistribution.recipientCount} recipients, {existingDistribution.perPersonShare} gil each.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleGenerate} disabled={generating}>
        {generating ? "Generating…" : "Generate Pot Payroll"}
      </Button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
