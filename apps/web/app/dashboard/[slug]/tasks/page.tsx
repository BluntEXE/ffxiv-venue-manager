"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { format } from "date-fns"
import { PageLoading } from "@/components/ui/loading-spinner"

interface Task {
  id: string
  title: string
  description: string | null
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  category: string | null
  dueDate: string | null
  completedAt: string | null
  createdAt: string
  assignee: {
    id: string
    name: string | null
    email: string | null
    image: string | null
  } | null
  completer: {
    id: string
    name: string | null
  } | null
  assignedRole: Role | null
}

interface Role {
  id: string
  name: string
  color: string
}


const TASK_CATEGORIES = ["Setup", "Cleanup", "Promotional", "Maintenance", "Administrative", "Other"]

export default function TasksPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const [slug, setSlug] = useState<string>("")
  const [tasks, setTasks] = useState<Task[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  // Form state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
    category: "",
    selectedRoleId: "",
    dueDate: "",
  })
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Search state
  const [search, setSearch] = useState("")

  // Unwrap params
  useEffect(() => {
    params.then((p) => setSlug(p.slug))
  }, [params])

  // Fetch data
  useEffect(() => {
    if (!slug) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError("")

        // Get venue ID
        const venueResponse = await fetch(`/api/venues?slug=${slug}`)
        if (!venueResponse.ok) throw new Error("Failed to fetch venue")

        const venues = await venueResponse.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)
        if (!venue) throw new Error("Venue not found")

        // Get tasks
        const tasksResponse = await fetch(`/api/venues/${venue.id}/tasks`)
        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json()
          setTasks(tasksData)
        }

        // Get roles
        const rolesResponse = await fetch(`/api/venues/${venue.id}/roles`)
        if (rolesResponse.ok) {
          const rolesData = await rolesResponse.json()
          setRoles(rolesData)
        }
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "Failed to load data")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [slug])

  const handleCreateTask = async () => {
    if (!formData.title.trim()) {
      setFormError("Task title is required")
      return
    }

    setIsSubmitting(true)
    setFormError("")

    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || undefined,
          priority: formData.priority,
          category: formData.category || undefined,
          assignedRoleId: formData.selectedRoleId || undefined,
          dueDate: formData.dueDate || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create task")
      }

      const newTask = await response.json()
      setTasks([newTask, ...tasks])
      setIsCreateDialogOpen(false)
      setFormData({
        title: "",
        description: "",
        priority: "MEDIUM",
        category: "",
        selectedRoleId: "",
        dueDate: "",
      })
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to create task")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStatusUpdate = async (taskId: string, newStatus: Task["status"]) => {
    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update task")
      }

      const updatedTask = await response.json()
      setTasks(tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)))
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to update task")
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/tasks/${taskId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete task")
      }

      setTasks(tasks.filter((t) => t.id !== taskId))
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to delete task")
    }
  }

  const openCreateDialog = () => {
    setFormData({
      title: "",
      description: "",
      priority: "MEDIUM",
      category: "",
      selectedRoleId: "",
      dueDate: "",
    })
    setFormError("")
    setIsCreateDialogOpen(true)
  }

  const openEditDialog = (task: Task) => {
    setEditingTask(task)
    setFormData({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      category: task.category || "none",
      selectedRoleId: task.assignedRole?.id || "unassigned",
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "",
    })
    setFormError("")
    setIsEditDialogOpen(true)
  }

  const handleEditTask = async () => {
    if (!editingTask) return

    try {
      setIsSubmitting(true)
      setFormError("")

      if (!formData.title.trim()) {
        setFormError("Task title is required")
        return
      }

      // Get venue ID
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const requestBody = {
        title: formData.title,
        description: formData.description || null,
        priority: formData.priority,
        category: formData.category === "none" ? null : formData.category,
        assignedRoleId: formData.selectedRoleId === "unassigned" ? null : formData.selectedRoleId,
        dueDate: formData.dueDate || null,
      }

      console.log("Sending task update:", requestBody)

      const response = await fetch(`/api/venues/${venue.id}/tasks/${editingTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const data = await response.json()
        console.error("Task update failed:", data)
        throw new Error(data.error || "Failed to update task")
      }

      const updatedTask = await response.json()
      setTasks(tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)))
      setIsEditDialogOpen(false)
      setEditingTask(null)
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Failed to update task")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!slug) {
    return <div className="p-4 md:p-6"><PageLoading /></div>
  }

  return (
    <VenueLayoutClient slug={slug}>
      <div className="p-4 md:p-6">
        {/* Breadcrumb */}
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="page-h1">Tasks</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage and assign tasks to your team</p>
          </div>
          <Button onClick={openCreateDialog} size="sm" className="sm:size-default self-start">
            <span className="hidden sm:inline">Create Task</span>
            <span className="sm:hidden">New Task</span>
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <span>Click a card to mark it complete</span>
          </p>
          <div className="flex-1" />
          <div className="relative flex items-center" style={{ maxWidth: 280, flex: "0 1 280px" }}>
            <svg className="absolute left-3 w-4 h-4 text-[var(--fg-faint)] pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <Input
              className="pl-9 bg-card border-[var(--blue-015)] focus:border-[var(--blue-035)] h-9 text-sm"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

      {/* Error */}
      {error && (
        <Alert className="mb-6 bg-destructive/10 border-destructive/20">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      {/* Kanban */}
      {isLoading ? (
        <PageLoading text="Loading tasks..." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {(
            [
              { key: "PENDING",     label: "To do",      dot: "var(--xiv-blue)",    next: "IN_PROGRESS" as const, nextLabel: "Start"    },
              { key: "IN_PROGRESS", label: "In progress", dot: "var(--warning)",     next: "COMPLETED"   as const, nextLabel: "Complete" },
              { key: "COMPLETED",   label: "Done",        dot: "var(--success-text)", next: "PENDING"    as const, nextLabel: "Reopen"  },
            ] as const
          ).map(({ key, label, dot, next, nextLabel }) => {
            const col = tasks.filter(
              (t) =>
                t.status === key &&
                (!search || t.title.toLowerCase().includes(search.toLowerCase()))
            )
            return (
              <div
                key={key}
                className="rounded-2xl border border-[var(--blue-015)] bg-card overflow-hidden"
              >
                {/* Column header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--blue-008)]">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                  <span className="font-[var(--font-heading)] font-semibold text-sm">{label}</span>
                  <span className="ml-auto text-xs text-[var(--fg-faint)] bg-[var(--blue-010)] px-2 py-0.5 rounded-full">
                    {col.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 p-2 min-h-10">
                  {col.length === 0 && (
                    <p className="text-xs text-[var(--fg-faint)] text-center py-6">
                      {key === "PENDING" && tasks.length === 0 ? "No tasks yet" : "Empty"}
                    </p>
                  )}
                  {col.map((task) => (
                    <div
                      key={task.id}
                      className={`rounded-lg border bg-background px-[13px] py-3 cursor-pointer transition-all hover:-translate-y-px hover:border-[var(--blue-035)] ${
                        key === "COMPLETED"
                          ? "border-[var(--blue-008)] opacity-70"
                          : "border-[var(--blue-012)]"
                      }`}
                      onClick={() => handleStatusUpdate(task.id, next)}
                      title={`Click to move to ${nextLabel === "Start" ? "In Progress" : nextLabel === "Complete" ? "Done" : "To Do"}`}
                    >
                      <p className={`text-sm leading-snug mb-3 ${key === "COMPLETED" ? "line-through text-[var(--fg-faint)]" : "text-foreground"}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2">
                        {/* Priority dot */}
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          title={task.priority}
                          style={{
                            background:
                              task.priority === "URGENT" ? "var(--destructive)" :
                              task.priority === "HIGH"   ? "var(--warning)" :
                              task.priority === "MEDIUM" ? "var(--xiv-blue)" :
                                                           "var(--fg-faint)",
                          }}
                        />
                        {/* Due date */}
                        {task.dueDate ? (
                          <span className={`text-[0.68rem] flex items-center gap-1 ${
                            new Date(task.dueDate) < new Date() && key !== "COMPLETED"
                              ? "text-[var(--warning)]"
                              : "text-[var(--fg-faint)]"
                          }`}>
                            <svg className="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {format(new Date(task.dueDate), "d MMM")}
                          </span>
                        ) : key === "COMPLETED" ? (
                          <span className="text-[0.68rem] text-[var(--fg-faint)] flex items-center gap-1">
                            <svg className="w-3 h-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                            Done
                          </span>
                        ) : null}
                        <div className="flex-1" />
                        {/* Assignee avatar */}
                        {task.assignee ? (
                          <Avatar className="w-6 h-6 text-[0.6rem]">
                            <AvatarImage src={task.assignee.image ?? undefined} />
                            <AvatarFallback className="text-[0.6rem] bg-gradient-to-br from-emerald-400 to-emerald-600 text-[var(--xiv-navy)] font-bold">
                              {task.assignee.name?.slice(0, 2).toUpperCase() ?? "?"}
                            </AvatarFallback>
                          </Avatar>
                        ) : task.assignedRole ? (
                          <span
                            className="text-[0.65rem] font-medium px-2 py-0.5 rounded-full border"
                            style={{ color: task.assignedRole.color, borderColor: task.assignedRole.color + "55", background: task.assignedRole.color + "18" }}
                          >
                            {task.assignedRole.name}
                          </span>
                        ) : null}
                        {/* Edit / delete */}
                        <button
                          className="text-[var(--fg-faint)] hover:text-foreground transition-colors p-0.5 rounded"
                          onClick={(e) => { e.stopPropagation(); openEditDialog(task) }}
                          title="Edit"
                        >
                          <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              className="text-[var(--fg-faint)] hover:text-destructive transition-colors p-0.5 rounded"
                              onClick={(e) => e.stopPropagation()}
                              title="Delete"
                            >
                              <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Task?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete &quot;{task.title}&quot;? This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteTask(task.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}

                  {/* New task shortcut on To Do column */}
                  {key === "PENDING" && (
                    <button
                      className="w-full text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)] border border-dashed border-[var(--blue-010)] hover:border-[var(--blue-035)] rounded-lg py-2 transition-colors mt-1"
                      onClick={openCreateDialog}
                    >
                      + New task
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Task Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>Add a new task for your team</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {formError && (
              <Alert className="bg-destructive/10 border-destructive/20">
                <AlertDescription className="text-destructive">{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Set up stage for performance"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Task details..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                disabled={isSubmitting}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: string) =>
                    setFormData({ ...formData, priority: value as "LOW" | "MEDIUM" | "HIGH" | "URGENT" })
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category || "none"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, category: value === "none" ? "" : value })
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {TASK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assignee">Assign To Role</Label>
              <Select
                value={formData.selectedRoleId || "unassigned"}
                onValueChange={(value) =>
                  setFormData({ ...formData, selectedRoleId: value === "unassigned" ? "" : value })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {roles.length === 0 ? (
                    <SelectItem value="no-roles" disabled>
                      No roles available
                    </SelectItem>
                  ) : (
                    roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date (Optional)</Label>
              <Input
                id="dueDate"
                type="datetime-local"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>Update task details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {formError && (
              <Alert className="bg-destructive/10 border-destructive/20">
                <AlertDescription className="text-destructive">{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-title">Task Title *</Label>
              <Input
                id="edit-title"
                placeholder="e.g., Set up stage for performance"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                placeholder="Task details..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: string) =>
                    setFormData({ ...formData, priority: value as "LOW" | "MEDIUM" | "HIGH" | "URGENT" })
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category (optional)</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData({ ...formData, category: value })
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="edit-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {TASK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Assign to Role (optional)</Label>
              <Select
                value={formData.selectedRoleId}
                onValueChange={(value) =>
                  setFormData({ ...formData, selectedRoleId: value })
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-due-date">Due Date (optional)</Label>
              <Input
                id="edit-due-date"
                type="date"
                value={formData.dueDate}
                onChange={(e) =>
                  setFormData({ ...formData, dueDate: e.target.value })
                }
                disabled={isSubmitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleEditTask} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </VenueLayoutClient>
  )
}
