"use client"

import { useState } from "react"
import { CheckCircle2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

interface Task {
  id: string
  title: string
  dueDate?: string | null
  priority?: string | null
}

export function OverviewTasks({ tasks, venueSlug }: { tasks: Task[]; venueSlug: string }) {
  const [done, setDone] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setDone(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const open = tasks.filter(t => !done.has(t.id))

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <span className="stat-label">Open tasks</span>
        <span className="text-xs text-muted-foreground">{open.length} open</span>
      </div>
      {tasks.map(t => {
        const checked = done.has(t.id)
        return (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            className={cn(
              "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
              "hover:bg-[var(--blue-007)] border border-transparent hover:border-[var(--blue-008)]",
              checked && "opacity-50"
            )}
          >
            {checked
              ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[var(--success-text)]" />
              : <Circle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            }
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm", checked && "line-through text-muted-foreground")}>{t.title}</p>
              {t.dueDate && !checked && (
                <p className="text-xs text-muted-foreground mt-0.5">Due {t.dueDate}</p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
