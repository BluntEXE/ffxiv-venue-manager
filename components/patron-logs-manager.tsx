"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { History, Filter, Users, User } from "lucide-react"

type LogRow = {
  id: string
  timestamp: string
  characterName: string | null
  world: string | null
  action: string
  wasWorking: boolean
  workingUser: { id: string; name: string | null } | null
  event: { id: string; title: string } | null
  reclassifiedAt: string | null
  reclassifiedBy: { id: string; name: string | null } | null
  reclassifyReason: string | null
}

type EventOpt = { id: string; title: string; startTime: string; endTime: string | null }
type StaffOpt = { id: string; name: string }
type CharOpt = { name: string; world: string }
type CharUserMap = { characterName: string; world: string; userId: string; userName: string }

type Filters = {
  eventId: string
  from: string
  to: string
  character: string
  classification: "all" | "patron" | "staff"
}

export function PatronLogsManager({
  venueId,
  logs,
  events,
  staff,
  characters,
  characterUserMap,
  initialFilters,
  limitHit,
}: {
  venueId: string
  logs: LogRow[]
  events: EventOpt[]
  staff: StaffOpt[]
  characters: CharOpt[]
  characterUserMap: CharUserMap[]
  initialFilters: Filters
  limitHit: boolean
}) {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [target, setTarget] = useState<"staff" | "patron">("staff")
  const [assignUserId, setAssignUserId] = useState<string>("")
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const charUserLookup = useMemo(() => {
    const m = new Map<string, CharUserMap>()
    for (const c of characterUserMap) {
      m.set(`${c.characterName}|${c.world}`, c)
    }
    return m
  }, [characterUserMap])

  const allSelected = logs.length > 0 && selected.size === logs.length
  const someSelected = selected.size > 0 && !allSelected

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(logs.map((l) => l.id)))
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function applyFilters() {
    const params = new URLSearchParams()
    if (filters.eventId) params.set("eventId", filters.eventId)
    if (!filters.eventId) {
      if (filters.from) params.set("from", filters.from)
      if (filters.to) params.set("to", filters.to)
    }
    if (filters.character) params.set("character", filters.character)
    if (filters.classification !== "all") params.set("classification", filters.classification)
    startTransition(() => {
      router.push(`?${params.toString()}`)
      setSelected(new Set())
    })
  }

  function resetFilters() {
    setFilters({
      eventId: "",
      from: "",
      to: "",
      character: "",
      classification: "all",
    })
    startTransition(() => {
      router.push("?")
      setSelected(new Set())
    })
  }

  function openDialog(mode: "staff" | "patron") {
    setError(null)
    setTarget(mode)
    setReason("")
    // Suggest user from first selected row that has a UserCharacter link
    let suggested = ""
    for (const id of selected) {
      const log = logs.find((l) => l.id === id)
      if (!log?.characterName || !log?.world) continue
      const link = charUserLookup.get(`${log.characterName}|${log.world}`)
      if (link) {
        suggested = link.userId
        break
      }
    }
    setAssignUserId(mode === "staff" ? suggested : "")
    setDialogOpen(true)
  }

  async function submitReclassify() {
    setError(null)
    if (target === "staff" && !assignUserId) {
      setError("Pick a staff member to assign these visits to.")
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch(
        `/api/venues/${venueId}/patron-logs/bulk-reclassify`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            logIds: Array.from(selected),
            wasWorking: target === "staff",
            workingUserId: target === "staff" ? assignUserId : null,
            reason: reason.trim() || undefined,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? "Failed to reclassify")
        setIsSubmitting(false)
        return
      }
      setDialogOpen(false)
      setSelected(new Set())
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4 text-sm font-medium">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <Label htmlFor="event">Event</Label>
              <Select
                value={filters.eventId || "none"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, eventId: v === "none" ? "" : v }))
                }
              >
                <SelectTrigger id="event">
                  <SelectValue placeholder="All events / date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Use date range —</SelectItem>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title} ({new Date(e.startTime).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="date"
                value={filters.from}
                disabled={!!filters.eventId}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="date"
                value={filters.to}
                disabled={!!filters.eventId}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="classification">Show</Label>
              <Select
                value={filters.classification}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    classification: v as Filters["classification"],
                  }))
                }
              >
                <SelectTrigger id="classification">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="patron">Patron only</SelectItem>
                  <SelectItem value="staff">Staff only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <Label htmlFor="character">Character</Label>
              <Select
                value={filters.character || "none"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, character: v === "none" ? "" : v }))
                }
              >
                <SelectTrigger id="character">
                  <SelectValue placeholder="All characters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All characters</SelectItem>
                  {characters.map((c) => (
                    <SelectItem key={`${c.name}|${c.world}`} value={c.name}>
                      {c.name} {c.world ? `(${c.world})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={applyFilters} disabled={isPending}>
              Apply filters
            </Button>
            <Button variant="outline" onClick={resetFilters} disabled={isPending}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <Card className="border-primary">
          <CardContent className="pt-6 flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div className="text-sm">
              <strong>{selected.size}</strong> row{selected.size === 1 ? "" : "s"} selected
            </div>
            <div className="flex gap-2">
              <Button onClick={() => openDialog("staff")} size="sm">
                <Users className="h-4 w-4 mr-2" />
                Reclassify as Staff
              </Button>
              <Button onClick={() => openDialog("patron")} size="sm" variant="outline">
                <User className="h-4 w-4 mr-2" />
                Reclassify as Patron
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="p-3 text-left w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="p-3 text-left">When</th>
                <th className="p-3 text-left">Character</th>
                <th className="p-3 text-left">Action</th>
                <th className="p-3 text-left">Classification</th>
                <th className="p-3 text-left">Event</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No logs match the current filters.
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr
                  key={l.id}
                  className="border-b last:border-0 hover:bg-muted/30 transition"
                >
                  <td className="p-3">
                    <Checkbox
                      checked={selected.has(l.id)}
                      onCheckedChange={() => toggleOne(l.id)}
                      aria-label={`Select log ${l.id}`}
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {new Date(l.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {l.characterName ?? "—"}
                    {l.world && (
                      <span className="text-muted-foreground"> ({l.world})</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline">{l.action}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {l.wasWorking ? (
                        <Badge>Staff</Badge>
                      ) : (
                        <Badge variant="secondary">Patron</Badge>
                      )}
                      {l.workingUser && (
                        <span className="text-xs text-muted-foreground">
                          {l.workingUser.name ?? "—"}
                        </span>
                      )}
                      {l.reclassifiedAt && (
                        <span
                          title={`Reclassified by ${l.reclassifiedBy?.name ?? "?"} on ${new Date(l.reclassifiedAt).toLocaleString()}${l.reclassifyReason ? ` — ${l.reclassifyReason}` : ""}`}
                          className="inline-flex"
                        >
                          <History className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {l.event?.title ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {limitHit && (
        <p className="text-xs text-muted-foreground">
          Showing the first 200 rows. Narrow your filters to see more.
        </p>
      )}

      {/* Reclassify dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reclassify {selected.size} row{selected.size === 1 ? "" : "s"} as{" "}
              {target === "staff" ? "Staff" : "Patron"}
            </DialogTitle>
            <DialogDescription>
              {target === "staff"
                ? "These visits will be marked as staff working a shift. Pick the staff member they belong to."
                : "These visits will be marked as patron visits. Any staff assignment will be cleared."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {target === "staff" && (
              <div>
                <Label htmlFor="assign">Assign to staff member</Label>
                <Select value={assignUserId} onValueChange={setAssignUserId}>
                  <SelectTrigger id="assign">
                    <SelectValue placeholder="Select a staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                placeholder="e.g. Forgot to clock in for the 8pm shift"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitReclassify} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
